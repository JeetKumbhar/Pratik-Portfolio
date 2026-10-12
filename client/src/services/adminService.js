import api from './api';

/** Admin-only calls. `token` is the admin JWT from useAuth(); the backend verifies it (and the admin role) on every request. */

/** GET /api/bookings/stats → { total, upcoming, pending, confirmed, completed, cancelled, revenue:{total,thisMonth}, next:[…] } */
export const getBookingStats = (token) => api.get('/bookings/stats', { token }).then((r) => r.data);

/** GET /api/bookings → the newest bookings first (dashboard) */
export const getRecentBookings = (token, limit = 6) =>
  api.get('/bookings', { token, params: { limit, sort: '-createdAt' } }).then((r) => r.data);

/** GET /api/availability/admin/calendar → one entry per day: { date, label, bookings:[…], blocks:[…] }   (month is 1 to 12) */
export const getAdminCalendar = (token, year, month) =>
  api.get('/availability/admin/calendar', { token, params: { year, month } }).then((r) => r.data);

// ---------------------------------------------------------------- booking management
/**
 * GET /api/bookings with filters → the WHOLE response { total, page, pages, count, data:[…] }
 * params: { status, shootType, search, sort, page, limit }   (leave out anything empty)
 */
export const getBookings = (token, params) => api.get('/bookings', { token, params });

/** GET /api/bookings/:reference → one booking, including the private admin notes */
export const getBooking = (token, reference) => api.get(`/bookings/${encodeURIComponent(reference)}`, { token }).then((r) => r.data);

/** PATCH /api/bookings/:reference → the updated booking. changes: { status } | { adminNotes } | { date, time } … */
export const updateBooking = (token, reference, changes) =>
  api.patch(`/bookings/${encodeURIComponent(reference)}`, changes, { token }).then((r) => r.data);

/** DELETE /api/bookings/:reference → permanent */
export const deleteBooking = (token, reference) => api.delete(`/bookings/${encodeURIComponent(reference)}`, { token });

// ---------------------------------------------------------------- blocked dates (calendar)
/**
 * POST /api/blocked-dates → { created, skipped, conflicts, data }
 * payload: { type, startDate, endDate?, blockedTimes?, reason?, note?, force? }
 * Throws ApiError with status 409 and err.data.conflicts = [{ reference, name, date, time, status }] when bookings are in the way.
 */
export const createBlockedDates = (token, payload) => api.post('/blocked-dates', payload, { token });

/**
 * DELETE /api/blocked-dates/:id → that day (or those hours) become bookable again.   → { removed }
 * scope 'group' also removes every day that was blocked together with it (a whole vacation).
 */
export const deleteBlockedDate = (token, id, scope) =>
  api.delete(`/blocked-dates/${encodeURIComponent(id)}`, { token, ...(scope && { params: { scope } }) });

// ---------------------------------------------------------------- portfolio management
/** GET /api/portfolio/admin → every photo, drafts included, newest first */
export const getPortfolioAdmin = (token) => api.get('/portfolio/admin', { token }).then((r) => r.data);

/** GET /api/portfolio/upload-signature → { cloudName, apiKey, timestamp, folder, allowedFormats, signature } (503 until Cloudinary is set up) */
export const getUploadSignature = (token) => api.get('/portfolio/upload-signature', { token }).then((r) => r.data);

/** POST /api/portfolio → the new photo. payload: { title, category, description?, featured?, isPublished?, image: { url, publicId?, width?, height? } } */
export const createPhoto = (token, payload) => api.post('/portfolio', payload, { token }).then((r) => r.data);

/** PATCH /api/portfolio/:id → the updated photo. changes: title, category, description, alt, featured, isPublished, sortOrder */
export const updatePhoto = (token, id, changes) => api.patch(`/portfolio/${encodeURIComponent(id)}`, changes, { token }).then((r) => r.data);

/** DELETE /api/portfolio/:id → { storageDeleted: true | false | null } (the stored file is removed too) */
export const deletePhoto = (token, id) => api.delete(`/portfolio/${encodeURIComponent(id)}`, { token });
