import { BOOKING_RULES, ACTIVE_BOOKING_STATUSES } from '../config/constants.js';
import { addDays, hourNow, isDateKey, todayKey } from './validators.js';
import { openHoursFor } from './schedule.js';
import { getSettings } from './settings.js';

/**
 * Availability rules, in one place.
 *
 *   An hour is FREE when no pending/confirmed Booking covers it and no BlockedDate covers it.
 *   A START TIME is available when the date is bookable AND every hour of the shoot is free
 *   AND the shoot ends by closing time. (A 6-hour wedding at 10:00 occupies 10:00 to 15:00.)
 *   A DAY is 'unavailable' (no start time left) · 'limited' (40% or fewer left) · 'available'.
 *
 *   Admin → Settings adds three more rules, all optional (without settings the behaviour is exactly what it always was):
 *     working hours  an hour outside the weekly schedule / special working day is not bookable (customers only)
 *     advance rules  earliest / latest bookable date, same-day bookings (customers only)
 *     buffer         a shoot needs `bufferHours` free of other bookings before and after it (customers only)
 *   Blocked dates and existing bookings are ALWAYS respected, for customers and admin alike.
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

export const hourOf = (time) => Number(String(time).slice(0, 2));
/** ('10:00', 3) → ['10:00', '11:00', '12:00'] */
export const expandHours = (time, hours = 1) => Array.from({ length: hours }, (_, i) => `${pad(hourOf(time) + i)}:00`);
const hoursOf = (booking) => booking.package?.durationHours ?? booking.hours ?? 1;

/**
 * A real date inside the bookable window. rules: { minAdvanceDays = 1, maxAdvanceDays = BOOKING_RULES.maxAdvanceDays, today? }
 * minAdvanceDays 1 = "tomorrow or later" (the original rule); 0 = today is allowed (same-day bookings).
 * "Today" is the date in the business timezone (Admin → Settings → General), not the server's.
 */
export function isBookableDate(key, rules = {}) {
  if (!isDateKey(key)) return false;
  const today = rules.today ?? todayKey();
  const earliest = addDays(today, rules.minAdvanceDays ?? 1);
  const latest = addDays(today, rules.maxAdvanceDays ?? BOOKING_RULES.maxAdvanceDays);
  return key >= earliest && key <= latest;
}

const covers = (block, time) => !block.blockedTimes?.length || block.blockedTimes.includes(time);

/** What availability needs from the settings, in one small object */
export const optionsFromSettings = (settings, date) => ({
  rules: settings?.booking && { minAdvanceDays: settings.booking.minAdvanceDays, maxAdvanceDays: settings.booking.maxAdvanceDays },
  openHours: settings?.availability && date ? openHoursFor(date, settings.availability) : undefined,
  bufferHours: settings?.booking?.bufferHours ?? 0,
  bookingEnabled: settings?.booking?.enabled !== false,
});

/**
 * bookedTimes: every occupied hour, already expanded (['10:00','11:00',...])
 * → [{ time: '07:00', available: true }, ...]  (one entry per possible START time)
 *
 * options: { enforceDateRules = true, durationHours = 1, rules, openHours (Set of 'HH:00'), bufferHours = 0,
 *            respectWorkingHours = enforceDateRules, bookingEnabled = true, now }
 */
export function computeSlots(date, { bookedTimes = [], blocks = [] } = {}, {
  enforceDateRules = true, durationHours = 1, rules, openHours, bufferHours = 0, respectWorkingHours = enforceDateRules, bookingEnabled = true, now = new Date(),
} = {}) {
  const today = rules?.today ?? todayKey(now);
  const dayOpen = bookingEnabled && (!enforceDateRules || isBookableDate(date, { ...rules, today }));
  const busy = new Set(bookedTimes);
  const hourFree = (time) => !busy.has(time) && !blocks.some((b) => covers(b, time));
  const isToday = enforceDateRules && date === today;
  const currentHour = isToday ? hourNow(now) : -1;

  return SLOT_TIMES.map((time, i) => {
    const needed = SLOT_TIMES.slice(i, i + durationHours);
    let available = dayOpen && needed.length === durationHours && needed.every(hourFree);
    if (available && respectWorkingHours && openHours) available = needed.every((t) => openHours.has(t));
    if (available && isToday) available = hourOf(time) > currentHour; // a start time that has already passed is gone
    if (available && enforceDateRules && bufferHours > 0) {
      // other bookings (not blocks) must stay `bufferHours` away on both sides
      const around = [...SLOT_TIMES.slice(Math.max(0, i - bufferHours), i), ...SLOT_TIMES.slice(i + durationHours, i + durationHours + bufferHours)];
      available = around.every((t) => !busy.has(t));
    }
    return { time, available };
  });
}

export function dayStatus(slots) {
  const free = slots.filter((s) => s.available).length;
  if (free === 0) return 'unavailable';
  return free / slots.length <= LIMITED_RATIO ? 'limited' : 'available';
}

const groupByDate = (items) => items.reduce((acc, item) => { (acc[item.date] ||= []).push(item); return acc; }, {});

/** → { 'YYYY-MM-DD': 'available' | 'limited' | 'unavailable' } for every day of the month */
export function buildMonth(year, monthIndex, bookings, blocks, durationHours = 1, { settings } = {}) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const bookingsByDate = groupByDate(bookings);
  const blocksByDate = groupByDate(blocks);

  const result = {};
  for (let d = 1; d <= days; d += 1) {
    const key = dateKey(year, monthIndex, d);
    const bookedTimes = (bookingsByDate[key] || []).flatMap((b) => expandHours(b.time, hoursOf(b)));
    result[key] = dayStatus(computeSlots(key, { bookedTimes, blocks: blocksByDate[key] || [] }, { durationHours, ...optionsFromSettings(settings, key) }));
  }
  return result;
}

/**
 * ADMIN calendar: why each day looks the way it does.
 * label: the all-day block type ('editing', 'vacation', 'personal', 'offline_booking', 'other')
 *        | 'booked' (nothing left) | 'partly_booked' | 'available'
 * Past days are shown as they really are (date rules off) so the admin sees history.
 */
export function buildAdminMonth(year, monthIndex, bookings, blocks, durationHours = 1, groups = {}, { settings } = {}) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const bookingsByDate = groupByDate(bookings);
  const blocksByDate = groupByDate(blocks);

  const result = [];
  for (let d = 1; d <= days; d += 1) {
    const key = dateKey(year, monthIndex, d);
    const dayBookings = bookingsByDate[key] || [];
    const dayBlocks = blocksByDate[key] || [];
    const bookedTimes = dayBookings.flatMap((b) => expandHours(b.time, hoursOf(b)));
    // The admin sees past days as they really were (date rules off) but days off from the weekly schedule are shown as such
    const openHours = settings?.availability ? openHoursFor(key, settings.availability) : undefined;
    const slots = computeSlots(key, { bookedTimes, blocks: dayBlocks }, { enforceDateRules: false, durationHours, openHours, respectWorkingHours: Boolean(openHours) });
    const status = dayStatus(slots);

    const allDayBlock = dayBlocks.find((b) => !b.blockedTimes?.length);
    let label = status;
    if (allDayBlock) label = allDayBlock.type;
    else if (openHours && openHours.size === 0 && !dayBookings.length) label = 'day_off';
    else if (status === 'unavailable') label = 'booked';
    else if (dayBookings.length) label = 'partly_booked';

    result.push({
      date: key,
      status,
      label,
      bookings: dayBookings.map((b) => ({ reference: b.bookingId, name: b.name, shootType: b.shootType, shootTypeName: b.shootTypeName || '', status: b.status, time: b.time, hours: hoursOf(b) })),
      blocks: dayBlocks.map((b) => ({
        id: String(b._id), type: b.type, reason: b.reason, note: b.note ?? '', allDay: !b.blockedTimes?.length, blockedTimes: b.blockedTimes || [],
        groupId: b.groupId ?? null, group: (b.groupId && groups[b.groupId]) || null, // group = { count, start, end } when blocked together with other days
      })),
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

/**
 * Customers (enforceDateRules true): working hours, advance rules, bookings on/off and the buffer all apply.
 * Admin edits (enforceDateRules false): only existing bookings and blocked dates apply, so the photographer can still
 * schedule outside the usual hours on purpose.
 */
export async function getDaySlots(date, { durationHours = 1, excludeBookingId, enforceDateRules = true, settings } = {}) {
  const [context, loaded] = await Promise.all([loadDayContext(date, { excludeBookingId }), settings ?? getSettings()]);
  return computeSlots(date, context, { enforceDateRules, durationHours, ...(enforceDateRules && optionsFromSettings(loaded, date)) });
}

/** Is a shoot of `durationHours` starting at `time` completely free? */
export async function isSlotFree(date, time, { excludeBookingId, enforceDateRules = true, durationHours = 1, settings } = {}) {
  const slots = await getDaySlots(date, { durationHours, excludeBookingId, enforceDateRules, settings });
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
  const [[bookings, blocks], settings] = await Promise.all([loadMonth(year, monthIndex, { booking: 'date time package.durationHours', block: 'date blockedTimes' }), getSettings()]);
  return buildMonth(year, monthIndex, bookings, blocks, durationHours, { settings });
}

export async function getAdminMonth(year, monthIndex, durationHours = 1) {
  const [bookings, blocks] = await loadMonth(year, monthIndex, {
    booking: 'bookingId name date time shootType shootTypeName status package.durationHours',
    block: 'date type reason note blockedTimes groupId',
  });

  // For blocks created as a range: how many days are in the series, and from when to when (may extend into other months)
  const groupIds = [...new Set(blocks.map((b) => b.groupId).filter(Boolean))];
  const groups = {};
  if (groupIds.length) {
    const { BlockedDate } = await models();
    const rows = await BlockedDate.aggregate([
      { $match: { groupId: { $in: groupIds } } },
      { $group: { _id: '$groupId', count: { $sum: 1 }, start: { $min: '$date' }, end: { $max: '$date' } } },
    ]);
    rows.forEach((r) => { if (r.count > 1) groups[r._id] = { count: r.count, start: r.start, end: r.end }; });
  }

  return buildAdminMonth(year, monthIndex, bookings, blocks, durationHours, groups, { settings: await getSettings() });
}
