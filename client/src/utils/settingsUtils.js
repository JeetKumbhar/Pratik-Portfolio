/**
 * Small pure helpers for the Admin → Settings screens. No React, no network (so they can be tested with plain Node).
 */

/** The nine sections, in order. `group` = the API group a section saves to (services and account have their own endpoints). */
export const SECTIONS = [
  { key: 'general', label: 'General', blurb: 'Website name, logo, currency, timezone and formats.' },
  { key: 'business', label: 'Business', blurb: 'Contact details, address and social links.' },
  { key: 'booking', label: 'Booking', blurb: 'When and how customers can book.' },
  { key: 'services', label: 'Services', blurb: 'The kinds of photography you offer.' },
  { key: 'availability', label: 'Availability', blurb: 'Working hours, holidays and special days.' },
  { key: 'notifications', label: 'Notifications', blurb: 'WhatsApp connection and which messages are sent.' },
  { key: 'website', label: 'Website', blurb: 'Which sections visitors see.' },
  { key: 'seo', label: 'SEO & Social', blurb: 'How the site appears in search and when shared.' },
  { key: 'account', label: 'Account & Security', blurb: 'Your email, password and sessions.' },
];
export const sectionKeyOf = (value) => (SECTIONS.some((s) => s.key === value) ? value : SECTIONS[0].key);

export const WEEKDAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

// ---------------------------------------------------------------- comparing drafts with what is saved
const stable = (v) => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
};
/** Deep equality for plain settings data (key order does not matter) */
export const isEqual = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/** Set a value deep inside a copy: setIn(draft, 'social.instagram', 'x') → new object, original untouched */
export function setIn(obj, path, value) {
  const keys = Array.isArray(path) ? path : String(path).split('.');
  const [head, ...rest] = keys;
  if (head === '__proto__' || head === 'constructor' || head === 'prototype') return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copy[head] = rest.length ? setIn(obj?.[head] ?? {}, rest, value) : value;
  return copy;
}

/** Remove the error of one field (and of the fields below it) after the admin edits it */
export const withoutError = (errors, path) => Object.fromEntries(Object.entries(errors).filter(([k]) => k !== path && !k.startsWith(`${path}.`)));

/** An ApiError → { fields: { 'social.instagram': 'message' }, message } . Messages are the server's: they are written for people. */
export function errorsFrom(err) {
  const fields = err?.errors && typeof err.errors === 'object' ? err.errors : {};
  const first = Object.values(fields)[0];
  return { fields, message: Object.keys(fields).length ? `Please fix the highlighted ${Object.keys(fields).length === 1 ? 'field' : 'fields'}: ${first}` : err?.message || 'Something went wrong.' };
}

// ---------------------------------------------------------------- working hours
export const FIRST_HOUR = 7;
export const LAST_END_HOUR = 22;
export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
export const START_HOURS = Array.from({ length: LAST_END_HOUR - FIRST_HOUR }, (_, i) => hourLabel(FIRST_HOUR + i)); // 07:00 … 21:00
export const END_HOURS = Array.from({ length: LAST_END_HOUR - FIRST_HOUR }, (_, i) => hourLabel(FIRST_HOUR + 1 + i)); // 08:00 … 22:00
const hourOf = (t) => Number(String(t).slice(0, 2));

/** A message when the periods of one day are wrong, '' when fine. Mirrors the server's rules so the admin sees it before saving. */
export function periodsProblem(periods, { maxPeriods = 4 } = {}) {
  if (!Array.isArray(periods)) return 'Working hours are not valid.';
  if (periods.length > maxPeriods) return `Use at most ${maxPeriods} working periods in a day.`;
  const list = [];
  for (const p of periods) {
    const from = hourOf(p?.start);
    const to = hourOf(p?.end);
    if (!START_HOURS.includes(p?.start) || !END_HOURS.includes(p?.end)) return 'Times must be whole hours between 07:00 and 22:00.';
    if (to <= from) return 'Each period must end after it starts.';
    list.push([from, to]);
  }
  list.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < list.length; i += 1) if (list[i][0] < list[i - 1][1]) return 'Working periods in one day cannot overlap.';
  return '';
}

/** The next free period to offer when "Add hours" is pressed: starts where the last one ends (or 09:00) and lasts up to 3 hours */
export function nextPeriod(periods = []) {
  const lastEnd = periods.reduce((max, p) => Math.max(max, hourOf(p.end)), 0);
  const start = lastEnd ? Math.min(lastEnd + 1, LAST_END_HOUR - 1) : 9;
  return { start: hourLabel(start), end: hourLabel(Math.min(start + 3, LAST_END_HOUR)) };
}

/** "09:00 – 12:00 · 14:00 – 18:00", or "Closed" */
export const describeDay = (day) => (day?.enabled && day.periods?.length ? day.periods.map((p) => `${p.start} – ${p.end}`).join(' · ') : 'Closed');

/** Copy one weekday's schedule onto others: returns the new weekly object */
export function copyDay(weekly, from, targets) {
  const source = weekly[from];
  const next = { ...weekly };
  for (const t of targets) if (t !== from && weekly[t]) next[t] = { enabled: source.enabled, periods: source.periods.map((p) => ({ ...p })) };
  return next;
}

// ---------------------------------------------------------------- images
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_MB = 5;
/** A message when the chosen file cannot be used, '' when it can */
export function imageProblem(file) {
  if (!file) return 'Choose an image.';
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `The image is larger than ${MAX_IMAGE_MB} MB. Choose a smaller one.`;
  return '';
}

// ---------------------------------------------------------------- small formatters
export const countryDigits = (value) => String(value ?? '').replace(/\D/g, '');
/** 'Asia/Kolkata' is shown with its current offset, e.g. "Asia/Kolkata (UTC+5:30)" */
export function timezoneLabel(tz, now = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value;
    return part ? `${tz} (${part.replace('GMT', 'UTC')})` : tz;
  } catch { return tz; }
}
/** The timezones this browser knows, with the current one always present */
export function timezoneOptions(current) {
  let list = [];
  try { list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []; } catch { list = []; }
  if (!list.length) list = ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'];
  if (current && !list.includes(current)) list = [current, ...list];
  return list;
}

/** Which weekdays are 'closed' etc. → a short summary for the section header */
export const weeklySummary = (weekly = {}) => Object.values(weekly).filter((d) => d?.enabled).length;
