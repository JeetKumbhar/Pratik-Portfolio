/**
 * Small pure helpers for the admin Clients screens. No React, no network.
 */

/** "Priya Sharma" → "PS", "Priya" → "P", "+91 98765 43210" → "#" (a phone number is not a name) */
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter((w) => /[\p{L}]/u.test(w));
  if (words.length === 0) return '#';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words.at(-1))[0] : '';
  return `${first}${last}`.toUpperCase();
}

/** A date from the API (ISO text) → "5 Nov 2026". Empty when there is none. */
export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** → "5 Nov 2026, 3:42 pm" */
export function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The inbox screen for one conversation (the existing Admin → Messages → WhatsApp). */
export const conversationPath = (conversationId) => `/admin/messages?source=whatsapp&chat=${encodeURIComponent(conversationId)}`;

export const CLIENT_FILTERS = [
  { value: 'all', label: 'All clients' },
  { value: 'new', label: 'New' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'upcoming', label: 'Upcoming booking' },
  { value: 'none', label: 'No bookings' },
];
export const CLIENT_SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'oldest', label: 'Oldest added' },
  { value: 'lastBooking', label: 'Most recent booking' },
  { value: 'mostBookings', label: 'Most bookings' },
];
export const PAGE_SIZES = [10, 20, 50];
export const DEFAULT_PAGE_SIZE = 20;

export const BOOKING_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const SOURCE_LABELS = { booking: 'Booking form', whatsapp: 'WhatsApp', manual: 'Added manually' };
export const sourceLabel = (source) => SOURCE_LABELS[source] ?? 'Unknown';
export const typeLabel = (type) => (type === 'repeat' ? 'Repeat' : 'New');

/** Pick a value from a list of allowed values, or the fallback (used for URL parameters, which anybody can edit). */
export const oneOf = (value, list, fallback) => (list.some((i) => (i.value ?? i) === value) ? value : fallback);

/** A short sentence about the last WhatsApp message's direction */
export const directionLabel = (direction) => (direction === 'outgoing' ? 'You replied' : direction === 'incoming' ? 'Customer wrote' : '');

export const NOTE_MAX = 2000;
