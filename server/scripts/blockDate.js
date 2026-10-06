/**
 * Block (or unblock) days until the Admin panel exists.
 *   node scripts/blockDate.js 2026-12-12 editing "Editing day"                       whole day
 *   node scripts/blockDate.js 2026-12-13 vacation                                    whole day
 *   node scripts/blockDate.js 2026-12-14 offline_booking "Phone booking" 14:00,15:00  only those hours
 *   node scripts/blockDate.js --list                                                  show every block
 *   node scripts/blockDate.js --remove 2026-12-12                                     delete the blocks on that date
 * Types: offline_booking, editing, vacation, personal, other
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { BlockedDate } from '../models/index.js';

const [a, b, c, d] = process.argv.slice(2);

try {
  await connectDB();

  if (a === '--list') {
    const all = await BlockedDate.find().sort({ date: 1 });
    if (!all.length) console.log('No blocked dates.');
    all.forEach((x) => console.log(`${x.date}  ${x.type.padEnd(16)} ${x.blockedTimes.length ? x.blockedTimes.join(',') : 'whole day'}  ${x.reason}`));
  } else if (a === '--remove') {
    if (!b) throw new Error('Usage: --remove YYYY-MM-DD');
    const r = await BlockedDate.deleteMany({ date: b });
    console.log(`Removed ${r.deletedCount} block(s) on ${b}`);
  } else if (a) {
    const doc = await BlockedDate.create({
      date: a,
      type: b || 'other',
      reason: c || '',
      blockedTimes: d ? d.split(',').map((t) => t.trim()) : [],
    });
    console.log(`Blocked ${doc.date} (${doc.type}, ${doc.blockedTimes.length ? doc.blockedTimes.join(',') : 'whole day'})`);
  } else {
    console.log('Usage: node scripts/blockDate.js <YYYY-MM-DD> <type> [reason] [HH:MM,HH:MM]   |   --list   |   --remove <YYYY-MM-DD>');
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
