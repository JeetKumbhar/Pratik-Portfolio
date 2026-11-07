/**
 * How money, dates and times are WRITTEN on the website and in the admin panel, following Admin → Settings → General
 * (currency, date format, 12/24-hour time). Pure functions, no React: components get them through useFormatters().
 * The defaults are what Settings starts with, so nothing changes until the photographer chooses differently.
 */
export const DEFAULT_FORMAT = { currency: 'INR', dateFormat: 'D MMM YYYY', timeFormat: '12h' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 1200 → ₹1,200 (Indian digit grouping for rupees: 150000 → ₹1,50,000). Anything that is not a number → '' */
export function formatMoney(amount, currency = DEFAULT_FORMAT.currency) {
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return '';
  const options = { style: 'currency', currency, maximumFractionDigits: 0 };
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', options).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`; // a currency code this browser does not know
  }
}

/** '2026-11-05' → '5 Nov 2026' | '05/11/2026' | '11/05/2026' | '2026-11-05'. Not a real date → '' */
export function formatDateKey(key, dateFormat = DEFAULT_FORMAT.dateFormat) {
  const m = KEY.exec(String(key ?? ''));
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) return '';
  switch (dateFormat) {
    case 'DD/MM/YYYY': return `${pad(d)}/${pad(mo)}/${y}`;
    case 'MM/DD/YYYY': return `${pad(mo)}/${pad(d)}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${pad(mo)}-${pad(d)}`;
    default: return `${d} ${MONTHS[mo - 1]} ${y}`;
  }
}

/** '15:30' → '3:30 pm' (12h) or '15:30' (24h). Not a time → '' */
export function formatTimeKey(time, timeFormat = DEFAULT_FORMAT.timeFormat) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? ''));
  if (!m) return '';
  const [h, min] = [Number(m[1]), m[2]];
  if (timeFormat === '24h') return `${pad(h)}:${min}`;
  return `${h % 12 || 12}:${min} ${h < 12 ? 'am' : 'pm'}`;
}

/** The one-line "date at time" used in confirmations */
export const formatDateTime = (key, time, format = DEFAULT_FORMAT) => [formatDateKey(key, format.dateFormat), formatTimeKey(time, format.timeFormat)].filter(Boolean).join(' at ');
