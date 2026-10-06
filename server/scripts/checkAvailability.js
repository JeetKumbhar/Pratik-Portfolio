/**
 * npm run check:availability
 * Tests the real availability system against Atlas, using the scenario from the spec:
 *   day 10: a 6-hour booking   day 11: editing   day 12: free   day 13: vacation   day 14: offline booking 14:00-15:00
 * Creates temporary bookings/blocks about 2 months ahead and deletes them afterwards.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking, BlockedDate } from '../models/index.js';
import { dateKey, getMonthAvailability, getAdminMonth, getDaySlots, isSlotFree } from '../utils/availability.js';

const EMAIL = 'availability-test@example.invalid';
const MARK = '__availability-test__';

const base = new Date();
base.setDate(base.getDate() + 60);
const Y = base.getFullYear();
const M = base.getMonth();
const D = { booked: dateKey(Y, M, 10), editing: dateKey(Y, M, 11), free: dateKey(Y, M, 12), vacation: dateKey(Y, M, 13), partial: dateKey(Y, M, 14) };

const wedding = (patch = {}) => ({
  name: 'Availability Test', email: EMAIL, phone: '+1 123 456 7890', shootType: 'wedding', location: 'outdoor', numberOfPeople: 2,
  package: { slug: 'premium', name: 'Premium', price: 2500, duration: 'Up to 6 hours', durationHours: 6 },
  date: D.booked, time: '10:00', ...patch,
});
const small = (time, hours) => wedding({ time, package: { slug: 'essential', name: 'Essential', price: 600, duration: `${hours} hours`, durationHours: hours } });

let failed = 0;
const check = (label, pass) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) failed += 1; };
const free = (slots, time) => slots.find((s) => s.time === time)?.available;
const cleanup = async () => { await Booking.deleteMany({ email: EMAIL }); await BlockedDate.deleteMany({ note: MARK }); };

try {
  await connectDB();
  await Promise.all([Booking.init(), BlockedDate.init()]);
  await cleanup();

  const wed = await Booking.create(wedding()); // 10:00 for 6 hours = 10:00 to 15:00 occupied
  await BlockedDate.create([
    { date: D.editing, type: 'editing', reason: 'Editing day', note: MARK },
    { date: D.vacation, type: 'vacation', reason: 'Away', note: MARK },
    { date: D.partial, type: 'offline_booking', reason: 'Phone booking', blockedTimes: ['14:00', '15:00'], note: MARK },
  ]);

  console.log(`\n-- Scenario: ${D.booked} booked · ${D.editing} editing · ${D.free} free · ${D.vacation} vacation · ${D.partial} offline booking --`);

  console.log('\n-- What customers see (month view: status only) --');
  const month = await getMonthAvailability(Y, M);
  check('editing day is unavailable', month[D.editing] === 'unavailable');
  check('vacation day is unavailable', month[D.vacation] === 'unavailable');
  check('free day is available', month[D.free] === 'available');
  check('a day with one wedding still has free hours (not fully unavailable)', month[D.booked] !== 'unavailable');
  check('a day with a 2-hour offline booking is still available', month[D.partial] === 'available');

  console.log('\n-- What the admin sees (month view: with reasons) --');
  const admin = Object.fromEntries((await getAdminMonth(Y, M)).map((x) => [x.date, x]));
  check('booked day is labelled partly_booked and lists the booking', admin[D.booked].label === 'partly_booked' && admin[D.booked].bookings[0]?.reference === wed.bookingId);
  check('editing day is labelled "editing"', admin[D.editing].label === 'editing');
  check('free day is labelled "available"', admin[D.free].label === 'available');
  check('vacation day is labelled "vacation"', admin[D.vacation].label === 'vacation');

  console.log('\n-- Hours on the booked day (6-hour wedding at 10:00) --');
  const one = await getDaySlots(D.booked, { durationHours: 1 });
  check('09:00 is free and 16:00 is free', free(one, '09:00') && free(one, '16:00'));
  check('10:00 to 15:00 are all taken', ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].every((t) => !free(one, t)));
  const three = await getDaySlots(D.booked, { durationHours: 3 });
  check('a 3-hour shoot can start at 07:00 (07, 08, 09 are free)', free(three, '07:00'));
  check('a 3-hour shoot cannot start at 08:00 (it would run into the wedding)', !free(three, '08:00'));
  check('a 3-hour shoot can start at 16:00', free(three, '16:00'));
  check('a 3-hour shoot cannot start at 20:00 (it would end after closing)', !free(three, '20:00'));

  console.log('\n-- Blocks --');
  check('whole-day block: every start time is unavailable', (await getDaySlots(D.editing)).every((s) => !s.available));
  const part = await getDaySlots(D.partial);
  check('offline booking blocks only 14:00 and 15:00', !free(part, '14:00') && !free(part, '15:00') && free(part, '13:00') && free(part, '16:00'));
  check('past dates are never available', (await getDaySlots('2020-01-01')).every((s) => !s.available));

  console.log('\n-- Backend re-check + database guard against double booking --');
  check('isSlotFree says an overlapping 2-hour shoot at 12:00 is NOT free', (await isSlotFree(D.booked, '12:00', { durationHours: 2 })) === false);
  check('isSlotFree says a 2-hour shoot at 16:00 IS free', (await isSlotFree(D.booked, '16:00', { durationHours: 2 })) === true);

  let overlap = null;
  try { await Booking.create(small('12:00', 2)); } catch (e) { overlap = e; }
  check('the DATABASE refuses an overlapping booking even if the app check is skipped (E11000)', overlap?.code === 11000);
  check('the error maps to the friendly "slot taken" message path (keyValue.slotKeys)', Object.keys(overlap?.keyValue ?? {})[0] === 'slotKeys');

  const after = await Booking.create(small('16:00', 2));
  check('a non-overlapping booking after the wedding is accepted', Boolean(after._id));

  wed.status = 'cancelled';
  await wed.save();
  check('cancelling the wedding frees its hours', (await isSlotFree(D.booked, '12:00', { durationHours: 2 })) === true);
  const reuse = await Booking.create(small('12:00', 2));
  check('the freed hours can be booked again', Boolean(reuse._id));
} catch (err) {
  console.error('\nCheck crashed:', err.message);
  if (/IndexOptionsConflict|IndexKeySpecsConflict|E11000|slotKey/i.test(err.message)) {
    console.error('Hint: run  npm run migrate:availability  and then  npm run sync:indexes,  then try again.');
  }
  failed += 1;
} finally {
  await cleanup().catch(() => {});
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
