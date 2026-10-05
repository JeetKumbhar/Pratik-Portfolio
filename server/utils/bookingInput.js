import httpError from './httpError.js';
import { isDateKey } from './validators.js';
import { BOOKING_STATUSES, SHOOT_TYPES } from '../config/constants.js';

/**
 * Request-body / query helpers for bookings.
 *
 * The rule: NEVER pass req.body straight to the database. Pick only the fields we allow,
 * and only with the right JavaScript type. That stops people from setting status, bookingId,
 * adminNotes or slotKey themselves, and blocks NoSQL operator tricks like { "email": { "$ne": "" } }.
 */
const str = (v) => (typeof v === 'string' ? v : undefined);
const toNumber = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const strArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : undefined);
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/**
 * Accepts the frontend's names AND the model's names:
 *   people / numberOfPeople, requests / specialRequest, packageId (a slug like "standard" or "custom") / package.id
 * Returns { ...bookingFields, packageSlug }.
 */
export function pickBookingInput(body) {
  const b = body && typeof body === 'object' ? body : {};
  const pkg = b.package && typeof b.package === 'object' ? b.package : {};

  return clean({
    name: str(b.name),
    email: str(b.email),
    phone: str(b.phone),
    shootType: str(b.shootType),
    location: str(b.location),
    locationDetails: str(b.locationDetails),
    numberOfPeople: toNumber(b.numberOfPeople ?? b.people),
    styles: strArray(b.styles),
    specialRequest: str(b.specialRequest ?? b.requests),
    budget: str(b.budget),
    date: str(b.date),
    time: str(b.time),
    packageSlug: str(b.packageId) ?? str(pkg.id) ?? str(pkg.slug),
  });
}

/** Admin edits: same fields plus status, adminNotes and the notifyCustomer switch. */
export function pickBookingUpdate(body) {
  const b = body && typeof body === 'object' ? body : {};
  return clean({
    ...pickBookingInput(b),
    status: str(b.status),
    adminNotes: str(b.adminNotes),
    notifyCustomer: typeof b.notifyCustomer === 'boolean' ? b.notifyCustomer : undefined,
  });
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  date: { date: 1, time: 1 }, // upcoming shoots first
  date_desc: { date: -1, time: -1 },
};

/**
 * GET /api/bookings query string → { filter, sort, page, limit }
 *   ?status=pending  or  ?status=pending,confirmed     ?shootType=wedding
 *   ?date=2026-10-12  or  ?from=2026-10-01&to=2026-10-31
 *   ?q=text (name, email or booking reference)         ?sort=newest|oldest|date|date_desc
 *   ?page=2&limit=20 (limit max 100)
 */
export function parseListQuery(query = {}) {
  const one = (key) => (typeof query[key] === 'string' ? query[key].trim() : undefined);
  const filter = {};
  const errors = {};

  const status = one('status');
  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length && list.every((s) => BOOKING_STATUSES.includes(s))) filter.status = list.length === 1 ? list[0] : { $in: list };
    else errors.status = `Use one or more of: ${BOOKING_STATUSES.join(', ')}`;
  }

  const shootType = one('shootType');
  if (shootType) {
    if (SHOOT_TYPES.includes(shootType)) filter.shootType = shootType;
    else errors.shootType = `Use one of: ${SHOOT_TYPES.join(', ')}`;
  }

  const date = one('date');
  const from = one('from');
  const to = one('to');
  for (const [key, value] of [['date', date], ['from', from], ['to', to]]) {
    if (value && !isDateKey(value)) errors[key] = 'Use YYYY-MM-DD';
  }
  if (date && !errors.date) filter.date = date;
  else if ((from || to) && !errors.from && !errors.to) {
    filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  }

  const q = one('q');
  if (q) {
    const rx = new RegExp(escapeRegex(q.slice(0, 60)), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { bookingId: rx }];
  }

  const sortKey = one('sort') ?? 'newest';
  if (!SORTS[sortKey]) errors.sort = `Use one of: ${Object.keys(SORTS).join(', ')}`;

  if (Object.keys(errors).length) throw httpError(400, 'Invalid query', errors);

  const page = Math.max(1, parseInt(one('page'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(one('limit'), 10) || 20));
  return { filter, sort: SORTS[sortKey], page, limit };
}
