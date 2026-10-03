/**
 * UI-ONLY for now: pretends to send, so you can test the whole form flow.
 *
 * Later, connect the backend:
 *   import api from './api';
 *   export async function sendMessage(payload) {
 *     const { data } = await api.post('/messages', payload);   // POST /api/messages
 *     return data;
 *   }
 * payload = { name, email, phone, subject, message }
 */
export async function sendMessage(payload) {
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (import.meta.env.DEV) console.info('[contact] UI-only, message not sent:', payload);
  return { success: true };
}
