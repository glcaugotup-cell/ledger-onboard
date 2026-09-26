import axios from 'axios';

/**
 * Shared axios instance used by every resource API client. Adds the
 * Authorization header and unwraps the backend's { success, data, error }
 * envelope into the data or a thrown ApiClientError.
 */

export class ApiClientError extends Error {
  constructor(message, code, statusCode, details) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Backend origin, e.g. https://ledger-onboard-backend.onrender.com (set via
 * VITE_API_URL at build time). Empty in local dev, where Vite proxies /api and
 * /uploads to the Express server.
 */
export const API_ORIGIN = normalizeApiOrigin(import.meta.env.VITE_API_URL);

/** Accepts "https://host", "https://host/" or "https://host/api" and returns "https://host". */
export function normalizeApiOrigin(value) {
  return (value || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

/** Resolves a backend-served path such as /uploads/properties/x.jpg against API_ORIGIN. */
export function mediaUrl(path) {
  if (!path || /^(https?:|blob:|data:)/.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

/**
 * The free Render backend sleeps when idle and takes about 50 seconds to wake
 * up, so the first request after a quiet period needs well over that.
 */
export const REQUEST_TIMEOUT_MS = 70000;

/** How long a request may run before the "server is waking up" notice shows. */
export const SLOW_REQUEST_MS = 5000;

/**
 * Config for multipart uploads: no time limit, since sending photos or a video
 * on a slow connection can take minutes, and no wake-up notice, since a slow
 * upload is not a sleeping server.
 */
export const UPLOAD_CONFIG = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0, longRunning: true };

const instance = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: false, // auth is via Bearer token, not cookies
  timeout: REQUEST_TIMEOUT_MS,
});

let accessToken = null;

/** Called by AuthContext whenever the token changes (login/logout/refresh). */
export function setAccessToken(token) {
  accessToken = token;
}

// Number of in-flight requests that have passed SLOW_REQUEST_MS; ServerWakeNotice listens.
let slowRequests = 0;
const slowListeners = new Set();

function changeSlowRequests(delta) {
  slowRequests += delta;
  for (const listener of slowListeners) listener(slowRequests > 0);
}

export function isServerSlow() {
  return slowRequests > 0;
}

/** Calls `listener(isSlow)` whenever that changes; returns an unsubscribe function. */
export function onServerSlowChange(listener) {
  slowListeners.add(listener);
  return () => {
    slowListeners.delete(listener);
  };
}

function trackSlow(config) {
  if (config.longRunning) return;
  config.slowTimer = setTimeout(() => {
    config.slowCounted = true;
    changeSlowRequests(1);
  }, SLOW_REQUEST_MS);
}

function settleSlow(config) {
  if (!config) return;
  clearTimeout(config.slowTimer);
  if (config.slowCounted) {
    config.slowCounted = false;
    changeSlowRequests(-1);
  }
}

instance.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  trackSlow(config);
  return config;
});

instance.interceptors.response.use(
  (response) => {
    settleSlow(response.config);
    return response;
  },
  (error) => {
    settleSlow(error.config);
    if (error.response) {
      const { status, data } = error.response;
      // Errors that never reached the backend (proxy or gateway pages) lack the
      // standard envelope, so fall back to a message that describes the failure type.
      const envelope = data && typeof data === 'object' ? data : null;
      const message =
        envelope?.error?.message ||
        (status >= 500
          ? 'The server ran into a problem handling that request. Please try again in a moment.'
          : 'Something went wrong with that request. Please try again.');
      const code = envelope?.error?.code || 'UNKNOWN_ERROR';
      const details = envelope?.error?.details;
      return Promise.reject(new ApiClientError(message, code, status, details));
    }
    // Browsers also report a plain abort as ECONNABORTED, so check the message too.
    if (error.code === 'ETIMEDOUT' || (error.code === 'ECONNABORTED' && /timeout/i.test(error.message || ''))) {
      return Promise.reject(new ApiClientError('The server took too long to respond. Please try again.', 'TIMEOUT'));
    }
    if (error.request) {
      return Promise.reject(new ApiClientError('Unable to reach the server. Check your connection.', 'NETWORK_ERROR'));
    }
    return Promise.reject(new ApiClientError(error.message, 'CLIENT_ERROR'));
  }
);

/** Base class every resource client (PropertyApi, ReservationApi, ...) extends. */
export class BaseApiClient {
  constructor(http = instance) {
    this.http = http;
  }

  async get(url, config) {
    const res = await this.http.get(url, config);
    return res.data.data;
  }

  async post(url, body, config) {
    const res = await this.http.post(url, body, config);
    return res.data.data;
  }

  async patch(url, body, config) {
    const res = await this.http.patch(url, body, config);
    return res.data.data;
  }

  async delete(url, config) {
    const res = await this.http.delete(url, config);
    return res.data.data;
  }
}

export default instance;
