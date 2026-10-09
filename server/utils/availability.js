import { BOOKING_RULES, ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { isDateKey } from './validators.js';

/**
 * Availability rules, in one place.
 *
 *   An hour is FREE when no pending/confirmed Booking covers it and no BlockedDate covers it.
 *   A START TIME is available when the date is bookable AND every hour of the shoot is free
 *   AND the shoot ends by closing time. (A 6-hour wedding at 10:00 occupies 10:00 to 15:00.)
 *   A DAY is 'unavailable' (no start time left) · 'limited' (40% or fewer left) · 'available'.
 *
 * The first half of this file is PURE (no database) so it can be tested on its own.
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

export const hourOf = (time) => Number(String(time).slice(0, 2));
/** ('10:00', 3) → ['10:00', '11:00', '12:00'] */
export const expandHours = (time, hours = 1) => Array.from({ length: hours }, (_, i) => `${pad(hourOf(time) + i)}:00`);
const hoursOf = (booking) => booking.package?.durationHours ?? booking.hours ?? 1;

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

/**
 * bookedTimes: every occupied hour, already expanded (['10:00','11:00',...])
 * → [{ time: '07:00', available: true }, ...]  (one entry per possible START time)
 */
export function computeSlots(date, { bookedTimes = [], blocks = [] } = {}, { enforceDateRules = true, durationHours = 1 } = {}) {
  const dayOpen = !enforceDateRules || isBookableDate(date);
  const busy = new Set(bookedTimes);
  const hourFree = (time) => !busy.has(time) && !blocks.some((b) => covers(b, time));

  return SLOT_TIMES.map((time, i) => {
    const needed = SLOT_TIMES.slice(i, i + durationHours);
    return { time, available: dayOpen && needed.length === durationHours && needed.every(hourFree) };
  });
}

export function dayStatus(slots) {
  const free = slots.filter((s) => s.available).length;
  if (free === 0) return 'unavailable';
  return free / slots.length <= LIMITED_RATIO ? 'limited' : 'available';
}

const groupByDate = (items) => items.reduce((acc, item) => { (acc[item.date] ||= []).push(item); return acc; }, {});

/** → { 'YYYY-MM-DD': 'available' | 'limited' | 'unavailable' } for every day of the month */
export function buildMonth(year, monthIndex, bookings, blocks, durationHours = 1) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const bookingsByDate = groupByDate(bookings);
  const blocksByDate = groupByDate(blocks);

  const result = {};
  for (let d = 1; d <= days; d += 1) {
    const key = dateKey(year, monthIndex, d);
    const bookedTimes = (bookingsByDate[key] || []).flatMap((b) => expandHours(b.time, hoursOf(b)));
    result[key] = dayStatus(computeSlots(key, { bookedTimes, blocks: blocksByDate[key] || [] }, { durationHours }));
  }
  return result;
}

/**
 * ADMIN calendar: why each day looks the way it does.
 * label: the all-day block type ('editing', 'vacation', 'personal', 'offline_booking', 'other')
 *        | 'booked' (nothing left) | 'partly_booked' | 'available'
 * Past days are shown as they really are (date rules off) so the admin sees history.
 */
export function buildAdminMonth(year, monthIndex, bookings, blocks, durationHours = 1) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const bookingsByDate = groupByDate(bookings);
  const blocksByDate = groupByDate(blocks);

  const result = [];
  for (let d = 1; d <= days; d += 1) {
    const key = dateKey(year, monthIndex, d);
    const dayBookings = bookingsByDate[key] || [];
    const dayBlocks = blocksByDate[key] || [];
    const bookedTimes = dayBookings.flatMap((b) => expandHours(b.time, hoursOf(b)));
    const slots = computeSlots(key, { bookedTimes, blocks: dayBlocks }, { enforceDateRules: false, durationHours });
    const status = dayStatus(slots);

    const allDayBlock = dayBlocks.find((b) => !b.blockedTimes?.length);
    let label = status;
    if (allDayBlock) label = allDayBlock.type;
    else if (status === 'unavailable') label = 'booked';
    else if (dayBookings.length) label = 'partly_booked';

    result.push({
      date: key,
      status,
      label,
      bookings: dayBookings.map((b) => ({ reference: b.bookingId, name: b.name, shootType: b.shootType, status: b.status, time: b.time, hours: hoursOf(b) })),
      blocks: dayBlocks.map((b) => ({ id: String(b._id), type: b.type, reason: b.reason, note: b.note ?? '', allDay: !b.blockedTimes?.length, blockedTimes: b.blockedTimes || [] })),
    });
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
    Booking.find(bookingFilter).select('time package.durationHours').lean(),
    BlockedDate.find({ date }).select('blockedTimes').lean(),
  ]);
  return { bookedTimes: bookings.flatMap((b) => expandHours(b.time, hoursOf(b))), blocks };
}

export async function getDaySlots(date, { durationHours = 1, excludeBookingId, enforceDateRules = true } = {}) {
  const context = await loadDayContext(date, { excludeBookingId });
  return computeSlots(date, context, { enforceDateRules, durationHours });
}

/** Is a shoot of `durationHours` starting at `time` completely free? */
export async function isSlotFree(date, time, { excludeBookingId, enforceDateRules = true, durationHours = 1 } = {}) {
  const slots = await getDaySlots(date, { durationHours, excludeBookingId, enforceDateRules });
  return slots.some((s) => s.time === time && s.available);
}

async function loadMonth(year, monthIndex, select) {
  const { Booking, BlockedDate } = await models();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const range = { $gte: dateKey(year, monthIndex, 1), $lte: dateKey(year, monthIndex, days) };
  return Promise.all([
    Booking.find({ date: range, status: { $in: ACTIVE_BOOKING_STATUSES } }).select(select.booking).lean(),
    BlockedDate.find({ date: range }).select(select.block).lean(),
  ]);
}

export async function getMonthAvailability(year, monthIndex, durationHours = 1) {
  const [bookings, blocks] = await loadMonth(year, monthIndex, { booking: 'date time package.durationHours', block: 'date blockedTimes' });
  return buildMonth(year, monthIndex, bookings, blocks, durationHours);
}

export async function getAdminMonth(year, monthIndex, durationHours = 1) {
  const [bookings, blocks] = await loadMonth(year, monthIndex, {
    booking: 'bookingId name date time shootType status package.durationHours',
    block: 'date type reason note blockedTimes',
  });
  return buildAdminMonth(year, monthIndex, bookings, blocks, durationHours);
}
