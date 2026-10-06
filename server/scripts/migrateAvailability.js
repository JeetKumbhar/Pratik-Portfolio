/**
 * npm run migrate:availability      (run ONCE, before sync:indexes)
 * Moves existing data to multi-hour bookings:
 *   - Package: fills durationHours from the duration text ("Up to 6 hours" gives 6)
 *   - Booking: recomputes the hours each active booking occupies (slotKeys); removes the old slotKey field
 * Safe to run more than once.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Package, Booking } from '../models/index.js';
import { parseDurationHours } from '../utils/duration.js';
import { ACTIVE_BOOKING_STATUSES } from '../config/constants.js';

try {
  await connectDB();

  // ---- Packages (native collection: bypasses the schema, which now requires durationHours) ----
  const packages = await Package.collection.find({ durationHours: { $exists: false } }).toArray();
  for (const p of packages) {
    const hours = parseDurationHours(p.duration);
    if (!hours) {
      console.warn(`Package "${p.name}": cannot read hours from "${p.duration}". Set durationHours by hand in Atlas.`);
      continue;
    }
    await Package.collection.updateOne({ _id: p._id }, { $set: { durationHours: hours } });
    console.log(`Package "${p.name}": durationHours = ${hours}`);
  }
  if (!packages.length) console.log('Packages: nothing to migrate');

  // ---- Bookings ----
  const bookings = await Booking.find({ status: { $in: ACTIVE_BOOKING_STATUSES }, slotKeys: { $exists: false } });
  for (const b of bookings) {
    try {
      b.set('package.durationHours', b.package?.durationHours ?? 1);
      await b.save(); // the pre-validate hook computes slotKeys
      console.log(`Booking ${b.bookingId}: occupies ${b.slotKeys.length} hour(s)`);
    } catch (err) {
      console.warn(`Booking ${b.bookingId}: ${err.message}`);
    }
  }
  if (!bookings.length) console.log('Bookings: nothing to migrate');

  const cleaned = await Booking.collection.updateMany({ slotKey: { $exists: true } }, { $unset: { slotKey: '' } });
  console.log(`Removed the old slotKey field from ${cleaned.modifiedCount} booking(s)`);
  console.log('\nDone. Next: npm run sync:indexes');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
