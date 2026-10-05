import { BOOKING_RULES, ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { isDateKey } from './validators.js';

/**
 * Availability rules, in one place.
 *   A slot is FREE when:  the date is bookable  AND  no pending/confirmed Booking holds it
 *                         AND  no BlockedDate covers it (whole day, or that hour).
 *   A day is  'unavailable' (no free slots) · 'limited' (40% or fewer free) · 'available'.
 *
 * The first half of this file is PURE (no database), so it can be tested on its own.
 * The database helpers at the bottom load Booking/BlockedDate only when called.
 */
const pad = (n) => String(n).padStart(2, '0');

export const SLOT_TIMES = Array.from(
  { length: BOOKING_RULES.closeHour - BOOKING_RULES.openHour + 1 },
  (_, i) => `${pad(BOOKING_RULES.openHour + i)}:00`
); // ['07:00', ... '21:00']
export const LIMITED_RATIO = 0.4;

export const dateKey = (year, monthIndex, day) => `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const toDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

/** A real date, after today, and not further ahead than BOOKING_RULES.maxAdvanceDays */
export function isBookableDate(key) {
  if (!isDateKey(key)) return false;
  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + BOOKING_RULES.maxAdvanceDays);
  const d = toDate(key);
  return d > today && d <= limit;
}

const covers = (block, time) => !block.blockedTimes?.length || block.blockedTimes.includes(time);

/** → [{ time: '07:00', available: true }, ...] */
export function computeSlots(date, { bookedTimes = [], blocks = [] } = {}, { enforceDateRules = true } = {}) {
  const dayOpen = !enforceDateRules || isBookableDate(date);
  const booked = new Set(bookedTimes);
  return SLOT_TIMES.map((time) => ({
    time,
    available: dayOpen && !booked.has(time) && !blocks.some((b) => covers(b, time)),
  }));
}

export function dayStatus(slots) {
  const free = slots.filter((s) => s.available).length;
  if (free === 0) return 'unavailable';
  return free / slots.length <= LIMITED_RATIO ? 'limited' : 'available';
}

/** → { 'YYYY-MM-DD': 'available' | 'limited' | 'unavailable' } for every day of the month */
export function buildMonth(year, monthIndex, bookings, blocks) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const bookedByDate = {};
  const blocksByDate = {};
  bookings.forEach((b) => { (bookedByDate[b.date] ||= []).push(b.time); });
  blocks.forEach((b) => { (blocksByDate[b.date] ||= []).push(b); });

  const result = {};
  for (let d = 1; d <= days; d += 1) {
    const key = dateKey(year, monthIndex, d);
    result[key] = dayStatus(computeSlots(key, { bookedTimes: bookedByDate[key], blocks: blocksByDate[key] }));
  }
  return result;
}

// ------------------------------------------------------------------ database helpers
async function models() {
  return import('../models/index.js'); // loaded lazily so the pure functions above need no Mongoose
}

export async function loadDayContext(date, { excludeBookingId } = {}) {
  const { Booking, BlockedDate } = await models();
  const bookingFilter = { date, status: { $in: ACTIVE_BOOKING_STATUSES } };
  if (excludeBookingId) bookingFilter._id = { $ne: excludeBookingId };

  const [bookings, blocks] = await Promise.all([
    Booking.find(bookingFilter).select('time').lean(),
    BlockedDate.find({ date }).select('blockedTimes').lean(),
  ]);
  return { bookedTimes: bookings.map((b) => b.time), blocks };
}

export async function getDaySlots(date, options) {
  return computeSlots(date, await loadDayContext(date, options));
}

/** options: { excludeBookingId, enforceDateRules } */
export async function isSlotFree(date, time, { excludeBookingId, enforceDateRules = true } = {}) {
  const context = await loadDayContext(date, { excludeBookingId });
  return computeSlots(date, context, { enforceDateRules }).some((s) => s.time === time && s.available);
}

export async function getMonthAvailability(year, monthIndex) {
  const { Booking, BlockedDate } = await models();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const range = { $gte: dateKey(year, monthIndex, 1), $lte: dateKey(year, monthIndex, days) };

  const [bookings, blocks] = await Promise.all([
    Booking.find({ date: range, status: { $in: ACTIVE_BOOKING_STATUSES } }).select('date time').lean(),
    BlockedDate.find({ date: range }).select('date blockedTimes').lean(),
  ]);
  return buildMonth(year, monthIndex, bookings, blocks);
}
