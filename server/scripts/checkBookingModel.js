/**
 * Checks the Booking model.
 *   npm run check:booking            → validation rules only (no database needed)
 *   npm run check:booking -- --db    → also tests double-booking protection against Atlas.
 *                                      Creates temporary test bookings and deletes them afterwards.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking } from '../models/index.js';

const TEST_EMAIL = 'model-test@example.invalid';
const FUTURE = '2099-06-15';
const valid = () => ({
  name: 'Test User', email: TEST_EMAIL, phone: '+1 123 456 7890',
  shootType: 'wedding', location: 'outdoor', numberOfPeople: 2,
  package: { slug: 'standard', name: 'Standard', price: 1200, duration: '2 hours' },
  date: FUTURE, time: '14:00',
});

let failed = 0;
const check = (label, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
};

async function validationTests() {
  console.log('\n-- Validation rules (no database) --');

  const good = new Booking(valid());
  await good.validate();
  check('a complete booking is valid', true);
  check('bookingId is generated (AM-XXXXXX)', /^AM-[A-HJKMNP-Z2-9]{6}$/.test(good.bookingId));
  check('status defaults to pending', good.status === 'pending');
  check('pending booking locks its slot', good.slotKey === `${FUTURE}_14:00`);

  const cancelled = new Booking({ ...valid(), status: 'cancelled' });
  await cancelled.validate();
  check('cancelled booking does NOT lock the slot', cancelled.slotKey === undefined);

  const rejects = async (label, patch, path) => {
    try {
      await new Booking({ ...valid(), ...patch }).validate();
      check(label, false);
    } catch (e) {
      check(label, Boolean(e.errors?.[path]));
    }
  };
  await rejects('rejects a bad email', { email: 'nope' }, 'email');
  await rejects('rejects a bad phone', { phone: '12' }, 'phone');
  await rejects('rejects an unknown shoot type', { shootType: 'skydiving' }, 'shootType');
  await rejects('rejects 0 people', { numberOfPeople: 0 }, 'numberOfPeople');
  await rejects('rejects a fake date (31 Feb)', { date: '2099-02-31' }, 'date');
  await rejects('rejects a time outside opening hours', { time: '23:00' }, 'time');
  await rejects('rejects an unknown status', { status: 'maybe' }, 'status');
  await rejects('rejects more than 3 styles', { styles: ['Natural', 'Moody', 'Minimal', 'Editorial'] }, 'styles');
  await rejects('rejects a missing package', { package: undefined }, 'package.slug');
  await rejects('rejects a missing name', { name: '' }, 'name');
}

async function databaseTests() {
  console.log('\n-- Double-booking protection (uses Atlas, cleans up after itself) --');
  await connectDB();
  await Booking.init(); // make sure the unique index exists
  const cleanup = () => Booking.deleteMany({ email: TEST_EMAIL });
  await cleanup();

  try {
    const first = await Booking.create(valid());
    check('first booking for the slot is saved', Boolean(first._id));

    let duplicateError = null;
    try { await Booking.create(valid()); } catch (e) { duplicateError = e; }
    check('second booking for the SAME slot is rejected (E11000)', duplicateError?.code === 11000);

    first.status = 'cancelled';
    await first.save();
    const reloaded = await Booking.findById(first._id).lean();
    check('cancelling releases the slot', reloaded.slotKey === undefined);

    const again = await Booking.create(valid());
    check('the slot can be booked again after a cancellation', Boolean(again._id));

    const json = again.toJSON();
    check('JSON includes id + reference and hides slotKey', Boolean(json.id) && json.reference === again.bookingId && !('slotKey' in json));
  } finally {
    await cleanup();
    await mongoose.connection.close();
  }
}

try {
  await validationTests();
  if (process.argv.includes('--db')) await databaseTests();
} catch (err) {
  console.error('\nCheck crashed:', err.message);
  failed += 1;
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);