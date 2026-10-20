import api from './api';

/**
 * Sends the contact form to the backend: POST /api/messages → MongoDB → Admin → Messages.
 * payload = { name, email, phone, subject, message }
 * Throws ApiError: 400 = invalid details, 429 = too many messages from this connection, 0 = server unreachable.
 */
export async function sendMessage(payload) {
  return api.post('/messages', payload);
}
