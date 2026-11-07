import { randomUUID } from 'node:crypto';
import { Booking, BlockedDate } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { addDays, isDateKey, todayKey } from '../utils/validators.js';
import { datesInRange, findConflicts } from '../utils/blockedDates.js';

const str = (v) => (typeof v === 'string' ? v : undefined);

// @route GET /api/blocked-dates?from=2026-11-01&to=2027-03-31   (ADMIN)   default: today onwards (max 400 days)
// One row per blocked day, soonest first. Used by Admin → Settings → Availability to list holidays and vacations.
export const listBlockedDates = asyncHandler(async (req, res) => {
  const from = str(req.query.from) ?? todayKey();
  const to = str(req.query.to) ?? addDays(from, 400);
  if (!isDateKey(from) || !isDateKey(to)) throw httpError(400, 'from and to must be YYYY-MM-DD');
  if (to < from) throw httpError(400, 'to cannot be before from');
  const rows = await BlockedDate.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 }).limit(500)
    .select('date type reason note blockedTimes groupId');
  res.json({ success: true, count: rows.length, data: rows });
});

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

  if (dates[0] < todayKey()) throw httpError(400, 'You can only block today or later dates.'); // "today" in the business timezone

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

  // Days created together share a groupId, so a vacation can be unblocked in one click
  if (toCreate.length > 1) {
    const groupId = randomUUID();
    toCreate.forEach((d) => { d.groupId = groupId; });
  }

  const created = toCreate.length ? await BlockedDate.insertMany(toCreate) : [];
  res.status(201).json({ success: true, created: created.length, skipped: docs.length - created.length, conflicts, data: created });
});

// @route DELETE /api/blocked-dates/:id            (ADMIN)  unblock that one day (or those hours)
// @route DELETE /api/blocked-dates/:id?scope=group (ADMIN)  unblock every day that was blocked together with it
export const deleteBlockedDate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { scope } = req.query;
  if (scope !== undefined && scope !== 'group') throw httpError(400, 'scope can only be "group".');

  const block = /^[a-f\d]{24}$/i.test(id) ? await BlockedDate.findById(id) : null;
  if (!block) throw httpError(404, 'Block not found');

  let removed = 1;
  if (scope === 'group' && block.groupId) {
    removed = (await BlockedDate.deleteMany({ groupId: block.groupId })).deletedCount;
  } else {
    await block.deleteOne();
  }
  res.json({ success: true, message: removed === 1 ? 'Block removed' : `${removed} blocks removed`, removed, data: { date: block.date } });
});
