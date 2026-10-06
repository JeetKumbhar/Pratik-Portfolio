import api from './api';

/** POST /api/auth/login → { token, user }.  Throws ApiError (401 wrong details, 429 too many attempts, 0 server down) */
export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password });
  return { token: res.token, user: res.user };
}

/** GET /api/auth/me → the user this token belongs to. The SERVER decides if the token is valid. */
export async function getMe(token) {
  const res = await api.get('/auth/me', { token });
  return res.user;
}
