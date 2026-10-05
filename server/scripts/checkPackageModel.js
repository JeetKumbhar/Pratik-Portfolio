
/**
 * Checks the Package model.
 *   npm run check:package            → validation rules only (no database)
 *   npm run check:package -- --db    → also tests saving/querying in Atlas (temporary rows, deleted after)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Package } from '../models/index.js';
import { PACKAGE_CATEGORIES } from '../config/constants.js';

const MARKER = '__model-test__';
const make = (patch = {}) => ({
  name: 'ZZ Model Test A', price: 900, duration: '3 hours',
  features: ['1 location', '  Online gallery  '], description: MARKER, ...patch,
});

let failed = 0;
const check = (label, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
};

async function validationTests() {
  console.log('\n-- Validation rules (no database) --');

  const good = new Package(make({ name: 'Wedding Deluxe' }));
  await good.validate();
  check('a complete package is valid', true);
  check('slug is generated from the name ("wedding-deluxe")', good.slug === 'wedding-deluxe');
  check("category defaults to 'general'", good.category === 'general');
  check('active defaults to true, popular to false', good.active === true && good.popular === false);
  check('features are trimmed', good.features[1] === 'Online gallery');

  const json = good.toJSON();
  check('JSON: id equals the slug (frontend links keep working)', json.id === 'wedding-deluxe');
  check('JSON: tagline equals description (pricing card keeps working)', json.tagline === good.description);

  for (const category of PACKAGE_CATEGORIES) {
    try { await new Package(make({ category })).validate(); check(`category "${category}" is accepted`, true); } catch { check(`category "${category}" is accepted`, false); }
  }

  const rejects = async (label, patch, path) => {
    try { await new Package(make(patch)).validate(); check(label, false); } catch (e) { check(label, Boolean(e.errors?.[path])); }
  };
  await rejects('rejects a missing name', { name: '' }, 'name');
  await rejects('rejects a missing price', { price: undefined }, 'price');
  await rejects('rejects a negative price', { price: -5 }, 'price');
  await rejects('rejects an absurd price', { price: 5000000 }, 'price');
  await rejects('rejects a missing duration', { duration: '' }, 'duration');
  await rejects('rejects an unknown category', { category: 'spa' }, 'category');
  await rejects('rejects more than 15 features', { features: Array.from({ length: 16 }, (_, i) => `f${i}`) }, 'features');
  await rejects('rejects a feature over 100 characters', { features: ['x'.repeat(101)] }, 'features.0');
  await rejects('rejects a description over 200 characters', { description: 'x'.repeat(201) }, 'description');
}

async function databaseTests() {
  console.log('\n-- Database (Atlas; cleans up after itself) --');
  await connectDB();
  await Package.init();
  const cleanup = () => Package.deleteMany({ description: MARKER });
  await cleanup();

  try {
    await Package.create([
      make({ name: 'ZZ Model Test A', category: 'wedding', sortOrder: 1 }),
      make({ name: 'ZZ Model Test B', category: 'general', sortOrder: 2 }),
      make({ name: 'ZZ Model Test C', category: 'portrait', sortOrder: 3 }),
      make({ name: 'ZZ Model Test D', category: 'general', active: false, sortOrder: 4 }),
    ]);

    const names = (list) => list.map((p) => p.name.slice(-1)).join('');
    const base = { description: MARKER, active: true };

    check('inactive packages are excluded from the public query (A, B, C)', names(await Package.find(base).sort({ sortOrder: 1 })) === 'ABC');
    check('category=wedding returns wedding + general packages (A, B)',
      names(await Package.find({ ...base, category: { $in: ['general', 'wedding'] } }).sort({ sortOrder: 1 })) === 'AB');
    check('category=portrait returns portrait + general packages (B, C)',
      names(await Package.find({ ...base, category: { $in: ['general', 'portrait'] } }).sort({ sortOrder: 1 })) === 'BC');

    let duplicate = null;
    try { await Package.create(make({ name: 'ZZ Model Test A' })); } catch (e) { duplicate = e; }
    check('a second package with the same name is rejected (E11000)', duplicate?.code === 11000);

    const saved = await Package.findOne({ name: 'ZZ Model Test A' });
    const originalSlug = saved.slug;
    saved.slug = 'hacked';
    saved.name = 'ZZ Model Test A (renamed)';
    await saved.save();
    const reloaded = await Package.findById(saved._id);
    check('the slug cannot change after creation, even when the package is renamed', reloaded.slug === originalSlug && reloaded.name.includes('renamed'));
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
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
