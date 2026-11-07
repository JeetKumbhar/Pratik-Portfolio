/**
 * npm run migrate:services              → DRY RUN: reads, writes NOTHING, prints a report
 * npm run migrate:services -- --apply   → writes the changes
 *
 * Run it once after deploying the Settings update. It does two things, both safe to repeat:
 *   1. Makes sure the six starting services exist (Weddings, Pre-weddings, Portrait, Baby-Shoots, Events, Commercial).
 *      The server also does this at start-up; it only ever happens ONCE, so a service you delete later never comes back.
 *   2. Saves the service NAME on every old booking that has none (`shootTypeName`), so a booking keeps showing the name
 *      it was made under even if you rename or delete the service later.
 * It never changes a booking's service id, date, status or anything else, and never deletes anything.
 * Reads MONGO_URI from .env. Prints counts and service ids only (no customer data).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking, Service } from '../models/index.js';
import { LEGACY_LABELS, prettifySlug, seedDefaultServices } from '../utils/services.js';

const apply = process.argv.includes('--apply');
const line = (text = '') => process.stdout.write(`${text}\n`);
const MISSING_NAME = { $or: [{ shootTypeName: { $exists: false } }, { shootTypeName: '' }, { shootTypeName: null }] };

try {
  await connectDB();
  await Promise.all([Booking.init(), Service.init()]);

  line(`\nServices migration (${apply ? 'APPLY' : 'DRY RUN'})`);
  line('-----------------------------------');

  const services = await Service.find({}).select('slug name').lean();
  line(`Services in the database: ${services.length}`);
  if (apply) {
    const seeded = await seedDefaultServices();
    line(seeded.seeded ? `Created ${seeded.created} starting service(s).` : 'Starting services were already created earlier (nothing to do).');
  } else if (services.length === 0) {
    line('No services yet. --apply (or the next server start) will create the six starting services.');
  }

  const names = Object.fromEntries((await Service.find({}).select('slug name').lean()).map((s) => [s.slug, s.name]));
  const groups = await Booking.aggregate([{ $match: MISSING_NAME }, { $group: { _id: '$shootType', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const total = groups.reduce((n, g) => n + g.count, 0);
  line(`Bookings without a saved service name: ${total}`);

  let updated = 0;
  for (const g of groups) {
    const slug = g._id;
    const name = names[slug] || LEGACY_LABELS[slug] || prettifySlug(slug);
    line(`  ${String(slug).padEnd(16)} ${String(g.count).padStart(5)} booking(s)  →  "${name}"${names[slug] ? '' : '  (service not in the database; using the old label)'}`);
    if (apply && name) {
      const r = await Booking.updateMany({ shootType: slug, ...MISSING_NAME }, { $set: { shootTypeName: name } });
      updated += r.modifiedCount;
    }
  }

  line(apply ? `\nDone. Saved the service name on ${updated} booking(s).` : '\nDRY RUN: nothing was written. Re-run with --apply to make these changes.');
} catch (err) {
  console.error(`\nMigration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
