/**
 * Checks the Message model.
 *   npm run check:message            → validation rules only (no database)
 *   npm run check:message -- --db    → also tests saving/querying in Atlas (temporary rows, deleted after)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Message } from '../models/index.js';
import { MESSAGE_STATUSES, MESSAGE_SUBJECTS } from '../config/constants.js';

const TEST_EMAIL = 'model-test@example.invalid';
const make = (patch = {}) => ({ name: 'Test User', email: TEST_EMAIL, message: 'Hello, I would like to ask about a wedding shoot.', ...patch });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failed = 0;
const check = (label, pass) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
};

async function validationTests() {
  console.log('\n-- Validation rules (no database) --');

  const good = new Message(make());
  await good.validate();
  check('name + email + message is enough (phone and subject are optional)', true);
  check("status defaults to 'new'", good.status === 'new');
  check("subject defaults to 'general'", good.subject === 'general');
  check('phone defaults to empty', good.phone === '');

  const tidy = new Message(make({ email: '  JO@Example.COM ', name: '  Jo  ' }));
  await tidy.validate();
  check('email is trimmed and lowercased, name is trimmed', tidy.email === 'jo@example.com' && tidy.name === 'Jo');

  const withPhone = new Message(make({ phone: '+1 (123) 456-7890' }));
  await withPhone.validate();
  check('accepts a valid phone number', true);

  for (const status of MESSAGE_STATUSES) {
    try { await new Message(make({ status })).validate(); check(`status "${status}" is accepted`, true); } catch { check(`status "${status}" is accepted`, false); }
  }
  for (const subject of MESSAGE_SUBJECTS) {
    try { await new Message(make({ subject })).validate(); check(`subject "${subject}" is accepted`, true); } catch { check(`subject "${subject}" is accepted`, false); }
  }

  const rejects = async (label, patch, path) => {
    try { await new Message(make(patch)).validate(); check(label, false); } catch (e) { check(label, Boolean(e.errors?.[path])); }
  };
  await rejects('rejects a missing name', { name: '' }, 'name');
  await rejects('rejects a missing email', { email: '' }, 'email');
  await rejects('rejects a bad email', { email: 'nope' }, 'email');
  await rejects('rejects a bad phone', { phone: '12' }, 'phone');
  await rejects('rejects a message under 10 characters', { message: 'hi' }, 'message');
  await rejects('rejects a message over 1000 characters', { message: 'x'.repeat(1001) }, 'message');
  await rejects('rejects an unknown status', { status: 'spam' }, 'status');
  await rejects('rejects an unknown subject', { subject: 'hello' }, 'subject');

  const json = good.toJSON();
  check('JSON has id and no __v', Boolean(json.id) && !('__v' in json));
}

async function databaseTests() {
  console.log('\n-- Database (Atlas; cleans up after itself) --');
  await connectDB();
  await Message.init();
  const cleanup = () => Message.deleteMany({ email: TEST_EMAIL });
  await cleanup();

  try {
    const created = [];
    for (const n of [1, 2, 3]) {
      created.push(await Message.create(make({ message: `Test message number ${n} for the model check.` })));
      await sleep(20); // distinct createdAt values
    }
    check('createdAt is set automatically', created.every((m) => m.createdAt instanceof Date));

    const newest = await Message.find({ email: TEST_EMAIL, status: 'new' }).sort({ createdAt: -1 });
    check('inbox query returns newest first (3, 2, 1)', newest.map((m) => m.message.match(/number (\d)/)[1]).join('') === '321');

    created[1].status = 'read';
    await created[1].save();
    const unread = await Message.countDocuments({ email: TEST_EMAIL, status: 'new' });
    const read = await Message.countDocuments({ email: TEST_EMAIL, status: 'read' });
    check('changing a status persists (2 new, 1 read)', unread === 2 && read === 1);

    created[2].status = 'maybe';
    let rejected = false;
    try { await created[2].save(); } catch { rejected = true; }
    check('an invalid status is rejected on update too', rejected);
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
