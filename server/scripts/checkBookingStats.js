
/**
 * npm run check:stats
 * Checks the dashboard numbers against MongoDB. It measures the stats BEFORE and AFTER adding six
 * temporary bookings, so your real bookings never disturb the result. The temporary rows are deleted at the end.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking } from '../models/index.js';
import { computeBookingStats } from '../utils/bookingStats.js';
import { dateKey } from '../utils/availability.js';

const EMAIL = 'stats-test@example.invalid';
const now = new Date();
const key = (d) => dateKey(d.getFullYear(), d.getMonth(), d.getDate());
const daysFromNow = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return key(d); };
const FAR = daysFromNow(500); // far in the future, so it can never clash with a real booking
const firstOfThisMonth = dateKey(now.getFullYear(), now.getMonth(), 1);
const lastYear = daysFromNow(-400);

const pkg = (price) => ({ slug: 'standard', name: 'Standard', price, duration: '2 hours', durationHours: 2 });
const make = (patch) => ({
  name: 'Stats Test', email: EMAIL, phone: '+1 123 456 7890', shootType: 'wedding', location: 'outdoor',
  numberOfPeople: 2, package: pkg(1200), date: FAR, time: '10:00', status: 'pending', ...patch,
});

let failed = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `   (${detail})` : ''}`);
  if (!pass) failed += 1;
};

try {
  await connectDB();
  await Booking.init();
  await Booking.deleteMany({ email: EMAIL });
  const before = await computeBookingStats();

  await Booking.create([
    make({ status: 'pending', time: '07:00', package: pkg(600) }), // upcoming, pending, no revenue
    make({ status: 'confirmed', time: '10:00', package: pkg(1200) }), // upcoming, +1200 revenue (shoot is in the future, not this month)
    make({ status: 'confirmed', time: '13:00', package: { ...pkg(null), slug: 'custom', name: 'Not sure yet' } }), // custom quote: no price, no revenue
    make({ status: 'completed', date: firstOfThisMonth, time: '09:00', package: pkg(2500) }), // +2500 revenue, counts "this month"
    make({ status: 'completed', date: lastYear, time: '09:00', package: pkg(700) }), // +700 revenue, an old month
    make({ status: 'cancelled', time: '16:00', package: pkg(600) }), // counted in total only
  ]);

  const after = await computeBookingStats();
  const delta = (get) => get(after) - get(before);

  console.log('\n-- Dashboard numbers (change caused by 6 temporary bookings) --');
  check('Total bookings: +6', delta((s) => s.total) === 6, `got ${delta((s) => s.total)}`);
  check('Pending: +1', delta((s) => s.pending) === 1, `got ${delta((s) => s.pending)}`);
  check('Confirmed: +2', delta((s) => s.confirmed) === 2);
  check('Completed: +2', delta((s) => s.completed) === 2);
  check('Cancelled: +1', delta((s) => s.cancelled) === 1);
  check('Upcoming: +3 (pending + 2 confirmed in the future; cancelled and completed excluded)', delta((s) => s.upcoming) === 3, `got ${delta((s) => s.upcoming)}`);
  check('Revenue total: +4400 (1200 + 2500 + 700; pending, cancelled and custom quotes add nothing)', delta((s) => s.revenue.total) === 4400, `got ${delta((s) => s.revenue.total)}`);
  check('Revenue this month: +2500 (only the completed shoot dated this month)', delta((s) => s.revenue.thisMonth) === 2500, `got ${delta((s) => s.revenue.thisMonth)}`);

  console.log('\n-- Next shoots list --');
  const ordered = after.next.every((b, i, arr) => i === 0 || `${arr[i - 1].date}${arr[i - 1].time}` <= `${b.date}${b.time}`);
  check('at most 5 entries, soonest first', after.next.length <= 5 && ordered);
  check('only pending/confirmed, none in the past', after.next.every((b) => ['pending', 'confirmed'].includes(b.status) && b.date >= after.today));
  const json = after.next[0]?.toJSON?.() ?? {};
  check('entries carry a reference (AM-XXXXXX) and no contact details', !after.next[0] || (Boolean(json.reference) && !json.email && !json.phone));
} catch (err) {
  console.error('\nCheck crashed:', err.message);
  failed += 1;
} finally {
  await Booking.deleteMany({ email: EMAIL }).catch(() => {});
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
