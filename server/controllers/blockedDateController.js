import { Booking, BlockedDate } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { dateKey } from '../utils/availability.js';
import { datesInRange, findConflicts } from '../utils/blockedDates.js';

const str = (v) => (typeof v === 'string' ? v : undefined);

// @route POST /api/blocked-dates   (ADMIN)
// body: { type, startDate, endDate?, blockedTimes?: ['14:00', ...], reason?, note?, force? }
//   - one day, or a range (a vacation = one record per day, at most 60 days)
//   - blockedTimes empty → whole day; filled → only those hours
//   - if customer bookings are already in the way you get 409 + the list, unless force:true
//   - asking again for something already blocked is harmless (it is skipped)
export const createBlockedDates = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const start = str(body.startDate) ?? str(body.date);
  const end = str(body.endDate) ?? start;
  if (!start) throw httpError(400, 'Choose a date.');

  let dates;
  try { dates = datesInRange(start, end); } catch (err) { throw httpError(400, err.message); }

  const now = new Date();
  if (dates[0] < dateKey(now.getFullYear(), now.getMonth(), now.getDate())) throw httpError(400, 'You can only block today or later dates.');

  const docs = dates.map((date) => new BlockedDate({
    date,
    type: str(body.type) ?? 'other',
    reason: str(body.reason),
    note: str(body.note),
    blockedTimes: Array.isArray(body.blockedTimes) ? body.blockedTimes.filter((t) => typeof t === 'string') : [],
  }));
  await Promise.all(docs.map((d) => d.validate())); // field errors (400) before anything is saved

  // Customer bookings already in the way?
  const active = await Booking.find({ date: { $in: dates }, status: { $in: ACTIVE_BOOKING_STATUSES } })
    .select('bookingId name date time status package.durationHours');
  const conflicts = findConflicts(active, docs[0].blockedTimes).map((b) => ({
    reference: b.bookingId, name: b.name, date: b.date, time: b.time, status: b.status,
  }));
  if (conflicts.length && body.force !== true) {
    return res.status(409).json({
      success: false,
      message: `${conflicts.length} customer booking${conflicts.length === 1 ? ' is' : 's are'} already in this time.`,
      conflicts,
    });
  }

  // Skip what is already blocked in exactly the same way
  const existing = await BlockedDate.find({ date: { $in: dates }, type: docs[0].type }).select('date blockedTimes');
  const wanted = JSON.stringify(docs[0].blockedTimes);
  const taken = new Set(existing.filter((e) => JSON.stringify([...e.blockedTimes].sort()) === wanted).map((e) => e.date));
  const toCreate = docs.filter((d) => !taken.has(d.date));

  const created = toCreate.length ? await BlockedDate.insertMany(toCreate) : [];
  res.status(201).json({ success: true, created: created.length, skipped: docs.length - created.length, conflicts, data: created });
});

// @route DELETE /api/blocked-dates/:id   (ADMIN)  → the day (or hours) become bookable again
export const deleteBlockedDate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const block = /^[a-f\d]{24}$/i.test(id) ? await BlockedDate.findById(id) : null;
  if (!block) throw httpError(404, 'Block not found');
  await block.deleteOne();
  res.json({ success: true, message: 'Block removed', data: { date: block.date } });
});
