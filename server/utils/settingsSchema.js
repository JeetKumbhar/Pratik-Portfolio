import { randomBytes } from 'node:crypto';
import { BOOKING_RULES, SETTINGS_GROUPS, WEEKDAYS } from '../config/constants.js';
import { isDateKey, isEmail, isPhone } from './validators.js';
import { FIRST_HOUR, LAST_END_HOUR, wholeHour } from './schedule.js';
import { isOwnBrandingImage } from './imageStorage.js';

/**
 * Everything about the SETTINGS DOCUMENT's shape, in one pure file (no database, no network):
 *   buildDefaults()          the values used when nothing has been saved yet. They reproduce how the site behaved BEFORE the
 *                            Settings section existed, so nothing changes until the admin edits something.
 *   mergeStored(doc)         saved groups laid over the defaults, so a missing or half-filled document is always safe
 *   normalizeGroup(...)      validates + cleans one group from a request (unknown keys are ignored, wrong types are errors)
 *   toPublic(settings)       the only fields a visitor of the website may see
 *
 * Validation errors are thrown as 400s with { fieldErrors: { 'social.instagram': 'message' } }, which the error middleware
 * already turns into { success:false, message, errors }.
 */

export const OPTIONS = {
  currencies: [
    { value: 'INR', label: 'Indian Rupee (₹)' }, { value: 'USD', label: 'US Dollar ($)' }, { value: 'EUR', label: 'Euro (€)' },
    { value: 'GBP', label: 'British Pound (£)' }, { value: 'AED', label: 'UAE Dirham (AED)' }, { value: 'AUD', label: 'Australian Dollar (A$)' },
    { value: 'CAD', label: 'Canadian Dollar (C$)' }, { value: 'SGD', label: 'Singapore Dollar (S$)' },
  ],
  dateFormats: [
    { value: 'D MMM YYYY', label: '5 Nov 2026' }, { value: 'DD/MM/YYYY', label: '05/11/2026' },
    { value: 'MM/DD/YYYY', label: '11/05/2026' }, { value: 'YYYY-MM-DD', label: '2026-11-05' },
  ],
  timeFormats: [{ value: '12h', label: '12-hour (3:30 pm)' }, { value: '24h', label: '24-hour (15:30)' }],
};
const CURRENCIES = OPTIONS.currencies.map((o) => o.value);
const DATE_FORMATS = OPTIONS.dateFormats.map((o) => o.value);
const TIME_FORMATS = OPTIONS.timeFormats.map((o) => o.value);

export const LIMITS = {
  maxAdvanceDays: BOOKING_RULES.maxAdvanceDays,
  maxBufferHours: 4,
  maxPeriodsPerDay: 4,
  maxSpecialDays: 100,
  maxDurationHours: 12,
};

export const NOTIFICATION_EVENT_KEYS = ['new_booking_admin', 'booking_received_customer', 'booking_confirmed_customer', 'booking_cancelled_customer', 'new_message_admin'];

const EMPTY_IMAGE = () => ({ url: '', publicId: '' });
const dayDefaults = () => ({ enabled: true, periods: [{ start: `${String(FIRST_HOUR).padStart(2, '0')}:00`, end: `${LAST_END_HOUR}:00` }] });

/** Defaults. `env` is a parameter only so tests can control it. */
export function buildDefaults(env = process.env) {
  return {
    general: {
      websiteName: 'Pratik Shelke Photography',
      photographerName: 'Pratik Shelke',
      logo: EMPTY_IMAGE(),
      favicon: EMPTY_IMAGE(),
      currency: 'INR',
      countryCode: '91',
      timezone: env.BUSINESS_TIMEZONE || 'Asia/Kolkata',
      dateFormat: 'D MMM YYYY',
      timeFormat: '12h',
    },
    business: {
      businessName: 'Pratik Shelke Photography',
      primaryPhone: '+91 84467 41308',
      whatsappNumber: '+91 84467 41308',
      email: 'pratik1238737@gmail.com',
      address: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
      mapsUrl: '',
      social: {
        instagram: 'https://www.instagram.com/pratikshelke_photography',
        facebook: '',
        youtube: '',
      },
    },
    booking: {
      enabled: true,
      disabledMessage: 'Online bookings are temporarily closed. Please contact us directly and we will help you.',
      allowSameDay: false,
      minAdvanceDays: 1,
      maxAdvanceDays: BOOKING_RULES.maxAdvanceDays,
      bufferHours: 0,
      customDurationHours: 2,
      phoneRequired: true,
      emailRequired: true,
      locationRequired: true,
      allowNotes: true,
      confirmationMessage: '',
    },
    availability: {
      weekly: Object.fromEntries(WEEKDAYS.map((d) => [d, dayDefaults()])),
      specialDays: [],
    },
    notifications: {
      events: Object.fromEntries(NOTIFICATION_EVENT_KEYS.map((k) => [k, true])),
    },
    website: {
      home: { featuredWork: true, services: true, aboutPreview: true, testimonials: true, contactCta: true },
      portfolio: { enabled: true },
      contact: { enabled: true, ctaText: '' },
    },
    seo: {
      title: 'Pratik Shelke - Photography',
      description: '',
      keywords: '',
      ogImage: EMPTY_IMAGE(),
      shareTitle: '',
      shareDescription: '',
      canonicalUrl: '',
    },
  };
}

// ---------------------------------------------------------------------- merging saved values over defaults
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Keep only keys the defaults know, with the same kind of value; anything else falls back to the default. */
function overlay(defaults, stored) {
  if (!isObject(defaults)) return defaults;
  const out = {};
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const s = isObject(stored) ? stored[key] : undefined;
    if (isObject(d)) out[key] = overlay(d, s);
    else if (Array.isArray(d)) out[key] = Array.isArray(s) ? JSON.parse(JSON.stringify(s)) : d;
    else out[key] = s !== undefined && s !== null && typeof s === typeof d ? s : d;
  }
  return out;
}

/** The settings document (or null / half-filled) → complete settings. Never throws. */
export function mergeStored(doc, env = process.env) {
  const defaults = buildDefaults(env);
  return Object.fromEntries(SETTINGS_GROUPS.map((g) => [g, overlay(defaults[g], doc?.[g])]));
}

// ---------------------------------------------------------------------- small validation helpers
class Collector {
  constructor() { this.errors = {}; }
  add(field, message) { if (!(field in this.errors)) this.errors[field] = message; }
  get any() { return Object.keys(this.errors).length > 0; }
  done() {
    if (this.any) throw Object.assign(new Error('Validation failed'), { statusCode: 400, fieldErrors: this.errors });
  }
}

/** Text with control characters removed and spaces collapsed. Not text at all → undefined. */
const oneLine = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : undefined);
/** Same, but keeps line breaks (for messages) */
const paragraph = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, '').replace(/\n{3,}/g, '\n\n').trim() : undefined);

function text(c, field, value, current, { min = 0, max, label, multiline = false, required = false } = {}) {
  if (value === undefined) return current;
  const v = multiline ? paragraph(value) : oneLine(value);
  if (v === undefined) { c.add(field, `${label} must be text.`); return current; }
  if (required && v.length === 0) { c.add(field, `${label} is required.`); return current; }
  if (v.length && v.length < min) { c.add(field, `${label} must be at least ${min} characters.`); return current; }
  if (v.length > max) { c.add(field, `${label} must be ${max} characters or fewer.`); return current; }
  return v;
}

function bool(c, field, value, current, label) {
  if (value === undefined) return current;
  if (typeof value !== 'boolean') { c.add(field, `${label} must be on or off.`); return current; }
  return value;
}

function int(c, field, value, current, { min, max, label }) {
  if (value === undefined) return current;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) { c.add(field, `${label} must be a whole number from ${min} to ${max}.`); return current; }
  return n;
}

function oneOf(c, field, value, current, list, label) {
  if (value === undefined) return current;
  if (!list.includes(value)) { c.add(field, `${label} must be one of: ${list.join(', ')}.`); return current; }
  return value;
}

/** https URL (optionally on certain hosts). Empty string clears it. */
function url(c, field, value, current, { label, hosts } = {}) {
  if (value === undefined) return current;
  const raw = oneLine(value);
  if (raw === undefined) { c.add(field, `${label} must be text.`); return current; }
  if (raw === '') return '';
  let u;
  try { u = new URL(raw); } catch { c.add(field, `${label} must be a full web address starting with https://`); return current; }
  if (u.protocol !== 'https:') { c.add(field, `${label} must start with https://`); return current; }
  if (u.username || u.password) { c.add(field, `${label} must not contain a username or password.`); return current; }
  if (raw.length > 300) { c.add(field, `${label} is too long.`); return current; }
  if (hosts && !hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) { c.add(field, `${label} must be a ${hosts[0]} address.`); return current; }
  return u.href;
}

/** { url, publicId }: must come out of OUR Cloudinary uploader (or be unchanged). Empty clears it. */
function image(c, field, value, current, label) {
  if (value === undefined) return current;
  if (value === null || (isObject(value) && !value.url && !value.publicId)) return EMPTY_IMAGE();
  if (!isObject(value) || typeof value.url !== 'string' || typeof value.publicId !== 'string') { c.add(field, `${label} must be uploaded with the image uploader.`); return current; }
  const same = current && value.url === current.url && value.publicId === current.publicId;
  if (!same && !isOwnBrandingImage({ url: value.url, publicId: value.publicId })) { c.add(field, `${label} must be uploaded with the image uploader.`); return current; }
  return { url: value.url, publicId: value.publicId };
}

const validTimezone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch { return false; } };

// ---------------------------------------------------------------------- groups
const SOCIAL_HOSTS = { instagram: ['instagram.com', 'instagr.am'], facebook: ['facebook.com', 'fb.com', 'fb.me'], youtube: ['youtube.com', 'youtu.be'] };

function general(c, input, cur) {
  const out = { ...cur };
  out.websiteName = text(c, 'websiteName', input.websiteName, cur.websiteName, { min: 2, max: 80, label: 'Website name', required: true });
  out.photographerName = text(c, 'photographerName', input.photographerName, cur.photographerName, { min: 2, max: 80, label: 'Photographer name', required: true });
  out.logo = image(c, 'logo', input.logo, cur.logo, 'The logo');
  out.favicon = image(c, 'favicon', input.favicon, cur.favicon, 'The favicon');
  out.currency = oneOf(c, 'currency', input.currency, cur.currency, CURRENCIES, 'Currency');
  if (input.countryCode !== undefined) {
    const digits = String(input.countryCode).replace(/\D/g, '');
    if (!/^\+?\s*\d{1,3}$/.test(String(input.countryCode).trim()) || !/^[1-9]\d{0,2}$/.test(digits)) c.add('countryCode', 'Enter a country code such as +91.');
    else out.countryCode = digits;
  }
  if (input.timezone !== undefined) {
    if (!validTimezone(input.timezone)) c.add('timezone', 'Choose a valid timezone, for example Asia/Kolkata.');
    else out.timezone = input.timezone;
  }
  out.dateFormat = oneOf(c, 'dateFormat', input.dateFormat, cur.dateFormat, DATE_FORMATS, 'Date format');
  out.timeFormat = oneOf(c, 'timeFormat', input.timeFormat, cur.timeFormat, TIME_FORMATS, 'Time format');
  return out;
}

function phoneField(c, field, value, current, label) {
  if (value === undefined) return current;
  const v = oneLine(value);
  if (v === undefined) { c.add(field, `${label} must be text.`); return current; }
  if (v === '') return '';
  if (!isPhone(v)) { c.add(field, `Enter a valid ${label.toLowerCase()} with the country code, like +91 98765 43210.`); return current; }
  return v;
}

function business(c, input, cur) {
  const out = { ...cur, social: { ...cur.social } };
  out.businessName = text(c, 'businessName', input.businessName, cur.businessName, { min: 2, max: 100, label: 'Business name', required: true });
  out.primaryPhone = phoneField(c, 'primaryPhone', input.primaryPhone, cur.primaryPhone, 'Primary contact number');
  out.whatsappNumber = phoneField(c, 'whatsappNumber', input.whatsappNumber, cur.whatsappNumber, 'WhatsApp business number');
  if (input.email !== undefined) {
    const v = oneLine(input.email);
    if (v === undefined || (v !== '' && !isEmail(v))) c.add('email', 'Enter a valid business email address.');
    else out.email = v.toLowerCase();
  }
  out.address = text(c, 'address', input.address, cur.address, { max: 200, label: 'Studio address' });
  out.city = text(c, 'city', input.city, cur.city, { max: 80, label: 'City' });
  out.state = text(c, 'state', input.state, cur.state, { max: 80, label: 'State' });
  out.country = text(c, 'country', input.country, cur.country, { max: 80, label: 'Country' });
  out.postalCode = text(c, 'postalCode', input.postalCode, cur.postalCode, { max: 12, label: 'Postal code' });
  if (out.postalCode && !/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(out.postalCode)) c.add('postalCode', 'Enter a valid postal code.');
  out.mapsUrl = url(c, 'mapsUrl', input.mapsUrl, cur.mapsUrl, { label: 'Google Maps address', hosts: ['www.google.com', 'maps.google.com', 'www.google.co.in', 'maps.google.co.in', 'goo.gl', 'maps.app.goo.gl', 'g.page'] });
  const social = isObject(input.social) ? input.social : {};
  if (input.social !== undefined && !isObject(input.social)) c.add('social', 'Social links are not valid.');
  for (const key of Object.keys(SOCIAL_HOSTS)) {
    out.social[key] = url(c, `social.${key}`, social[key], cur.social[key], { label: `${key[0].toUpperCase()}${key.slice(1)} link`, hosts: SOCIAL_HOSTS[key] });
  }
  return out;
}

function booking(c, input, cur) {
  const out = { ...cur };
  out.enabled = bool(c, 'enabled', input.enabled, cur.enabled, 'Online bookings');
  out.disabledMessage = text(c, 'disabledMessage', input.disabledMessage, cur.disabledMessage, { max: 300, label: 'The message', multiline: true });
  out.allowSameDay = bool(c, 'allowSameDay', input.allowSameDay, cur.allowSameDay, 'Same-day bookings');
  out.minAdvanceDays = int(c, 'minAdvanceDays', input.minAdvanceDays, cur.minAdvanceDays, { min: 0, max: LIMITS.maxAdvanceDays, label: 'Minimum advance period' });
  out.maxAdvanceDays = int(c, 'maxAdvanceDays', input.maxAdvanceDays, cur.maxAdvanceDays, { min: 1, max: LIMITS.maxAdvanceDays, label: 'Maximum advance period' });
  out.bufferHours = int(c, 'bufferHours', input.bufferHours, cur.bufferHours, { min: 0, max: LIMITS.maxBufferHours, label: 'Buffer time' });
  out.customDurationHours = int(c, 'customDurationHours', input.customDurationHours, cur.customDurationHours, { min: 1, max: LIMITS.maxDurationHours, label: 'Custom-quote duration' });
  out.phoneRequired = bool(c, 'phoneRequired', input.phoneRequired, cur.phoneRequired, 'Phone number required');
  out.emailRequired = bool(c, 'emailRequired', input.emailRequired, cur.emailRequired, 'Email required');
  out.locationRequired = bool(c, 'locationRequired', input.locationRequired, cur.locationRequired, 'Location required');
  out.allowNotes = bool(c, 'allowNotes', input.allowNotes, cur.allowNotes, 'Booking notes');
  out.confirmationMessage = text(c, 'confirmationMessage', input.confirmationMessage, cur.confirmationMessage, { max: 500, label: 'The confirmation message', multiline: true });

  // Same-day and the minimum period are one rule seen two ways: same-day on means "0 days ahead", off means at least tomorrow.
  if (out.allowSameDay) out.minAdvanceDays = 0;
  else out.minAdvanceDays = Math.max(1, out.minAdvanceDays);
  if (out.minAdvanceDays > out.maxAdvanceDays) c.add('maxAdvanceDays', 'The maximum advance period cannot be shorter than the minimum.');
  return out;
}

const HOUR_LABEL = (h) => `${String(h).padStart(2, '0')}:00`;

/** [{start,end}] → cleaned, sorted, checked. Whole hours between 07:00 and 22:00, no overlaps. */
function periods(c, field, value, current, { allowEmpty }) {
  if (value === undefined) return current;
  if (!Array.isArray(value)) { c.add(field, 'Working hours are not valid.'); return current; }
  if (value.length > LIMITS.maxPeriodsPerDay) { c.add(field, `Use at most ${LIMITS.maxPeriodsPerDay} working periods in a day.`); return current; }
  const list = [];
  for (const p of value) {
    const from = wholeHour(p?.start);
    const to = wholeHour(p?.end);
    if (from === null || to === null) { c.add(field, 'Times must be whole hours, like 09:00 or 18:00.'); return current; }
    if (from < FIRST_HOUR || to > LAST_END_HOUR) { c.add(field, `Working hours must be between ${HOUR_LABEL(FIRST_HOUR)} and ${HOUR_LABEL(LAST_END_HOUR)}.`); return current; }
    if (to <= from) { c.add(field, 'Each period must end after it starts.'); return current; }
    list.push([from, to]);
  }
  list.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < list.length; i += 1) {
    if (list[i][0] < list[i - 1][1]) { c.add(field, 'Working periods in one day cannot overlap.'); return current; }
  }
  if (!allowEmpty && list.length === 0) { c.add(field, 'Add at least one working period, or mark the day as unavailable.'); return current; }
  return list.map(([from, to]) => ({ start: HOUR_LABEL(from), end: HOUR_LABEL(to) }));
}

const newId = () => randomBytes(6).toString('hex');

function availability(c, input, cur) {
  const out = { weekly: { ...cur.weekly }, specialDays: cur.specialDays };

  if (input.weekly !== undefined) {
    if (!isObject(input.weekly)) c.add('weekly', 'The weekly schedule is not valid.');
    else {
      for (const day of Object.keys(input.weekly)) {
        if (!WEEKDAYS.includes(day)) { c.add(`weekly.${day}`, 'Unknown day.'); continue; }
        const d = input.weekly[day];
        if (!isObject(d)) { c.add(`weekly.${day}`, 'This day is not valid.'); continue; }
        const enabled = bool(c, `weekly.${day}`, d.enabled, cur.weekly[day].enabled, 'Available');
        const list = periods(c, `weekly.${day}`, d.periods, cur.weekly[day].periods, { allowEmpty: !enabled });
        out.weekly[day] = { enabled, periods: list };
        if (enabled && list.length === 0) c.add(`weekly.${day}`, 'Add at least one working period, or mark the day as unavailable.');
      }
    }
  }

  if (input.specialDays !== undefined) {
    if (!Array.isArray(input.specialDays)) c.add('specialDays', 'Special working days are not valid.');
    else if (input.specialDays.length > LIMITS.maxSpecialDays) c.add('specialDays', `You can keep at most ${LIMITS.maxSpecialDays} special working days.`);
    else {
      const seen = new Set();
      const list = [];
      input.specialDays.forEach((s, i) => {
        const f = (k) => `specialDays.${i}.${k}`;
        if (!isObject(s)) { c.add(`specialDays.${i}`, 'This entry is not valid.'); return; }
        if (!isDateKey(s.date)) { c.add(f('date'), 'Choose a real date.'); return; }
        if (seen.has(s.date)) { c.add(f('date'), 'That date is already listed.'); return; }
        seen.add(s.date);
        const hours = periods(c, f('periods'), s.periods, undefined, { allowEmpty: false });
        const reason = text(c, f('reason'), s.reason ?? '', '', { max: 120, label: 'Reason' });
        const id = typeof s.id === 'string' && /^[a-f0-9]{12}$/.test(s.id) ? s.id : newId();
        if (hours) list.push({ id, date: s.date, periods: hours, reason });
        else if (!c.errors[f('periods')]) c.add(f('periods'), 'Add the working hours for this day.');
      });
      out.specialDays = list.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
  }
  return out;
}

function notifications(c, input, cur) {
  const out = { events: { ...cur.events } };
  if (input.events !== undefined) {
    if (!isObject(input.events)) c.add('events', 'Notification choices are not valid.');
    else {
      for (const key of Object.keys(input.events)) {
        if (!NOTIFICATION_EVENT_KEYS.includes(key)) { c.add(`events.${key}`, 'Unknown notification.'); continue; }
        out.events[key] = bool(c, `events.${key}`, input.events[key], cur.events[key], 'This notification');
      }
    }
  }
  return out;
}

function website(c, input, cur) {
  const out = { home: { ...cur.home }, portfolio: { ...cur.portfolio }, contact: { ...cur.contact } };
  const sub = (name, keys) => {
    if (input[name] === undefined) return;
    if (!isObject(input[name])) { c.add(name, 'These settings are not valid.'); return; }
    for (const k of Object.keys(input[name])) {
      if (!keys.includes(k)) c.add(`${name}.${k}`, 'Unknown setting.');
    }
  };
  sub('home', Object.keys(cur.home));
  sub('portfolio', Object.keys(cur.portfolio));
  sub('contact', Object.keys(cur.contact));
  for (const k of Object.keys(cur.home)) out.home[k] = bool(c, `home.${k}`, input.home?.[k], cur.home[k], 'This option');
  out.portfolio.enabled = bool(c, 'portfolio.enabled', input.portfolio?.enabled, cur.portfolio.enabled, 'The Portfolio page');
  out.contact.enabled = bool(c, 'contact.enabled', input.contact?.enabled, cur.contact.enabled, 'The Contact section');
  out.contact.ctaText = text(c, 'contact.ctaText', input.contact?.ctaText, cur.contact.ctaText, { max: 120, label: 'The call-to-action text' });
  return out;
}

function seo(c, input, cur) {
  const out = { ...cur };
  out.title = text(c, 'title', input.title, cur.title, { max: 70, label: 'The SEO title' });
  out.description = text(c, 'description', input.description, cur.description, { max: 200, label: 'The meta description' });
  out.keywords = text(c, 'keywords', input.keywords, cur.keywords, { max: 200, label: 'Keywords' });
  out.ogImage = image(c, 'ogImage', input.ogImage, cur.ogImage, 'The sharing image');
  out.shareTitle = text(c, 'shareTitle', input.shareTitle, cur.shareTitle, { max: 70, label: 'The sharing title' });
  out.shareDescription = text(c, 'shareDescription', input.shareDescription, cur.shareDescription, { max: 200, label: 'The sharing description' });
  if (input.canonicalUrl !== undefined) {
    const v = url(c, 'canonicalUrl', input.canonicalUrl, cur.canonicalUrl, { label: 'The canonical website address' });
    out.canonicalUrl = v ? v.replace(/\/+$/, '') : '';
  }
  return out;
}

const NORMALIZERS = { general, business, booking, availability, notifications, website, seo };

/**
 * Validate a request body for one group over its current values → the complete new group.
 * Unknown keys are ignored; wrong values throw a 400 with a message per field.
 */
export function normalizeGroup(group, input, current) {
  const fn = NORMALIZERS[group];
  if (!fn) throw Object.assign(new Error('Unknown settings group'), { statusCode: 404 });
  if (!isObject(input)) throw Object.assign(new Error('Send the settings as a JSON object.'), { statusCode: 400 });
  const c = new Collector();
  const out = fn(c, input, current);
  c.done();
  return out;
}

// ---------------------------------------------------------------------- what visitors may see
/** Only what the public website needs. No notification choices, no schedule details, no admin data. */
export function toPublic(s) {
  return {
    general: s.general,
    business: s.business,
    booking: {
      enabled: s.booking.enabled,
      disabledMessage: s.booking.disabledMessage,
      allowSameDay: s.booking.allowSameDay,
      minAdvanceDays: s.booking.minAdvanceDays,
      maxAdvanceDays: s.booking.maxAdvanceDays,
      customDurationHours: s.booking.customDurationHours,
      phoneRequired: s.booking.phoneRequired,
      emailRequired: s.booking.emailRequired,
      locationRequired: s.booking.locationRequired,
      allowNotes: s.booking.allowNotes,
      confirmationMessage: s.booking.confirmationMessage,
    },
    website: s.website,
    seo: s.seo,
  };
}

/** Public images only expose the address, not Cloudinary's internal id */
export function scrubPublic(pub) {
  const strip = (img) => ({ url: img?.url || '' });
  return {
    ...pub,
    general: { ...pub.general, logo: strip(pub.general.logo), favicon: strip(pub.general.favicon) },
    seo: { ...pub.seo, ogImage: strip(pub.seo.ogImage) },
  };
}

export const isNotificationEnabled = (settings, event) => settings?.notifications?.events?.[event] !== false;
