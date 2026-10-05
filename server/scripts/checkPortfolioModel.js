/**
 * Checks the Portfolio model.
 *   npm run check:portfolio            → validation rules only (no database)
 *   npm run check:portfolio -- --db    → also tests saving/querying in Atlas (temporary rows, deleted after)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Portfolio } from '../models/index.js';

const MARKER = '__model-test__';
const make = (patch = {}) => ({
  image: { url: '/images/portfolio/gallery/wedding-01.jpg', publicId: 'test/abc' },
  title: 'Sunset vows',
  category: 'wedding',
  description: MARKER,
  ...patch,
});

let failed = 0;
const check = (label, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
};

async function validationTests() {
  console.log('\n-- Validation rules (no database) --');

  const good = new Portfolio(make());
  await good.validate();
  check('a photo with image, title and category is valid', true);
  check('alt defaults to the title', good.alt === 'Sunset vows');
  check('isPublished defaults to true, featured to false', good.isPublished === true && good.featured === false);
  check('ratio defaults to 1', good.ratio === 1);

  const sized = new Portfolio(make({ image: { url: 'https://res.cloudinary.com/x/a.jpg', width: 1600, height: 1000 } }));
  await sized.validate();
  check('ratio is computed from width / height (1600x1000 = 1.6)', sized.ratio === 1.6);

  const pano = new Portfolio(make({ image: { url: '/p.jpg', width: 5000, height: 100 } }));
  await pano.validate();
  check('extreme panoramas are clamped to ratio 3', pano.ratio === 3);

  for (const url of ['https://res.cloudinary.com/demo/a.jpg', '/images/a.jpg']) {
    try { await new Portfolio(make({ image: { url } })).validate(); check(`accepts image "${url}"`, true); } catch { check(`accepts image "${url}"`, false); }
  }

  const rejects = async (label, patch, path) => {
    try { await new Portfolio(make(patch)).validate(); check(label, false); } catch (e) { check(label, Boolean(e.errors?.[path])); }
  };
  await rejects('rejects a missing image', { image: {} }, 'image.url');
  await rejects('rejects a javascript: image URL', { image: { url: 'javascript:alert(1)' } }, 'image.url');
  await rejects('rejects a protocol-relative image URL', { image: { url: '//evil.com/a.jpg' } }, 'image.url');
  await rejects('rejects a missing title', { title: '' }, 'title');
  await rejects('rejects a title over 100 characters', { title: 'x'.repeat(101) }, 'title');
  await rejects('rejects an unknown category', { category: 'astronomy' }, 'category');
  await rejects('rejects a description over 500 characters', { description: 'x'.repeat(501) }, 'description');
}

async function databaseTests() {
  console.log('\n-- Database (Atlas; cleans up after itself) --');
  await connectDB();
  await Portfolio.init();
  const cleanup = () => Portfolio.deleteMany({ description: MARKER });
  await cleanup();

  try {
    await Portfolio.create([
      make({ title: 'W2', sortOrder: 2 }),
      make({ title: 'W1', sortOrder: 1 }),
      make({ title: 'P1', category: 'portrait' }),
      make({ title: 'Hidden', isPublished: false }),
    ]);

    const wedding = await Portfolio.find({ description: MARKER, isPublished: true, category: 'wedding' }).sort({ sortOrder: 1 });
    check('public category query returns published photos in sortOrder (W1, W2)', wedding.map((p) => p.title).join() === 'W1,W2');

    const published = await Portfolio.countDocuments({ description: MARKER, isPublished: true });
    check('drafts (isPublished: false) are excluded from the public query', published === 3);

    const json = wedding[0].toJSON();
    check('JSON has id, src, ratio and alt (what the frontend reads)', Boolean(json.id && json.src && json.ratio && json.alt));
    check('JSON never exposes image.publicId', json.image && !('publicId' in json.image));

    const stored = await Portfolio.findById(wedding[0]._id).lean();
    check('publicId IS stored in the database (the admin API needs it to delete the file)', stored.image.publicId === 'test/abc');
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
