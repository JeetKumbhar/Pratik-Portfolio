import { ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { dateKey } from './availability.js';

/** Revenue counts confirmed + completed bookings, using the package price saved with each booking.
 *  Pending/cancelled bookings and "custom quote" bookings (no price yet) add nothing. It is an ESTIMATE, not accounting. */
export const REVENUE_STATUSES = ['confirmed', 'completed'];

/** [{ _id: 'pending', count: 2, revenue: 600 }, ...]  →  totals. Pure function (no database). */
export function summarizeStatuses(rows) {
  const out = { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0, revenueTotal: 0 };
  rows.forEach(({ _id, count, revenue }) => {
    out.total += count;
    if (_id in out) out[_id] += count;
    if (REVENUE_STATUSES.includes(_id)) out.revenueTotal += revenue || 0;
  });
  return out;
}

/** Everything the admin dashboard needs, calculated by MongoDB (never by downloading every booking). */
export async function computeBookingStats(now = new Date()) {
  const { Booking } = await import('../models/index.js'); // loaded lazily so summarizeStatuses can be tested without Mongoose

  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = dateKey(now.getFullYear(), now.getMonth(), 1);
  const following = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEndExclusive = dateKey(following.getFullYear(), following.getMonth(), 1);
  const price = { $sum: { $ifNull: ['$package.price', 0] } };

  const [byStatus, upcoming, thisMonth, next] = await Promise.all([
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, revenue: price } }]),
    Booking.countDocuments({ date: { $gte: today }, status: { $in: ACTIVE_BOOKING_STATUSES } }),
    Booking.aggregate([
      { $match: { status: { $in: REVENUE_STATUSES }, date: { $gte: monthStart, $lt: monthEndExclusive } } },
      { $group: { _id: null, revenue: price } },
    ]),
    Booking.find({ date: { $gte: today }, status: { $in: ACTIVE_BOOKING_STATUSES } })
      .sort({ date: 1, time: 1 })
      .limit(5)
      .select('bookingId name shootType date time status package.name package.price'),
  ]);

  const s = summarizeStatuses(byStatus);
  return {
    today,
    total: s.total,
    upcoming,
    pending: s.pending,
    confirmed: s.confirmed,
    completed: s.completed,
    cancelled: s.cancelled,
    revenue: { total: s.revenueTotal, thisMonth: thisMonth[0]?.revenue ?? 0 },
    next, // the next 5 upcoming shoots (pending or confirmed)
  };
}
