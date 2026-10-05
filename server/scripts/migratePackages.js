/**
 * npm run migrate:packages
 * One-time: moves existing Package documents to the new field names.
 *   isActive → active      tagline → description      (adds category: 'general' where missing)
 * Safe to run more than once. Without it, GET /api/packages returns an empty list,
 * because old documents have no `active` field.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Package } from '../models/index.js';

try {
  await connectDB();
  const col = Package.collection; // native collection: bypasses the schema so old field names can be renamed

  const renamed = await col.updateMany({}, { $rename: { isActive: 'active', tagline: 'description' } });
  const category = await col.updateMany({ category: { $exists: false } }, { $set: { category: 'general' } });
  const active = await col.updateMany({ active: { $exists: false } }, { $set: { active: true } });

  console.log(`Renamed fields on ${renamed.modifiedCount} package(s)`);
  console.log(`Added category to ${category.modifiedCount} package(s)`);
  console.log(`Added active to ${active.modifiedCount} package(s)`);

  const all = await Package.find().sort({ sortOrder: 1 }).lean();
  console.log('\nPackages now:');
  all.forEach((p) => console.log(`  ${p.name}  |  $${p.price}  |  ${p.duration}  |  category: ${p.category}  |  active: ${p.active}  |  "${p.description}"`));
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
