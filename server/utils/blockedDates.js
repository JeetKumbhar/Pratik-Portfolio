import { isDateKey } from './validators.js';
import { expandHours } from './availability.js';

export const MAX_RANGE_DAYS = 60;
const pad = (n) => String(n).padStart(2, '0');

/** ('2026-12-24', '2026-12-27') → ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27']. Throws a readable Error when invalid. */
export function datesInRange(start, end = start, maxDays = MAX_RANGE_DAYS) {
  if (!isDateKey(start) || !isDateKey(end)) throw new Error('Dates must be real dates in YYYY-MM-DD format.');
  if (end < start) throw new Error('The end date cannot be before the start date.');

  const [y, m, d] = start.split('-').map(Number);
  const days = [];
  for (let i = 0; ; i += 1) {
    const dt = new Date(y, m - 1, d + i);
    const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    if (key > end) break;
    days.push(key);
    if (days.length > maxDays) throw new Error(`You can block at most ${maxDays} days at once.`);
  }
  return days;
}

/**
 * Which existing bookings would a block collide with?
 * blockedTimes empty = the whole day, so every booking that day collides; otherwise only bookings using one of those hours.
 */
export function findConflicts(bookings, blockedTimes = []) {
  const blocked = new Set(blockedTimes);
  return bookings.filter((b) => blocked.size === 0 || expandHours(b.time, b.package?.durationHours ?? 1).some((hour) => blocked.has(hour)));
}
