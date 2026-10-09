import axios from 'axios';

/**
 * The one place the frontend talks to the backend (Axios).
 *   api.get('/packages')                     api.post('/bookings', body)
 *   api.patch(path, body, { token })         api.delete(path, { token })      (token = admin JWT, for the Admin panel later)
 *
 * Every call resolves to the response BODY ({ success, data, ... }) and every failure is an ApiError whose
 * message is safe to show to people (status 0 = server unreachable, 409 = slot just taken, 400 = invalid data).
 * Set the server address in client/.env:   VITE_API_URL=http://localhost:5000/api
 */
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, errors, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors; // { field: 'message' } for validation errors
    this.data = data; // the whole response body (e.g. { conflicts: [...] })
  }
}

// AuthContext registers a function here; it is called when a LOGGED-IN request is answered with 401 (token expired)
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const client = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    if (error.response) {
      const { status, data } = error.response;
      if (status === 401 && error.config?.authed) onUnauthorized?.(); // a plain failed login has no token, so it never triggers this
      return Promise.reject(new ApiError(data?.message || `Something went wrong (${status}).`, status, data?.errors, data));
    }
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new ApiError('The server took too long to respond. Please try again.', 0));
    }
    return Promise.reject(new ApiError("Can't reach the server. Check your connection and try again.", 0));
  }
);

const auth = (token) => (token ? { authed: true, headers: { Authorization: `Bearer ${token}` } } : {});

export const api = {
  get: (path, options = {}) => client.get(path, { params: options.params, ...auth(options.token) }),
  post: (path, body, options = {}) => client.post(path, body, auth(options.token)),
  patch: (path, body, options = {}) => client.patch(path, body, auth(options.token)),
  delete: (path, options = {}) => client.delete(path, auth(options.token)),
};

export default api;
