/**
 * npm run seed
 * Creates (never overwrites) the first admin user and the three starter packages.
 * Safe to run more than once.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { User, Package } from '../models/index.js';

const PACKAGES = [
  { name: 'Essential', slug: 'essential', category: 'general', description: 'Perfect for personal sessions', price: 600, duration: '1 hour', features: ['1 location', '30+ edited photos', 'Online gallery', 'Print release'], popular: false, sortOrder: 1 },
  { name: 'Standard', slug: 'standard', category: 'general', description: 'Great for couples & small events', price: 1200, duration: '2 hours', features: ['1 to 2 locations', '75+ edited photos', 'Online gallery', 'Print release', 'Pre-shoot consultation'], popular: true, sortOrder: 2 },
  { name: 'Premium', slug: 'premium', category: 'general', description: 'For weddings & big moments', price: 2500, duration: 'Up to 6 hours', features: ['Multiple locations', '150+ edited photos', 'Online gallery', 'Print release', 'Pre-shoot consultation', 'Photo album (10x10)'], popular: false, sortOrder: 3 },
];

async function seed() {
  await connectDB();
  await Promise.all([User.init(), Package.init()]);

  // ---- Admin ----
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn('Skipped admin: set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  } else if (await User.exists({ email: ADMIN_EMAIL.toLowerCase() })) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`);
  } else {
    await User.create({ name: ADMIN_NAME || 'Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
    console.log(`Admin created: ${ADMIN_EMAIL}`);
  }

  // ---- Packages: insert only if missing, so edits made later in the Admin panel are never overwritten ----
  for (const pkg of PACKAGES) {
    const result = await Package.updateOne({ slug: pkg.slug }, { $setOnInsert: pkg }, { upsert: true });
    console.log(result.upsertedCount ? `Package created: ${pkg.name}` : `Package exists: ${pkg.name}`);
  }

  await mongoose.connection.close();
  console.log('Seed done.');
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
