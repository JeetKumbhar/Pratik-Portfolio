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

/**
 * The webhook body → what we care about:
 *   statuses: [{ id, status: 'sent'|'delivered'|'read'|'failed', at: Date|null, error }]   (delivery reports for messages we sent)
 *   optOuts:  ['919876543210']    people who texted STOP
 *   optIns:   ['919876543210']    people who texted START
 */
export function parseWebhook(payload) {
  const out = { statuses: [], optOuts: [], optIns: [] };
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
