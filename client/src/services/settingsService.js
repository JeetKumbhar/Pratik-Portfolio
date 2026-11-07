import api from './api';

/**
 * Settings, services and account security.
 * PUBLIC (no token): getPublicSettings, getPublicServices.
 * ADMIN (`token` = admin JWT; the backend checks it and the admin role on every call): everything else.
 * Every function resolves to the useful part of the response and throws an ApiError (see api.js) with a message safe to show.
 * Validation problems arrive as err.errors = { 'social.instagram': 'message', ... }.
 */

// ---------------------------------------------------------------- public
/** GET /api/settings/public → { general, business, booking, website, seo } (only what visitors may see) */
export const getPublicSettings = () => api.get('/settings/public').then((r) => r.data);
/** GET /api/services → [{ id, slug, name, description, coverImage, sortOrder }] active services in display order */
export const getPublicServices = () => api.get('/services').then((r) => r.data);

// ---------------------------------------------------------------- admin: settings
/** GET /api/settings → { data: { general, business, booking, availability, notifications, website, seo }, options } */
export const getAllSettings = (token) => api.get('/settings', { token });
/** PATCH /api/settings/:group → { data: saved group, warnings? }. Pass the fields of that group. */
export const saveSettingsGroup = (token, group, body) => api.patch(`/settings/${encodeURIComponent(group)}`, body, { token });
/** GET /api/settings/upload-signature → what the browser needs for ONE direct upload to Cloudinary */
export const getBrandingUploadSignature = (token) => api.get('/settings/upload-signature', { token }).then((r) => r.data);

// ---------------------------------------------------------------- admin: services
/** GET /api/services/admin → [{ id, slug, name, description, coverImage:{url,publicId}, active, sortOrder, usage:{bookings,packages} }] */
export const getServicesAdmin = (token) => api.get('/services/admin', { token }).then((r) => r.data);
export const createService = (token, body) => api.post('/services', body, { token }).then((r) => r.data);
export const updateService = (token, id, changes) => api.patch(`/services/${encodeURIComponent(id)}`, changes, { token }).then((r) => r.data);
export const deleteService = (token, id) => api.delete(`/services/${encodeURIComponent(id)}`, { token });
/** PUT /api/services/order  ids = EVERY service id in the new order */
export const reorderServices = (token, ids) => api.put('/services/order', { ids }, { token }).then((r) => r.data);

// ---------------------------------------------------------------- admin: closures (holidays, vacation, fully booked …) on the existing calendar
/** GET /api/blocked-dates?from=&to= → [{ id, date, type, reason, blockedTimes }] */
export const listBlockedDates = (token, params) => api.get('/blocked-dates', { token, params }).then((r) => r.data);

// ---------------------------------------------------------------- admin: WhatsApp
/** GET /api/settings/whatsapp/status[?live=1] → { configured, missing, connection, lastSuccessAt, lastError, templates, ... } (never a secret) */
export const getWhatsAppStatus = (token, live = false) => api.get('/settings/whatsapp/status', { token, params: live ? { live: 1 } : undefined }).then((r) => r.data);
/** POST /api/settings/whatsapp/test → sends ONE sample message to the photographer's own number. Needs confirm. */
export const sendWhatsAppTest = (token) => api.post('/settings/whatsapp/test', { confirm: true }, { token });

// ---------------------------------------------------------------- admin: account & security
export const getAccount = (token) => api.get('/settings/account', { token }).then((r) => r.data);
export const changeEmail = (token, body) => api.patch('/settings/account/email', body, { token });
/** → { message, token }  the new token keeps THIS session signed in; every other session is ended */
export const changePassword = (token, body) => api.patch('/settings/account/password', body, { token });
/** → { message, token } */
export const logoutEverywhere = (token, currentPassword) => api.post('/settings/account/logout-all', { currentPassword }, { token });
