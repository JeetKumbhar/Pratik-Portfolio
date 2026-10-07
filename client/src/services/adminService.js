import api from './api';

/** Admin-only calls. `token` is the admin JWT from useAuth(); the backend verifies it (and the admin role) on every request. */

/** GET /api/bookings/stats → { total, upcoming, pending, confirmed, completed, cancelled, revenue:{total,thisMonth}, next:[…] } */
export const getBookingStats = (token) => api.get('/bookings/stats', { token }).then((r) => r.data);

/** GET /api/bookings → the newest bookings first */
export const getRecentBookings = (token, limit = 6) =>
  api.get('/bookings', { token, params: { limit, sort: '-createdAt' } }).then((r) => r.data);

/** GET /api/availability/admin/calendar → one entry per day: { date, label, bookings:[…], blocks:[…] }   (month is 1 to 12) */
export const getAdminCalendar = (token, year, month) =>
  api.get('/availability/admin/calendar', { token, params: { year, month } }).then((r) => r.data);
