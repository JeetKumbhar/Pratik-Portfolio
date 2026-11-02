import { createHmac, timingSafeEqual } from 'node:crypto';

/** Pure helpers for WhatsApp's webhook: checking who is calling, and reading what they send. */

/**
 * Meta signs every webhook call: header "X-Hub-Signature-256: sha256=<hex>" = HMAC-SHA256 of the RAW body with your App Secret.
 * Without a valid signature the request is fake and must be ignored.
 */
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !Buffer.isBuffer(rawBody) || typeof header !== 'string') return false;
  const [scheme, hex] = header.split('=');
  if (scheme !== 'sha256' || !/^[a-f0-9]{64}$/i.test(hex ?? '')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(hex, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Constant-time comparison for the one-time "verify token" handshake */
export function safeEqual(a, b) {
  const x = createHmac('sha256', 'cmp').update(String(a ?? '')).digest();
  const y = createHmac('sha256', 'cmp').update(String(b ?? '')).digest();
  return timingSafeEqual(x, y);
}

const normalizeWord = (text) => String(text ?? '').trim().toLowerCase().replace(/[.!\s]+$/g, '');
const STOP_WORDS = ['stop', 'stop all', 'unsubscribe', 'opt out', 'optout'];
const START_WORDS = ['start', 'subscribe', 'opt in', 'optin', 'unstop'];
export const isStopWord = (text) => STOP_WORDS.includes(normalizeWord(text));
export const isStartWord = (text) => START_WORDS.includes(normalizeWord(text));

const MAX_TEXT = 4096; // WhatsApp's own limit for a text message
const MAX_NAME = 100;
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, MAX_NAME) || null : null);

/**
 * ONE entry of value.messages → { id, from, name, type, text, at } or null when it cannot be trusted.
 *   id    WhatsApp's message id ("wamid..."), used later to ignore duplicate deliveries
 *   from  the sender's number: digits with country code ("919876543210")
 *   name  the sender's WhatsApp profile name, or null (taken from value.contacts, matched by wa_id)
 *   type  'text', 'image', 'audio', 'reaction' ... (anything WhatsApp sends)
 *   text  the message text for type 'text'; null for every other type (they carry no text we store yet)
 *   at    when the customer sent it (Date), or null
 * Nothing here touches the database.
 */
function parseIncoming(m, contacts) {
  if (typeof m?.id !== 'string' || !m.id || typeof m.from !== 'string' || typeof m.type !== 'string') return null;
  const from = m.from.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(from)) return null; // not a usable international number

  const contact = Array.isArray(contacts) ? contacts.find((c) => typeof c?.wa_id === 'string' && c.wa_id.replace(/\D/g, '') === from) : null;
  const seconds = Number(m.timestamp);
  const at = m.timestamp && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
  const body = m.type === 'text' && typeof m.text?.body === 'string' ? m.text.body : null;

  return {
    id: m.id,
    from,
    name: cleanName(contact?.profile?.name),
    type: m.type,
    text: body === null ? null : body.slice(0, MAX_TEXT),
    at,
  };
}

/**
 * The webhook body → what we care about:
 *   statuses: [{ id, status: 'sent'|'delivered'|'read'|'failed', at: Date|null, error }]   (delivery reports for messages we sent)
 *   optOuts:  ['919876543210']    people who texted STOP
 *   optIns:   ['919876543210']    people who texted START
 *   incoming: [{ id, from, name, type, text, at }]   every message a customer sent us (see parseIncoming). STOP / START
 *             messages appear here too: they are also messages. Nothing stores or acts on this list yet.
 */
export function parseWebhook(payload) {
  const out = { statuses: [], optOuts: [], optIns: [], incoming: [] };
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') continue;
      const value = change.value ?? {};

      for (const s of value.statuses ?? []) {
        if (typeof s?.id !== 'string' || typeof s?.status !== 'string') continue;
        const err = s.errors?.[0];
        out.statuses.push({
          id: s.id,
          status: s.status,
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000) : null,
          error: err ? String(err.title || err.message || `error ${err.code ?? ''}`).slice(0, 200) : '',
        });
      }

      for (const m of value.messages ?? []) {
        const incoming = parseIncoming(m, value.contacts);
        if (incoming) out.incoming.push(incoming);

        // STOP / START handling below is unchanged
        if (m?.type !== 'text' || typeof m.from !== 'string') continue;
        const phone = m.from.replace(/\D/g, '');
        if (isStopWord(m.text?.body)) out.optOuts.push(phone);
        else if (isStartWord(m.text?.body)) out.optIns.push(phone);
      }
    }
  }
  return out;
}

const RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * A delivery report arrives → what should the notification's status become? (null = leave it alone)
 * Reports can arrive out of order or twice, so a status only ever moves FORWARD (sent → delivered → read),
 * and a late "failed" never overwrites something that was already delivered.
 */
export function applyStatus(current, incoming) {
  if (incoming === 'failed') return current === 'failed' || RANK[current] >= RANK.delivered ? null : 'failed';
  if (!(incoming in RANK) || incoming === 'pending') return null;
  const now = RANK[current] ?? -1; // failed / skipped rank below everything: a real delivery report wins
  return RANK[incoming] > now ? incoming : null;
}
