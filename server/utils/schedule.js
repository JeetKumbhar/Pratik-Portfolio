import { BOOKING_RULES, WEEKDAYS } from '../config/constants.js';

/**
 * Weekly working hours + special working days → which HOURS of a given date the photographer works. Pure: no database.
 *
 * Time on the calendar is hourly (each hour is one slot; see utils/availability.js), so working periods are whole hours:
 *   { start: '09:00', end: '18:00' }  = the hours 09:00 … 17:00 are open (a shoot must END by 18:00).
 * The earliest start and latest end are the shop's outer limits from BOOKING_RULES (07:00 to 22:00).
 *
 * Which periods apply to a date:  1. a SPECIAL WORKING DAY for exactly that date, else  2. that weekday's weekly schedule.
 * (Closures such as holidays and vacations are BlockedDate records, which are checked separately and always win.)
 */
const pad = (n) => String(n).padStart(2, '0');

export const FIRST_HOUR = BOOKING_RULES.openHour; // 7
export const LAST_END_HOUR = BOOKING_RULES.closeHour + 1; // 22: the last slot starts at 21:00 and ends at 22:00

/** 'YYYY-MM-DD' → 'monday' … 'sunday'. The weekday of a calendar date does not depend on any timezone. */
export function weekdayOf(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(day + 6) % 7];
}

/** '09:00' → 9, or null when it is not a whole hour ('09:30', 'x') */
export function wholeHour(time) {
  const m = /^([01]\d|2[0-3]):00$/.exec(String(time));
  return m ? Number(m[1]) : null;
}

/** [{start:'09:00', end:'12:00'}, {start:'14:00', end:'18:00'}] → Set { '09:00','10:00','11:00','14:00',... } */
export function periodsToHours(periods = []) {
  const hours = new Set();
  for (const p of periods) {
    const from = wholeHour(p?.start);
    const to = wholeHour(p?.end);
    if (from === null || to === null) continue;
    for (let h = Math.max(from, FIRST_HOUR); h < Math.min(to, LAST_END_HOUR); h += 1) hours.add(`${pad(h)}:00`);
  }
  return hours;
}

/**
 * The open hours for one date: Set of 'HH:00'. Empty set = a day off.
 * availability = settings.availability ({ weekly: { monday: { enabled, periods } ... }, specialDays: [{ date, periods }] })
 */
export function openHoursFor(dateKey, availability) {
  const special = availability?.specialDays?.find((s) => s.date === dateKey);
  if (special) return periodsToHours(special.periods);
  const day = availability?.weekly?.[weekdayOf(dateKey)];
  return day?.enabled ? periodsToHours(day.periods) : new Set();
}

/** Why a day is closed by the weekly schedule (for the admin calendar): true when no hours are open and it is not a special working day */
export const isDayOff = (dateKey, availability) => openHoursFor(dateKey, availability).size === 0;
