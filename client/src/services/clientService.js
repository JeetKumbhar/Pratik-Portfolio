import api from './api';

/**
 * Admin → Clients. `token` is the admin JWT from useAuth(); the backend checks it (and the admin role) on every request.
 * Every function resolves to the useful part of the response and throws an ApiError (see api.js) with a message safe to show.
 */

/** GET /api/clients/stats → { total, newThisMonth, repeat, totalBookings } */
export const getClientStats = (token) => api.get('/clients/stats', { token }).then((r) => r.data);

/**
 * GET /api/clients → the WHOLE response { total, page, pages, count, data:[client rows] }
 * params: { search, filter: all|new|repeat|upcoming|none, sort: recent|oldest|lastBooking|mostBookings, page, limit } (leave out anything empty)
 */
export const getClients = (token, params) => api.get('/clients', { token, params });

/**
 * POST /api/clients → { existing, message?, data: client }
 * existing === true means that phone number already had a client: the EXISTING client comes back and nothing was changed.
 * body: { name, phone, email?, city?, notes? }
 */
export const createClient = (token, body) => api.post('/clients', body, { token });

/** GET /api/clients/:id → the client + summary { totalBookings, upcomingBookings, completedBookings, cancelledBookings, lastBookingAt, type: 'new'|'repeat' } */
export const getClient = (token, id) => api.get(`/clients/${encodeURIComponent(id)}`, { token }).then((r) => r.data);

/**
 * PATCH /api/clients/:id → the updated client. changes: any of { name, phone, email, city }
 * A phone number another client already has is a 409 ApiError with err.data.existing = { id, name }.
 */
export const updateClient = (token, id, changes) => api.patch(`/clients/${encodeURIComponent(id)}`, changes, { token }).then((r) => r.data);

/** GET /api/clients/:id/bookings → { counts: { all, upcoming, completed, cancelled }, data: [{ reference, shootType, packageName, date, time, status, createdAt }] } */
export const getClientBookings = (token, id, filter = 'all') => api.get(`/clients/${encodeURIComponent(id)}/bookings`, { token, params: { filter } });

/** GET /api/clients/:id/whatsapp → { available, conversation: { id, lastMessagePreview, lastMessageAt, lastMessageDirection, unreadCount } | null } */
export const getClientWhatsApp = (token, id) => api.get(`/clients/${encodeURIComponent(id)}/whatsapp`, { token }).then((r) => r.data);

// ---------------------------------------------------------------- private notes
/** GET /api/clients/:id/notes → [{ id, body, authorName, createdAt, editedAt? }] newest first */
export const getClientNotes = (token, id) => api.get(`/clients/${encodeURIComponent(id)}/notes`, { token }).then((r) => r.data);

/** POST /api/clients/:id/notes → the new note */
export const addClientNote = (token, id, body) => api.post(`/clients/${encodeURIComponent(id)}/notes`, { body }, { token }).then((r) => r.data);

/** PATCH /api/clients/:id/notes/:noteId → the edited note */
export const updateClientNote = (token, id, noteId, body) =>
  api.patch(`/clients/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { body }, { token }).then((r) => r.data);

/** DELETE /api/clients/:id/notes/:noteId → permanent */
export const deleteClientNote = (token, id, noteId) => api.delete(`/clients/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { token });
