import {
  ACTIVE_BOOKING_STATUSES, CLIENT_BOOKING_FILTERS, CLIENT_FILTERS, CLIENT_SORTS,
} from '../config/constants.js';
import { todayKey } from './validators.js';

/**
 * Everything the admin Clients screens READ: the statistics cards, the paginated/searchable list, one client's
 * booking history and WhatsApp conversation summary. All counting is done by MongoDB; nothing downloads every client.
 *
 * ONE definition of "repeat client" (change it here and the cards, the filter and the profile all follow):
 *     a client is REPEAT when they have at least one COMPLETED booking, or at least two bookings that are not cancelled.
 *     Everyone else is NEW. (Cancelled bookings never make someone a repeat client, but they do count in "Total bookings".)
 * "Upcoming booking" = pending or confirmed, on today's date or later (today = the BUSINESS_TIMEZONE date).
 * "Last booking" = when the client's most recent booking was MADE (its createdAt), not the shoot date.
 *
 * Booking numbers are NOT stored on the client. They are calculated here from Booking.clientId, so they cannot drift
 * when a booking is cancelled, edited or deleted.
 *
 * Dependencies come in through getDeps() ({ models, toObjectId, today, now }) so the pipelines can be tested without a database.
 */
export const REPEAT_MIN_ACTIVE_BOOKINGS = 2;
export const REPEAT_MIN_COMPLETED_BOOKINGS = 1;
const MAX_HISTORY = 200;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------- time
/** The calendar and clock in `timeZone` at the instant `date`, as { year, month, day, hour, minute, second } */
function zonedParts(date, timeZone) {
  const out = {};
  new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(date).forEach((p) => { if (p.type !== 'literal') out[p.type] = Number(p.value); });
  return out;
}

/** The instant (a Date) when the current month began in `timeZone` ("this month" on the cards follows the business's calendar). */
export function startOfMonth(now = new Date(), timeZone = process.env.BUSINESS_TIMEZONE || 'UTC') {
  let tz = timeZone;
  let p;
  try { p = zonedParts(now, tz); } catch { tz = 'UTC'; p = zonedParts(now, tz); } // an invalid name in .env falls back to UTC

  // local clock minus UTC at an instant. It can differ between today and the 1st (daylight saving), so it is read AT the 1st.
  const offsetAt = (ms) => {
    const f = zonedParts(new Date(ms), tz);
    return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(ms / 1000) * 1000;
  };
  const guess = Date.UTC(p.year, p.month - 1, 1); // the 1st, 00:00, as if the zone were UTC
  const approx = guess - offsetAt(guess);
  return new Date(guess - offsetAt(approx));
}

// ---------------------------------------------------------------------- the list's pipeline (pure)
const EMPTY_STATS = { total: 0, active: 0, completed: 0, upcoming: 0, cancelled: 0, lastBookingAt: null };

/** The $group that turns one client's bookings into counts. Shared by the list, the cards and the profile. */
export const bookingStatsGroup = (today) => ({
  _id: null,
  total: { $sum: 1 },
  active: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } },
  completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
  cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
  upcoming: { $sum: { $cond: [{ $and: [{ $in: ['$status', ACTIVE_BOOKING_STATUSES] }, { $gte: ['$date', today] }] }, 1, 0] } },
  lastBookingAt: { $max: '$createdAt' },
});

const repeatExpr = { $or: [{ $gte: ['$bk.completed', REPEAT_MIN_COMPLETED_BOOKINGS] }, { $gte: ['$bk.active', REPEAT_MIN_ACTIVE_BOOKINGS] }] };

/** $lookup + $addFields: every client row gets its booking numbers (bk), then flat fields the screen uses. */
const statsStages = (bookingsCollection, today) => [
  {
    $lookup: {
      from: bookingsCollection,
      let: { cid: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$clientId', '$$cid'] } } }, { $group: bookingStatsGroup(today) }],
      as: 'bk',
    },
  },
  { $addFields: { bk: { $ifNull: [{ $arrayElemAt: ['$bk', 0] }, { $literal: EMPTY_STATS }] } } },
  {
    $addFields: {
      totalBookings: '$bk.total',
      upcomingBookings: '$bk.upcoming',
      completedBookings: '$bk.completed',
      lastBookingAt: '$bk.lastBookingAt',
      isRepeat: repeatExpr,
    },
  },
  { $project: { bk: 0 } },
];

const FILTERS = {
  all: null,
  new: { isRepeat: false },
  repeat: { isRepeat: true },
  upcoming: { upcomingBookings: { $gt: 0 } },
  none: { totalBookings: 0 },
};
const SORTS = {
  recent: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  lastBooking: { lastBookingAt: -1, createdAt: -1, _id: -1 }, // clients with no booking (null) go last
  mostBookings: { totalBookings: -1, createdAt: -1, _id: -1 },
};

/** The text box: name, email or phone, partial matches, case-insensitive. Returns a $match condition or null. */
export function searchCondition(search) {
  const term = String(search ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!term) return null;
  const rx = new RegExp(escapeRegex(term), 'i');
  const or = [{ name: rx }, { email: rx }, { phone: rx }];
  const digits = term.replace(/\D/g, '').replace(/^0+/, ''); // "098765 43" and "+91 98765 43" both find 919876543210
  const looksLikePhone = /^[+\d\s().-]+$/.test(term); // "Studio 123" is a name search, not a phone search
  if (looksLikePhone && digits.length >= 3) or.push({ normalizedPhone: new RegExp(escapeRegex(digits)) });
  return { $or: or };
}

/**
 * → the aggregation for one page of clients. Pure: no database.
 * When neither the filter nor the sort needs booking numbers, the page is cut FIRST and only those rows are looked up
 * (so opening the default list costs one page of lookups, not one per client).
 */
export function buildListPipeline({ search = '', filter = 'all', sort = 'recent', page = 1, limit = 20, today, bookingsCollection = 'bookings' }) {
  const match = searchCondition(search);
  const afterStats = FILTERS[filter];
  const needsStatsFirst = Boolean(afterStats) || sort === 'lastBooking' || sort === 'mostBookings';
  const stats = statsStages(bookingsCollection, today);
  const paging = [{ $skip: (page - 1) * limit }, { $limit: limit }];

  const pipeline = [...(match ? [{ $match: match }] : [])];
  if (needsStatsFirst) {
    pipeline.push(...stats, ...(afterStats ? [{ $match: afterStats }] : []), { $sort: SORTS[sort] });
    pipeline.push({ $facet: { rows: paging, total: [{ $count: 'n' }] } });
  } else {
    pipeline.push({ $sort: SORTS[sort] });
    pipeline.push({ $facet: { rows: [...paging, ...stats], total: [{ $count: 'n' }] } });
  }
  return pipeline;
}

// ---------------------------------------------------------------------- shapes sent to the browser
export const publicClient = (c) => ({
  id: String(c._id), name: c.name, phone: c.phone, email: c.email || '', city: c.city || '', source: c.source,
  createdAt: c.createdAt, updatedAt: c.updatedAt,
});

export const typeOf = (isRepeat) => (isRepeat ? 'repeat' : 'new');

export const publicRow = (r) => ({
  ...publicClient(r),
  totalBookings: r.totalBookings ?? 0,
  upcomingBookings: r.upcomingBookings ?? 0,
  completedBookings: r.completedBookings ?? 0,
  lastBookingAt: r.lastBookingAt ?? null,
  type: typeOf(r.isRepeat),
});

/** One client's booking numbers (the output of bookingStatsGroup, or nothing when they have no bookings) → the profile summary */
export function publicSummary(stats) {
  const s = { ...EMPTY_STATS, ...(stats ?? {}) };
  const isRepeat = s.completed >= REPEAT_MIN_COMPLETED_BOOKINGS || s.active >= REPEAT_MIN_ACTIVE_BOOKINGS;
  return {
    totalBookings: s.total, upcomingBookings: s.upcoming, completedBookings: s.completed, cancelledBookings: s.cancelled,
    lastBookingAt: s.lastBookingAt ?? null, type: typeOf(isRepeat),
  };
}

export const publicBooking = (b) => ({
  id: String(b._id), reference: b.bookingId, shootType: b.shootType, packageName: b.package?.name ?? '', date: b.date, time: b.time,
  status: b.status, createdAt: b.createdAt,
});

export const publicConversation = (c) => ({
  id: String(c._id), lastMessagePreview: c.lastMessagePreview || '', lastMessageAt: c.lastMessageAt ?? null,
  lastMessageDirection: c.lastMessageDirection ?? null, unreadCount: c.unreadCount ?? 0, status: c.status,
});

// ---------------------------------------------------------------------- the queries
export function createClientQueries(getDeps) {
  const context = async () => {
    const deps = await getDeps();
    return { ...deps, today: (deps.today ?? todayKey)(), now: (deps.now ?? (() => new Date()))() };
  };

  /** The four cards: { total, newThisMonth, repeat, totalBookings } */
  async function getStats() {
    const { models, today, now } = await context();
    const { Client, Booking } = models;
    const monthStart = startOfMonth(now);
    const [total, newThisMonth, totalBookings, repeatRows] = await Promise.all([
      Client.countDocuments({}),
      Client.countDocuments({ createdAt: { $gte: monthStart } }),
      Booking.countDocuments({ clientId: { $ne: null } }),
      Booking.aggregate([
        { $match: { clientId: { $ne: null } } },
        { $group: { _id: '$clientId', active: bookingStatsGroup(today).active, completed: bookingStatsGroup(today).completed } },
        { $match: { $or: [{ completed: { $gte: REPEAT_MIN_COMPLETED_BOOKINGS } }, { active: { $gte: REPEAT_MIN_ACTIVE_BOOKINGS } }] } },
        { $count: 'n' },
      ]),
    ]);
    return { total, newThisMonth, repeat: repeatRows[0]?.n ?? 0, totalBookings };
  }

  /** { search, filter, sort, page, limit } (already validated) → { rows, total } */
  async function listClients({ search, filter, sort, page, limit }) {
    const { models, today } = await context();
    const pipeline = buildListPipeline({ search, filter, sort, page, limit, today, bookingsCollection: models.Booking.collection.name });
    const [result] = await models.Client.aggregate(pipeline);
    return { rows: (result?.rows ?? []).map(publicRow), total: result?.total?.[0]?.n ?? 0 };
  }

  /** One client's booking numbers → publicSummary() */
  async function getSummary(clientId) {
    const { models, toObjectId, today } = await context();
    const [stats] = await models.Booking.aggregate([{ $match: { clientId: toObjectId(clientId) } }, { $group: bookingStatsGroup(today) }]);
    return publicSummary(stats);
  }

  /** filter: 'all' | 'upcoming' | 'completed' | 'cancelled' → the client's bookings (newest shoot first; upcoming: soonest first), at most 200 */
  async function listBookings(clientId, filter = 'all') {
    const { models, toObjectId, today } = await context();
    const query = { clientId: toObjectId(clientId) };
    if (filter === 'upcoming') Object.assign(query, { status: { $in: ACTIVE_BOOKING_STATUSES }, date: { $gte: today } });
    else if (filter === 'completed') query.status = 'completed';
    else if (filter === 'cancelled') query.status = 'cancelled';

    const sort = filter === 'upcoming' ? { date: 1, time: 1 } : { date: -1, time: -1 };
    const rows = await models.Booking.find(query).select('bookingId shootType package.name date time status createdAt').sort(sort).limit(MAX_HISTORY).lean();
    return rows.map(publicBooking);
  }

  /**
   * The client's WhatsApp conversation, or null. Found by the link (clientId) first, otherwise by the same phone number
   * (an older conversation nobody linked yet), which is then linked. Conversations that belong to ANOTHER client are never taken.
   */
  async function findConversation(client) {
    const { models } = await context();
    const C = models.WhatsAppConversation;
    const linked = await C.findOne({ clientId: client._id }).sort({ lastMessageAt: -1 }).lean();
    if (linked) return publicConversation(linked);

    const sameNumber = await C.findOne({ phone: client.normalizedPhone, clientId: null }).lean();
    if (!sameNumber) return null;
    await C.updateOne({ _id: sameNumber._id, clientId: null }, { $set: { clientId: client._id } });
    return publicConversation(sameNumber);
  }

  return { getStats, listClients, getSummary, listBookings, findConversation };
}

// ---------------------------------------------------------------------- the real thing (models load on first use)
let deps;
const realDeps = async () => {
  if (!deps) {
    const [models, { default: mongoose }] = await Promise.all([import('../models/index.js'), import('mongoose')]);
    deps = { models, toObjectId: (id) => new mongoose.Types.ObjectId(String(id)) };
  }
  return deps;
};

export const queries = createClientQueries(realDeps);
export const { getStats, listClients, getSummary, listBookings, findConversation } = queries;

export { CLIENT_BOOKING_FILTERS, CLIENT_FILTERS, CLIENT_SORTS };
