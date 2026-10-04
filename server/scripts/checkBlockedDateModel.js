/**
 * Checks the BlockedDate model.
 *   npm run check:blocked            → validation rules only (no database)
 *   npm run check:blocked -- --db    → also tests against Atlas (creates temporary rows, deletes them after)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { BlockedDate } from '../models/index.js';
import { BLOCKED_DATE_TYPES } from '../config/constants.js';

const MARKER = '__model-test__';
const DAY = '2099-07-01';
const make = (patch = {}) => new BlockedDate({ date: DAY, type: 'vacation', note: MARKER, ...patch });

let failed = 0;
const check = (label, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
};

async function validationTests() {
  console.log('\n-- Validation rules (no database) --');

  const whole = make();
  await whole.validate();
  check('a whole-day block is valid', true);
  check('no times → allDay is true', whole.allDay === true);
  check('whole-day block covers every slot', whole.blocksTime('09:00') && whole.blocksTime('20:00'));

  const dflt = new BlockedDate({ date: DAY });
  await dflt.validate();
  check("type defaults to 'other'", dflt.type === 'other');

  for (const type of BLOCKED_DATE_TYPES) {
    try { await make({ type }).validate(); check(`type "${type}" is accepted`, true); } catch { check(`type "${type}" is accepted`, false); }
  }

  const part = make({ type: 'offline_booking', blockedTimes: ['15:00', '14:00', '14:00'] });
  await part.validate();
  check('times are de-duplicated and sorted', JSON.stringify(part.blockedTimes) === '["14:00","15:00"]');
  check('partial block: allDay is false', part.allDay === false);
  check('partial block covers its own slots', part.blocksTime('14:00') && part.blocksTime('15:00'));
  check('partial block does NOT cover other slots', !part.blocksTime('16:00'));

  const rejects = async (label, patch, path) => {
    try { await make(patch).validate(); check(label, false); } catch (e) { check(label, Boolean(e.errors?.[path])); }
  };
  await rejects('rejects an unknown type', { type: 'holiday' }, 'type');
  await rejects('rejects a fake date (31 Feb)', { date: '2099-02-31' }, 'date');
  await rejects('rejects a missing date', { date: undefined }, 'date');
  await rejects('rejects a malformed time', { blockedTimes: ['noon'] }, 'blockedTimes');
  await rejects('rejects a time outside opening hours', { blockedTimes: ['23:00'] }, 'blockedTimes');
  await rejects('rejects a reason over 200 characters', { reason: 'x'.repeat(201) }, 'reason');
  await rejects('rejects a note over 1000 characters', { note: 'x'.repeat(1001) }, 'note');
}

async function databaseTests() {
  console.log('\n-- Database (Atlas; cleans up after itself) --');
  await connectDB();
  await BlockedDate.init(); // fails with an index-conflict error if you have not run: npm run sync:indexes
  const cleanup = () => BlockedDate.deleteMany({ note: MARKER });
  await cleanup();

  try {
    await make({ type: 'vacation' }).save();
    check('whole-day block saved', true);

    let second = null;
    try { await make({ type: 'offline_booking', blockedTimes: ['14:00'], reason: 'Phone booking' }).save(); } catch (e) { second = e; }
    check('a SECOND block on the same date is allowed (old unique index is gone)', second === null);

    const found = await BlockedDate.find({ date: DAY, note: MARKER });
    check('both blocks are found for that date', found.length === 2);
    check('toJSON has id and allDay', found.every((b) => b.toJSON().id && typeof b.toJSON().allDay === 'boolean'));
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
  if (/IndexOptionsConflict|IndexKeySpecsConflict|different options/i.test(err.message)) {
    console.error('Hint: an old index is still in Atlas. Run:  npm run sync:indexes   then try again.');
  }
  failed += 1;
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
