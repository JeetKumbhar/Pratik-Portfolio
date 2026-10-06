/**
 * The one place the frontend talks to the backend.
 *   api.get('/packages')            api.post('/bookings', body)
 *   api.patch(path, body, { token })   api.delete(path, { token })      (token = admin JWT, later)
 * Every failure becomes an ApiError with a message that is safe to show to people.
 * Set the address in client/.env:   VITE_API_URL=http://localhost:5000/api
 */
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, errors) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = could not reach the server at all
    this.errors = errors; // { field: 'message' } for validation errors (400)
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) throw new ApiError(data?.message || `Something went wrong (${res.status}).`, res.status, data?.errors);
  return data;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

export default api;
