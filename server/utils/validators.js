import { BOOKING_RULES } from '../config/constants.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isEmail = (v) => {
  const s = String(v ?? '').trim();
  return s.length <= 254 && EMAIL_RE.test(s) && !s.includes('..');
};

/** 7 to 15 digits; digits, spaces, + ( ) . - allowed */
export const isPhone = (v) => {
  const s = String(v ?? '').trim();
  if (!PHONE_CHARS_RE.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
};

/** 'YYYY-MM-DD' and a real calendar date (rejects 2026-02-31) */
export const isDateKey = (v) => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

/** 'HH:MM' */
export const isTimeKey = (v) => typeof v === 'string' && TIME_RE.test(v);

/** 'HH:MM' inside opening hours */
export const isBookableTime = (v) => {
  const match = typeof v === 'string' ? TIME_RE.exec(v) : null;
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= BOOKING_RULES.openHour * 60 && minutes <= BOOKING_RULES.closeHour * 60;
};

/**
 * Today's date as 'YYYY-MM-DD' in the BUSINESS's timezone, so "after today" means the same thing
 * wherever the server runs. Set BUSINESS_TIMEZONE in .env (e.g. 'Asia/Kolkata'); default is UTC.
 */
export const todayKey = (now = new Date()) => {
  const format = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  try {
    return format(process.env.BUSINESS_TIMEZONE || 'UTC');
  } catch {
    return format('UTC'); // invalid timezone name in .env
  }
};

/** 'YYYY-MM-DD' plus n days */
export const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isFutureDate = (key) => key > todayKey();
export const isWithinAdvance = (key) => key <= addDays(todayKey(), BOOKING_RULES.maxAdvanceDays);
