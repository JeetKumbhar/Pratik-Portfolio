
import { MAX_DURATION_HOURS } from '../config/constants.js';

/**
 * "2 hours" → 2   "Up to 6 hours" → 6   "6-8 hours" → 8   "90 minutes" → 2 (rounded up)
 * Returns undefined when it can't tell ("Full day"), so the admin must enter the hours by hand.
 */
export function parseDurationHours(text) {
  const str = String(text ?? '');
  const numbers = [...str.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!numbers.length) return undefined;

  let n = Math.max(...numbers);
  if (/\bmin(ute)?s?\b/i.test(str)) n /= 60;

  const hours = Math.ceil(n);
  return hours >= 1 && hours <= MAX_DURATION_HOURS ? hours : undefined;
}
