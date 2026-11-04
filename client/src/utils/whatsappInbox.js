/** Small helpers for the admin WhatsApp inbox. Pure functions, no React (tested by scripts/testInboxUtils.mjs). */

export const REPLY_MAX = 1500; // characters; the server enforces the same limit

export const formatPhone = (phone) => (phone ? `+${phone}` : '');
export const displayName = (conversation) => conversation?.name || formatPhone(conversation?.phone) || 'Unknown';

/** What to show instead of text for messages that are not text (we store the type only: no media is downloaded) */
const TYPE_LABELS = {
  image: 'Photo', audio: 'Voice or audio message', video: 'Video', document: 'Document', location: 'Location',
  sticker: 'Sticker', contacts: 'Contact card', interactive: 'Button or list reply', unknown: 'Unsupported message',
};
export const typeLabel = (type) => TYPE_LABELS[type] ?? TYPE_LABELS.unknown;

const pad = (n) => String(n).padStart(2, '0');
/** The calendar day in the viewer's own time zone: "2026-11-04" */
export const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function dayLabel(iso, now = new Date()) {
  const key = dayKey(iso);
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(new Date(+now - 24 * 3600 * 1000))) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** For the conversation list: a time today, otherwise "Yesterday" or a short date */
export function listTime(iso, now = new Date()) {
  if (!iso) return '';
  const label = dayLabel(iso, now);
  if (label === 'Today') return timeLabel(iso);
  if (label === 'Yesterday') return label;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** [{ key, label, messages }] one group per calendar day, in order */
export function groupByDay(messages, now = new Date()) {
  const groups = [];
  for (const m of messages) {
    const key = dayKey(m.waTimestamp);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.messages.push(m);
    else groups.push({ key, label: dayLabel(m.waTimestamp, now), messages: [m] });
  }
  return groups;
}

/** "5 h 20 min left" until the 24-hour reply window closes (the server stops 1 minute early), or '' when it is closed */
export function windowLeft(expiresAt, now = new Date()) {
  if (!expiresAt) return '';
  const minutes = Math.floor((+new Date(expiresAt) - 60 * 1000 - +now) / 60000);
  if (minutes < 1) return '';
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${minutes % 60} min left` : `${minutes} min left`;
}

/** Delivery state of a reply → short words for screen readers and tooltips */
export const DELIVERY_TEXT = { sending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Not delivered' };

/** One id per reply attempt. The server uses it so a double click or retry can never send the same reply twice. */
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); // 36 characters, letters, digits and hyphens
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
export const isValidRequestId = (id) => /^[A-Za-z0-9_-]{8,64}$/.test(id);

export const charCount = (text) => Array.from(text).length;
