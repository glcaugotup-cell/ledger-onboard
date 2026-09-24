import { afterEach, describe, expect, it, vi } from 'vitest';
import instance, { ApiClientError, BaseApiClient, setAccessToken } from './apiClient.js';

// axios exposes registered interceptors on `interceptors.response.handlers`
// (and `.request.handlers`) — undocumented but stable, and the only way to
// exercise the error-mapping logic without making a real network call.
const responseRejected = instance.interceptors.response.handlers[0].rejected;
const requestFulfilled = instance.interceptors.request.handlers[0].fulfilled;

describe('request interceptor', () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it('does not attach an Authorization header when there is no access token', () => {
    const config = requestFulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('attaches a Bearer token once one has been set', () => {
    setAccessToken('token-123');
    const config = requestFulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer token-123');
  });
});

describe('response error interceptor', () => {
  it('maps a server error envelope to an ApiClientError', async () => {
    const axiosError = {
      response: {
        status: 422,
        data: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid phone', details: [{ field: 'phone', message: 'bad' }] } },
      },
    };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Invalid phone',
      code: 'VALIDATION_ERROR',
      statusCode: 422,
      details: [{ field: 'phone', message: 'bad' }],
    });
  });

  it('falls back to a server-problem message (not the generic "Request failed") for a 5xx with no envelope', async () => {
    const axiosError = { response: { status: 500, data: {} } };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'The server ran into a problem handling that request. Please try again in a moment.',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    });
  });

  it('falls back to a client-problem message for a non-5xx with no envelope', async () => {
    const axiosError = { response: { status: 400, data: {} } };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'Something went wrong with that request. Please try again.',
      code: 'UNKNOWN_ERROR',
      statusCode: 400,
    });
  });

  it('does not mistake a non-JSON error page (e.g. a dev proxy or load balancer error page) for the real envelope', async () => {
    const axiosError = { response: { status: 502, data: '<html>Bad Gateway</html>' } };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'The server ran into a problem handling that request. Please try again in a moment.',
      code: 'UNKNOWN_ERROR',
      statusCode: 502,
    });
  });

  it('maps a no-response network error to NETWORK_ERROR', async () => {
    const axiosError = { request: {} };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'Unable to reach the server. Check your connection.',
      code: 'NETWORK_ERROR',
    });
  });

  it('maps any other error to CLIENT_ERROR', async () => {
    const axiosError = { message: 'Something exploded' };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'Something exploded',
      code: 'CLIENT_ERROR',
    });
  });
});

describe('BaseApiClient', () => {
  function makeClientWithFakeHttp() {
    const http = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    return { client: new BaseApiClient(http), http };
  }

  it('unwraps res.data.data on get/post/patch/delete', async () => {
    const { client, http } = makeClientWithFakeHttp();
    const payload = { id: '1' };
    http.get.mockResolvedValue({ data: { data: payload } });
    http.post.mockResolvedValue({ data: { data: payload } });
    http.patch.mockResolvedValue({ data: { data: payload } });
    http.delete.mockResolvedValue({ data: { data: payload } });

    await expect(client.get('/x')).resolves.toBe(payload);
    await expect(client.post('/x', { a: 1 })).resolves.toBe(payload);
    await expect(client.patch('/x', { a: 1 })).resolves.toBe(payload);
    await expect(client.delete('/x')).resolves.toBe(payload);

    expect(http.get).toHaveBeenCalledWith('/x', undefined);
    expect(http.post).toHaveBeenCalledWith('/x', { a: 1 }, undefined);
    expect(http.patch).toHaveBeenCalledWith('/x', { a: 1 }, undefined);
    expect(http.delete).toHaveBeenCalledWith('/x', undefined);
  });

  it('defaults to the shared axios instance when no http is injected', () => {
    const client = new BaseApiClient();
    expect(client.http).toBe(instance);
  });
});

describe('ApiClientError', () => {
  it('carries message, code, statusCode, and details', () => {
    const err = new ApiClientError('bad', 'CODE', 400, [{ field: 'x', message: 'y' }]);
    expect(err.name).toBe('ApiClientError');
    expect(err.message).toBe('bad');
    expect(err.code).toBe('CODE');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual([{ field: 'x', message: 'y' }]);
  });
});
