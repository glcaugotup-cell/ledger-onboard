import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import instance, {
  ApiClientError,
  BaseApiClient,
  SLOW_REQUEST_MS,
  isServerSlow,
  mediaUrl,
  normalizeApiOrigin,
  onServerSlowChange,
  setAccessToken,
} from './apiClient.js';

// axios exposes registered interceptors on `interceptors.response.handlers`
// (and `.request.handlers`) — undocumented but stable, and the only way to
// exercise the error-mapping logic without making a real network call.
const responseRejected = instance.interceptors.response.handlers[0].rejected;
const requestFulfilled = instance.interceptors.request.handlers[0].fulfilled;
const responseFulfilled = instance.interceptors.response.handlers[0].fulfilled;

describe('request interceptor', () => {
  afterEach(() => {
    setAccessToken(null);
  });

  it('does not attach an Authorization header when there is no access token', () => {
    const config = requestFulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
    responseFulfilled({ config });
  });

  it('attaches a Bearer token once one has been set', () => {
    setAccessToken('token-123');
    const config = requestFulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer token-123');
    responseFulfilled({ config });
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

  it('maps a request timeout to TIMEOUT', async () => {
    const axiosError = { code: 'ECONNABORTED', message: 'timeout of 70000ms exceeded', request: {} };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({
      message: 'The server took too long to respond. Please try again.',
      code: 'TIMEOUT',
    });
  });

  it('does not report a plain browser abort as a timeout', async () => {
    const axiosError = { code: 'ECONNABORTED', message: 'Request aborted', request: {} };
    await expect(responseRejected(axiosError)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
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

describe('slow-request tracking (server wake-up notice)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a request that runs past SLOW_REQUEST_MS until it succeeds', () => {
    const listener = vi.fn();
    const unsubscribe = onServerSlowChange(listener);
    const config = requestFulfilled({ headers: {} });

    vi.advanceTimersByTime(SLOW_REQUEST_MS - 1);
    expect(isServerSlow()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isServerSlow()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);

    responseFulfilled({ config });
    expect(isServerSlow()).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it('clears the slow state when the request fails', async () => {
    const config = requestFulfilled({ headers: {} });
    vi.advanceTimersByTime(SLOW_REQUEST_MS);
    expect(isServerSlow()).toBe(true);

    await expect(responseRejected({ config, response: { status: 500, data: {} } })).rejects.toBeInstanceOf(ApiClientError);
    expect(isServerSlow()).toBe(false);
  });

  it('never flags a request that finishes quickly, or a long-running upload', () => {
    const quick = requestFulfilled({ headers: {} });
    responseFulfilled({ config: quick });
    const upload = requestFulfilled({ headers: {}, longRunning: true });
    vi.advanceTimersByTime(SLOW_REQUEST_MS * 20);
    expect(isServerSlow()).toBe(false);
    responseFulfilled({ config: upload });
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

describe('API base URL and media URLs (VITE_API_URL unset in tests)', () => {
  it('falls back to the relative /api base used with the Vite dev proxy', () => {
    expect(instance.defaults.baseURL).toBe('/api');
  });

  it('normalizes VITE_API_URL so requests never become //api or /api/api', () => {
    const host = 'https://ledger-onboard-backend.onrender.com';
    for (const v of [host, `${host}/`, `${host}/api`, `${host}/api/`, ` ${host} `]) {
      expect(normalizeApiOrigin(v)).toBe(host);
    }
    expect(normalizeApiOrigin(undefined)).toBe('');
  });

  it('leaves backend-relative media paths relative and passes absolute/blob URLs through', () => {
    expect(mediaUrl('/uploads/properties/a.jpg')).toBe('/uploads/properties/a.jpg');
    expect(mediaUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(mediaUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
    expect(mediaUrl(undefined)).toBeUndefined();
  });
});
