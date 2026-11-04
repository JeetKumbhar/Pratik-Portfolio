/**
 * npm run test:inbox
 *
 * Tests Phase 2 (storing incoming WhatsApp messages) WITHOUT a database, a server or the network.
 *
 * HOW IT WORKS, and what is real and what is not:
 *   REAL:   the webhook controller, the signature check, the parser, utils/whatsappInbox.js, and the Mongoose schemas
 *           (validation, enums, unique-index declarations). Requests are signed exactly like Meta signs them.
 *   MOCKED: MongoDB itself. A small in-memory stand-in replaces the model methods the code calls. It enforces the unique
 *           indexes (a repeated waMessageId or phone gives error 11000, like MongoDB), applies single-document updates atomically,
 *           and pauses at random moments so that "simultaneous" requests really do interleave.
 * So a pass here proves the LOGIC is right. It is not a test against a real MongoDB or against real Meta traffic.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { WhatsAppConversation as Conv, WhatsAppMessage as Msg, Notification, WhatsAppOptOut } from '../models/index.js';
import { receiveEvents, verifyHandshake } from '../controllers/whatsappWebhookController.js';
import { storeIncomingMessage, previewOf } from '../utils/whatsappInbox.js';

const SECRET = 'test_app_secret_not_real';
const VERIFY = 'test_verify_token_not_real';
process.env.WHATSAPP_APP_SECRET = SECRET;
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY;

// ---------------------------------------------------------------------- capture console output (to prove nothing sensitive is logged)
const captured = [];
for (const level of ['log', 'info', 'warn', 'error']) console[level] = (...args) => captured.push(args.map(String).join(' '));
const out = (line) => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------------- the in-memory MongoDB stand-in
const db = { conv: [], msg: [], optOut: new Set(), notif: new Map() };
const stats = { upsertRaces: 0, duplicateInserts: 0, claimsLost: 0 };
let seed = 1;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const tick = async () => { for (let i = Math.floor(rnd() * 3); i > 0; i -= 1) await new Promise((r) => setImmediate(r)); }; // lets other requests run
let fault = null; // (operationName) => Error | undefined
const maybeFail = (op) => { const err = fault?.(op); if (err) throw err; };
const dupKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
const netError = () => Object.assign(new Error('connection lost'), { name: 'MongoNetworkError' });

const isId = (v) => v && typeof v === 'object' && v._bsontype;
const same = (a, b) => (a instanceof Date || b instanceof Date ? +a === +b : isId(a) || isId(b) ? String(a) === String(b) : a === b);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const value = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !isId(cond)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$lte') return value != null && +value <= +arg;
        if (op === '$exists') return (value !== undefined) === arg;
        throw new Error(`the test database does not support the operator ${op}`);
      });
    }
    if (cond === null) return value == null; // like MongoDB: null matches a missing field too
    return same(value, cond);
  });
}
function applyUpdate(doc, update, inserting) {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') Object.assign(doc, fields);
    else if (op === '$inc') Object.entries(fields).forEach(([k, n]) => { doc[k] = (doc[k] ?? 0) + n; });
    else if (op === '$setOnInsert') { if (inserting) Object.assign(doc, fields); }
    else throw new Error(`the test database does not support the update ${op}`);
  }
}
const updateOne = (table) => async (filter, update) => {
  await tick();
  maybeFail(`${table}.updateOne`);
  const doc = db[table].find((d) => matches(d, filter));
  if (!doc) return { matchedCount: 0, modifiedCount: 0 };
  const before = JSON.stringify(doc);
  applyUpdate(doc, update, false);
  return { matchedCount: 1, modifiedCount: JSON.stringify(doc) === before ? 0 : 1 };
};

Conv.findOneAndUpdate = async (filter, update, options) => {
  await tick();
  maybeFail('conv.findOneAndUpdate');
  let doc = db.conv.find((d) => matches(d, filter));
  if (!doc) {
    if (!options?.upsert) return null;
    await tick(); // the gap a real upsert race falls into: another request can create the document right now
    if (db.conv.some((d) => d.phone === filter.phone)) { stats.upsertRaces += 1; throw dupKey(); } // the unique phone index
    doc = { _id: new mongoose.Types.ObjectId(), ...filter, name: '', contactId: '', lastMessagePreview: '' };
    applyUpdate(doc, update, true);
    db.conv.push(doc);
  } else {
    applyUpdate(doc, update, false);
  }
  return { ...doc };
};
Conv.updateOne = updateOne('conv');

Msg.create = async (data) => {
  await tick();
  maybeFail('msg.create');
  const document = new Msg(data);
  await document.validate(); // REAL schema validation
  const row = { ...document.toObject(), createdAt: new Date() };
  if (db.msg.some((m) => m.waMessageId === row.waMessageId)) { stats.duplicateInserts += 1; throw dupKey(); } // the unique waMessageId index
  db.msg.push(row);
  return { ...row };
};
Msg.findOne = async (filter) => { await tick(); maybeFail('msg.findOne'); const row = db.msg.find((m) => matches(m, filter)); return row ? { ...row } : null; };
const realMsgUpdate = updateOne('msg');
Msg.updateOne = async (filter, update) => {
  const result = await realMsgUpdate(filter, update);
  if (filter.processingStatus === 'received' && result.modifiedCount === 0) stats.claimsLost += 1;
  return result;
};

// the existing delivery-status and STOP/START code paths
Notification.findOne = async ({ waMessageId }) => {
  const row = db.notif.get(waMessageId);
  if (!row) return null;
  const log = { ...row, async save() { db.notif.set(waMessageId, { status: this.status, lastError: this.lastError, deliveredAt: this.deliveredAt, readAt: this.readAt }); } };
  return log;
};
WhatsAppOptOut.updateOne = async (filter) => { db.optOut.add(filter.phone); return {}; };
WhatsAppOptOut.deleteOne = async (filter) => { db.optOut.delete(filter.phone); return {}; };

function reset(newSeed = 1) {
  db.conv.length = 0; db.msg.length = 0; db.optOut.clear(); db.notif.clear();
  fault = null; seed = newSeed;
}

// ---------------------------------------------------------------------- requests, signed the way Meta signs them
const TS = 1793000000;
const hook = (value) => ({ object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] });
const contact = (name, phone) => ({ wa_id: phone, profile: { name } });
const incomingText = (id, phone, text, { name, at = TS } = {}) => hook({
  ...(name !== undefined && { contacts: [contact(name, phone)] }),
  messages: [{ from: phone, id, timestamp: String(at), type: 'text', text: { body: text } }],
});
const sign = (body, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/** Runs the real controller for one webhook call → { status, error } */
async function deliver(payload, { headers, rawBody } = {}) {
  const body = rawBody ?? Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const sent = headers ?? { 'x-hub-signature-256': sign(body) };
  const req = { body, get: (name) => sent[name.toLowerCase()] };
  const res = { sendStatus(code) { this.code = code; return this; } };
  let error;
  await receiveEvents(req, res, (err) => { error = err; });
  return { status: res.code ?? (error ? 500 : undefined), error };
}

const PRIYA = '919876543210';
const RAHUL = '919811122233';
const conversationOf = (phone) => db.conv.find((c) => c.phone === phone);
const messagesOf = (phone) => db.msg.filter((m) => m.phone === phone);

// ---------------------------------------------------------------------- tiny test runner
let failed = 0;
let count = 0;
async function test(name, fn) {
  reset();
  count += 1;
  try { await fn(); out(`PASS  ${name}`); } catch (err) { failed += 1; out(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
}
const section = (title) => out(`\n--- ${title} ---`);

section('1-5  storing messages and conversations');

await test('[1] first incoming text message creates a conversation and a message', async () => {
  const r = await deliver(incomingText('wamid.A1', PRIYA, 'Hello Pratik', { name: 'Priya Patil' }));
  assert.equal(r.status, 200);
  assert.equal(db.conv.length, 1);
  assert.equal(db.msg.length, 1);
  const c = conversationOf(PRIYA);
  assert.deepEqual([c.name, c.contactId, c.unreadCount, c.status, c.lastMessagePreview, c.lastMessageDirection], ['Priya Patil', PRIYA, 1, 'open', 'Hello Pratik', 'incoming']);
  assert.equal(+c.lastMessageAt, TS * 1000);
  const m = db.msg[0];
  assert.deepEqual([m.waMessageId, m.phone, m.direction, m.type, m.text, m.processingStatus], ['wamid.A1', PRIYA, 'incoming', 'text', 'Hello Pratik', 'processed']);
  assert.equal(String(m.conversationId), String(c._id));
  assert.equal(+m.waTimestamp, TS * 1000);
});

await test('[2] a second message from the same number updates the existing conversation', async () => {
  await deliver(incomingText('wamid.A1', PRIYA, 'first', { name: 'Priya Patil', at: TS }));
  await deliver(incomingText('wamid.A2', PRIYA, 'second message', { name: 'Priya Patil', at: TS + 60 }));
  assert.equal(db.conv.length, 1);
  assert.equal(db.msg.length, 2);
  const c = conversationOf(PRIYA);
  assert.deepEqual([c.unreadCount, c.lastMessagePreview], [2, 'second message']);
  assert.equal(+c.lastMessageAt, (TS + 60) * 1000);
});

await test('[3] different phone numbers create separate conversations', async () => {
  await deliver(incomingText('wamid.A1', PRIYA, 'from Priya', { name: 'Priya Patil' }));
  await deliver(incomingText('wamid.B1', RAHUL, 'from Rahul', { name: 'Rahul Shah' }));
  assert.equal(db.conv.length, 2);
  assert.deepEqual([conversationOf(PRIYA).lastMessagePreview, conversationOf(RAHUL).lastMessagePreview], ['from Priya', 'from Rahul']);
  assert.deepEqual([messagesOf(PRIYA).length, messagesOf(RAHUL).length], [1, 1]);
  assert.notEqual(String(conversationOf(PRIYA)._id), String(conversationOf(RAHUL)._id));
});

await test('[4] a repeated WhatsApp message id does not create another message', async () => {
  await deliver(incomingText('wamid.A1', PRIYA, 'same message'));
  await deliver(incomingText('wamid.A1', PRIYA, 'same message'));
  assert.equal(db.msg.length, 1);
  assert.equal(db.conv.length, 1);
});

await test('[5] a repeated webhook does not increase the unread count', async () => {
  const payload = incomingText('wamid.A1', PRIYA, 'hi', { name: 'Priya Patil' });
  for (let i = 0; i < 5; i += 1) assert.equal((await deliver(payload)).status, 200);
  assert.equal(conversationOf(PRIYA).unreadCount, 1);
  assert.equal(db.msg.length, 1);
});

await test('a late message cannot overwrite a newer last-message summary, but is still counted', async () => {
  await deliver(incomingText('wamid.NEW', PRIYA, 'newer', { at: TS + 100 }));
  await deliver(incomingText('wamid.OLD', PRIYA, 'older', { at: TS + 10 }));
  const c = conversationOf(PRIYA);
  assert.deepEqual([c.lastMessagePreview, +c.lastMessageAt, c.unreadCount, db.msg.length], ['newer', (TS + 100) * 1000, 2, 2]);
});

section('6  concurrent duplicates (150 different random interleavings each)');

await test('[6a] 8 identical webhooks at the same moment: one message, one conversation, unread = 1', async () => {
  for (let s = 1; s <= 150; s += 1) {
    reset(s);
    const payload = incomingText('wamid.A1', PRIYA, 'hi', { name: 'Priya Patil' });
    const results = await Promise.all(Array.from({ length: 8 }, () => deliver(payload)));
    assert.ok(results.every((r) => r.status === 200), `seed ${s}: statuses ${results.map((r) => r.status)}`);
    assert.deepEqual([db.conv.length, db.msg.length, conversationOf(PRIYA).unreadCount, db.msg[0].processingStatus], [1, 1, 1, 'processed'], `seed ${s}`);
  }
});

await test('[6b] 5 DIFFERENT first messages from a new number at the same moment: one conversation, 5 messages, unread = 5', async () => {
  for (let s = 1; s <= 150; s += 1) {
    reset(s);
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => deliver(incomingText(`wamid.M${n}`, PRIYA, `message ${n}`, { name: 'Priya Patil', at: TS + n }))));
    assert.ok(results.every((r) => r.status === 200), `seed ${s}`);
    assert.deepEqual([db.conv.length, db.msg.length, conversationOf(PRIYA).unreadCount], [1, 5, 5], `seed ${s}`);
    assert.equal(conversationOf(PRIYA).lastMessagePreview, 'message 5', `seed ${s}: summary must be the newest`);
  }
});

await test('[6c] 3 messages, each delivered 3 times, all at once: 3 messages, unread = 3', async () => {
  for (let s = 1; s <= 150; s += 1) {
    reset(s);
    const calls = [1, 2, 3].flatMap((n) => Array.from({ length: 3 }, () => deliver(incomingText(`wamid.M${n}`, RAHUL, `m${n}`, { at: TS + n }))));
    const results = await Promise.all(calls);
    assert.ok(results.every((r) => r.status === 200), `seed ${s}`);
    assert.deepEqual([db.conv.length, db.msg.length, conversationOf(RAHUL).unreadCount], [1, 3, 3], `seed ${s}`);
  }
});

await test('[6d] the race paths were really exercised (not just the easy path)', async () => {
  assert.ok(stats.upsertRaces > 0, `conversation-creation races hit: ${stats.upsertRaces}`);
  assert.ok(stats.duplicateInserts > 0, `duplicate-insert races hit: ${stats.duplicateInserts}`);
  assert.ok(stats.claimsLost > 0, `lost unread-claims hit: ${stats.claimsLost}`);
  out(`      (across all runs: ${stats.upsertRaces} conversation races, ${stats.duplicateInserts} duplicate inserts, ${stats.claimsLost} lost claims, all handled)`);
});

section('7-9  message content, types and names');

await test('[7] Marathi, Hindi, emoji and multiline text is stored exactly as sent', async () => {
  const samples = [
    'नमस्कार प्रतीक 🙏\nमला लग्नाचे फोटोग्राफी बुक करायचे आहे\n\nतारीख: १० जून',
    'नमस्ते, शादी की फोटोग्राफी चाहिए 📸\n  (दो स्पेस आगे)  ',
    'Hello 👨‍👩‍👧 family shoot 🎉🎉\r\nsecond line\ttabbed',
    '  leading and trailing spaces  ',
  ];
  for (const [i, text] of samples.entries()) await deliver(incomingText(`wamid.T${i}`, PRIYA, text, { at: TS + i }));
  samples.forEach((text, i) => assert.equal(db.msg.find((m) => m.waMessageId === `wamid.T${i}`).text, text, `sample ${i}`));
});

await test('[7b] the conversation preview is one line and never cuts an emoji in half', async () => {
  assert.equal(previewOf('text', 'line one\n\nline   two'), 'line one line two');
  const long = '🙏'.repeat(250);
  const preview = previewOf('text', long);
  assert.equal(Array.from(preview).length, 100);
  assert.ok(!/[\ud800-\udbff]$/.test(preview) && Array.from(preview).every((ch) => ch === '🙏'), 'a half emoji was produced');
  assert.equal(previewOf('text', '   \n  '), '[Message]');
});

await test('[8] non-text messages are stored with their correct type and no text', async () => {
  const types = ['image', 'audio', 'video', 'document', 'location', 'sticker', 'contacts', 'interactive'];
  for (const [i, type] of types.entries()) {
    await deliver(hook({ messages: [{ from: PRIYA, id: `wamid.N${i}`, timestamp: String(TS + i), type, [type]: { id: 'media-1', caption: 'SHOULD-NOT-BE-STORED' } }] }));
  }
  for (const [i, type] of types.entries()) {
    const m = db.msg.find((x) => x.waMessageId === `wamid.N${i}`);
    assert.deepEqual([m.type, m.text, m.rawType], [type, null, undefined], type);
  }
  assert.equal(conversationOf(PRIYA).unreadCount, types.length);
  assert.equal(conversationOf(PRIYA).lastMessagePreview, '[Reply]');
  assert.ok(!JSON.stringify(db.msg).includes('SHOULD-NOT-BE-STORED'), 'media metadata must not be stored');
});

await test('[8b] types we do not list (reaction, button, order, ...) are stored as "unknown" and keep WhatsApp\'s word in rawType', async () => {
  for (const [i, type] of ['reaction', 'button', 'order', 'system'].entries()) {
    await deliver(hook({ messages: [{ from: RAHUL, id: `wamid.U${i}`, timestamp: String(TS + i), type }] }));
  }
  const rows = db.msg.filter((m) => m.phone === RAHUL);
  assert.deepEqual(rows.map((m) => [m.type, m.rawType, m.text]), [['unknown', 'reaction', null], ['unknown', 'button', null], ['unknown', 'order', null], ['unknown', 'system', null]]);
  assert.equal(conversationOf(RAHUL).lastMessagePreview, '[Unsupported message]');
});

await test('[9] a missing customer name is handled, a later name is saved, a later missing name does not erase it, a newer name replaces it', async () => {
  await deliver(incomingText('wamid.N1', PRIYA, 'no name sent'));
  assert.equal(conversationOf(PRIYA).name, '');
  await deliver(incomingText('wamid.N2', PRIYA, 'with name', { name: 'Priya Patil' }));
  assert.equal(conversationOf(PRIYA).name, 'Priya Patil');
  await deliver(incomingText('wamid.N3', PRIYA, 'name missing again'));
  assert.equal(conversationOf(PRIYA).name, 'Priya Patil');
  await deliver(incomingText('wamid.N4', PRIYA, 'changed her name', { name: 'Priya Deshmukh' }));
  assert.equal(conversationOf(PRIYA).name, 'Priya Deshmukh');
  await deliver(incomingText('wamid.N5', PRIYA, 'blank name', { name: '   ' }));
  assert.equal(conversationOf(PRIYA).name, 'Priya Deshmukh', 'a blank name must not erase the saved one');
  assert.equal(db.conv.length, 1);
});

await test('a message with no usable phone number stores nothing and says so', async () => {
  assert.deepEqual(await storeIncomingMessage({ id: 'wamid.X', from: 'abc', type: 'text', text: 'x', at: null }), { outcome: 'invalid' });
  assert.deepEqual([db.conv.length, db.msg.length], [0, 0]);
});

section('10  failures: retryable errors, recovery, and bad messages');

await test('[10] a database failure answers 500 (so Meta retries) and a retry then stores the message once', async () => {
  fault = () => netError();
  const failedCall = await deliver(incomingText('wamid.A1', PRIYA, 'hi', { name: 'Priya Patil' }));
  assert.equal(failedCall.status, 500);
  assert.deepEqual([db.conv.length, db.msg.length], [0, 0]);
  fault = null;
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi', { name: 'Priya Patil' }))).status, 200);
  assert.deepEqual([db.conv.length, db.msg.length, conversationOf(PRIYA).unreadCount], [1, 1, 1]);
});

await test('[10b] one failing message among several: the others are stored, the answer is 500, the retry adds only the missing one', async () => {
  const payload = hook({ messages: [
    { from: PRIYA, id: 'wamid.G1', timestamp: String(TS), type: 'text', text: { body: 'one' } },
    { from: RAHUL, id: 'wamid.G2', timestamp: String(TS + 1), type: 'text', text: { body: 'two' } },
    { from: PRIYA, id: 'wamid.G3', timestamp: String(TS + 2), type: 'text', text: { body: 'three' } },
  ] });
  let failedOnce = false;
  fault = (op) => (op === 'msg.create' && !failedOnce && db.msg.length === 1 ? ((failedOnce = true), netError()) : undefined); // the 2nd message fails
  assert.equal((await deliver(payload)).status, 500);
  assert.deepEqual(db.msg.map((m) => m.waMessageId).sort(), ['wamid.G1', 'wamid.G3'], 'the valid messages around the failure must still be stored');
  fault = null;
  assert.equal((await deliver(payload)).status, 200);
  assert.deepEqual(db.msg.map((m) => m.waMessageId).sort(), ['wamid.G1', 'wamid.G2', 'wamid.G3']);
  assert.deepEqual([conversationOf(PRIYA).unreadCount, conversationOf(RAHUL).unreadCount], [2, 1], 'already-stored messages must not be counted again on the retry');
});

await test('[10c] a message that can never be stored (invalid data) is skipped and does not make Meta retry forever', async () => {
  let first = true;
  fault = (op) => (op === 'msg.create' && first ? ((first = false), Object.assign(new Error('bad data'), { name: 'ValidationError' })) : undefined);
  const payload = hook({ messages: [
    { from: PRIYA, id: 'wamid.BAD', timestamp: String(TS), type: 'text', text: { body: 'x' } },
    { from: RAHUL, id: 'wamid.OK', timestamp: String(TS + 1), type: 'text', text: { body: 'fine' } },
  ] });
  assert.equal((await deliver(payload)).status, 200);
  assert.deepEqual(db.msg.map((m) => m.waMessageId), ['wamid.OK']);
});

await test('[10d] a malformed message in the payload does not stop a valid one', async () => {
  const payload = hook({ messages: [
    { from: 'abc', id: 'wamid.M1', type: 'text', text: { body: 'bad number' } },
    { from: PRIYA, type: 'text', text: { body: 'no id' } },
    null,
    { from: PRIYA, id: 'wamid.VALID', timestamp: String(TS), type: 'text', text: { body: 'valid one' } },
  ] });
  assert.equal((await deliver(payload)).status, 200);
  assert.deepEqual(db.msg.map((m) => m.waMessageId), ['wamid.VALID']);
});

await test('[10e] crash before the unread claim: the retry finishes the job, unread = exactly 1', async () => {
  let crashed = false;
  fault = (op) => (op === 'msg.updateOne' && !crashed ? ((crashed = true), netError()) : undefined);
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi'))).status, 500);
  assert.equal(db.msg[0].processingStatus, 'received');
  fault = null;
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi'))).status, 200);
  assert.deepEqual([db.msg.length, conversationOf(PRIYA).unreadCount, db.msg[0].processingStatus, conversationOf(PRIYA).lastMessagePreview], [1, 1, 'processed', 'hi']);
});

await test('[10f] KNOWN TRADE-OFF: a crash between the unread claim and the +1 leaves unread one too LOW, never too high; the summary still completes', async () => {
  let crashed = false;
  fault = (op) => (op === 'conv.updateOne' && !crashed ? ((crashed = true), netError()) : undefined); // the +1 itself fails
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi'))).status, 500);
  assert.equal(db.msg[0].processingStatus, 'counted');
  fault = null;
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi'))).status, 200);
  assert.deepEqual([db.msg.length, db.msg[0].processingStatus, conversationOf(PRIYA).lastMessagePreview], [1, 'processed', 'hi']);
  assert.equal(conversationOf(PRIYA).unreadCount, 0, 'documented behaviour: undercount by one (never over-count); Phase 3 mark-read recounts');
});

await test('[10g] crash after the message insert but before the conversation summary: the retry completes the summary', async () => {
  let n = 0;
  fault = (op) => (op === 'conv.updateOne' && (n += 1) === 2 ? netError() : undefined); // 1st = the +1, 2nd = the summary
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hello there'))).status, 500);
  assert.equal(conversationOf(PRIYA).lastMessagePreview, '');
  fault = null;
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hello there'))).status, 200);
  assert.deepEqual([conversationOf(PRIYA).lastMessagePreview, conversationOf(PRIYA).unreadCount, db.msg[0].processingStatus], ['hello there', 1, 'processed']);
});

section('11-12  existing STOP/START and delivery-status behaviour');

await test('[11] STOP records an opt-out AND is stored as a message; START removes the opt-out', async () => {
  assert.equal((await deliver(incomingText('wamid.S1', PRIYA, 'STOP', { name: 'Priya Patil' }))).status, 200);
  assert.ok(db.optOut.has(PRIYA));
  assert.equal(messagesOf(PRIYA)[0].text, 'STOP');
  assert.equal((await deliver(incomingText('wamid.S2', PRIYA, 'start', { at: TS + 5 }))).status, 200);
  assert.ok(!db.optOut.has(PRIYA));
  assert.equal(messagesOf(PRIYA).length, 2);
  await deliver(incomingText('wamid.S3', RAHUL, 'please stop calling me'));
  assert.ok(!db.optOut.has(RAHUL), 'an ordinary sentence is not an opt-out');
});

await test('[12] delivery reports still update notifications (forward only, old failure text cleared)', async () => {
  db.notif.set('wamid.N1', { status: 'sent', lastError: '' });
  db.notif.set('wamid.N2', { status: 'failed', lastError: 'old failure' });
  const statusPayload = (id, status, errors) => hook({ statuses: [{ id, status, timestamp: String(TS + 1), ...(errors && { errors }) }] });
  assert.equal((await deliver(statusPayload('wamid.N1', 'delivered'))).status, 200);
  assert.equal(db.notif.get('wamid.N1').status, 'delivered');
  await deliver(statusPayload('wamid.N1', 'read'));
  assert.equal(db.notif.get('wamid.N1').status, 'read');
  await deliver(statusPayload('wamid.N1', 'delivered'));
  assert.equal(db.notif.get('wamid.N1').status, 'read', 'a late "delivered" must not move it backwards');
  await deliver(statusPayload('wamid.N1', 'failed', [{ title: 'late' }]));
  assert.equal(db.notif.get('wamid.N1').status, 'read', 'a late "failed" must not beat a read');
  await deliver(statusPayload('wamid.N2', 'delivered'));
  assert.deepEqual([db.notif.get('wamid.N2').status, db.notif.get('wamid.N2').lastError], ['delivered', '']);
  assert.equal((await deliver(statusPayload('wamid.UNKNOWN', 'delivered'))).status, 200);
});

await test('a status report and a customer message in the same webhook are both handled', async () => {
  db.notif.set('wamid.N1', { status: 'sent', lastError: '' });
  const payload = hook({ statuses: [{ id: 'wamid.N1', status: 'read', timestamp: String(TS) }], messages: [{ from: PRIYA, id: 'wamid.IN', timestamp: String(TS), type: 'text', text: { body: 'thanks!' } }] });
  assert.equal((await deliver(payload)).status, 200);
  assert.deepEqual([db.notif.get('wamid.N1').status, db.msg.length], ['read', 1]);
});

section('13  webhook security behaviour is unchanged (nothing is stored on a rejected request)');

await test('[13a] wrong secret, missing header, malformed header and a body changed after signing all give 401 and store nothing', async () => {
  const payload = incomingText('wamid.A1', PRIYA, 'hi');
  const body = Buffer.from(JSON.stringify(payload));
  const cases = [
    ['wrong secret', { 'x-hub-signature-256': sign(body, `${SECRET}-wrong`) }, body],
    ['no header', {}, body],
    ['malformed header', { 'x-hub-signature-256': 'sha256=not-hex' }, body],
    ['wrong scheme', { 'x-hub-signature-256': `md5=${'a'.repeat(64)}` }, body],
    ['body changed after signing', { 'x-hub-signature-256': sign(body) }, Buffer.from(JSON.stringify(incomingText('wamid.A1', PRIYA, 'CHANGED')))],
    ['body not raw (already parsed)', { 'x-hub-signature-256': sign(body) }, payload],
  ];
  for (const [label, headers, rawBody] of cases) assert.equal((await deliver(null, { headers, rawBody })).status, 401, label);
  assert.deepEqual([db.conv.length, db.msg.length], [0, 0]);
});

await test('[13b] a correctly signed request that is not JSON gives 400; a missing server secret gives 503; neither stores anything', async () => {
  const garbage = Buffer.from('this is not json');
  assert.equal((await deliver(null, { rawBody: garbage, headers: { 'x-hub-signature-256': sign(garbage) } })).status, 400);
  delete process.env.WHATSAPP_APP_SECRET;
  assert.equal((await deliver(incomingText('wamid.A1', PRIYA, 'hi'))).status, 503);
  process.env.WHATSAPP_APP_SECRET = SECRET;
  assert.deepEqual([db.conv.length, db.msg.length], [0, 0]);
});

section('15  Meta handshake is unchanged');

await test('[15] handshake: right token echoes the challenge (200); wrong token, wrong mode or no configured token give 403', async () => {
  const ask = (query) => { const res = { status(c) { this.code = c; return this; }, type() { return this; }, send(b) { this.body = b; return this; }, sendStatus(c) { this.code = c; return this; } }; verifyHandshake({ query }, res); return res; };
  const ok = ask({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '12345' });
  assert.deepEqual([ok.code, ok.body], [200, '12345']);
  assert.equal(ask({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' }).code, 403);
  assert.equal(ask({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' }).code, 403);
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  assert.equal(ask({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' }).code, 403);
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY;
});

section('schemas (REAL Mongoose, offline) and logging hygiene');

await test('schemas declare the unique indexes and reject bad data', async () => {
  const unique = (model) => model.schema.indexes().filter(([, o]) => o?.unique).map(([k]) => Object.keys(k)[0]);
  assert.deepEqual(unique(Conv), ['phone']);
  assert.deepEqual(unique(Msg), ['waMessageId', 'clientRequestId']); // clientRequestId (replies from the admin screen) arrived in Phase 3
  const oid = new mongoose.Types.ObjectId();
  const good = { conversationId: oid, waMessageId: 'w', phone: PRIYA, type: 'text', waTimestamp: new Date() };
  await new Msg(good).validate();
  for (const bad of [{ type: 'gif' }, { phone: '12' }, { waMessageId: undefined }, { waTimestamp: undefined }, { direction: 'sideways' }, { processingStatus: 'maybe' }, { conversationId: undefined }]) {
    await assert.rejects(new Msg({ ...good, ...bad }).validate(), `should reject ${JSON.stringify(bad)}`);
  }
  await assert.rejects(new Conv({ phone: '123' }).validate());
  await assert.rejects(new Conv({ phone: PRIYA, status: 'archived' }).validate());
  await assert.rejects(new Conv({ phone: PRIYA, unreadCount: -1 }).validate());
});

await test('nothing sensitive was ever logged during ALL the tests above, and the controller prints no diagnostics', async () => {
  const log = captured.join('\n');
  out(`      (${captured.length} log lines were produced by the failure scenarios and scanned)`);
  const forbidden = [PRIYA, RAHUL, 'Priya', 'Rahul', 'Patil', 'wamid', 'नमस्कार', 'hello there', 'SHOULD-NOT-BE-STORED', SECRET, VERIFY, 'sha256=', 'hi', 'one', 'two', 'three'].filter((s) => s.length > 3 || s === 'hi');
  for (const word of forbidden.filter((s) => s !== 'hi')) assert.ok(!log.includes(word), `the logs contain "${word}"`);
  assert.ok(!/[a-f0-9]{64}/.test(log), 'the logs contain something that looks like a signature');
  assert.ok(captured.every((line) => line.startsWith('[whatsapp]')), 'unexpected log line format');
  const allowed = [/^\[whatsapp\] could not store an incoming message \(\w+\)$/, /^\[whatsapp\] skipped an incoming message that cannot be stored \(.+\)$/, /^\[whatsapp\] \d+ incoming message\(s\) could not be stored: answering 500 so Meta retries$/, /^\[whatsapp\] webhook ignored: WHATSAPP_APP_SECRET is not set, so the sender cannot be verified$/];
  for (const line of captured) assert.ok(allowed.some((re) => re.test(line)), `unexpected log line: ${line}`);
});

out(failed ? `\n${failed} of ${count} test(s) FAILED  (mocked database, see the header of this file)` : `\nAll ${count} tests passed  (mocked database, see the header of this file)`);
process.exit(failed ? 1 : 0);
