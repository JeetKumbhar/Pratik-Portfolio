/**
 * npm run test:inbox-api
 *
 * Tests the admin WhatsApp inbox (list, open, mark read, REPLY) over real HTTP, with no database and no internet.
 *
 *   REAL:   the Express routes, login check (JWT + admin role), controllers, utils/whatsappReplies.js, the real sendText()
 *           with its error handling, the signed webhook route, utils/whatsappInbox.js, and the Mongoose schemas.
 *   MOCKED: MongoDB (an in-memory stand-in that enforces unique indexes and updates one document atomically) and
 *           Meta's Graph API (a replacement for fetch that records what would have been sent and answers like Meta does).
 * A pass proves the logic and the HTTP behaviour. It does not prove a real database or a real WhatsApp delivery.
 * (The rate-limit package is not exercised by this test.)
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { WhatsAppConversation as Conv, WhatsAppMessage as Msg, WhatsAppOptOut as OptOut, Notification, User } from '../models/index.js';

const SECRET = 'test_app_secret_not_real';
const TOKEN = 'EAAtest_whatsapp_access_token_not_real_0123456789';
process.env.NODE_ENV = 'test'; // the routes' rate limiter is skipped in tests (the stress test sends hundreds of replies a minute)
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.WHATSAPP_APP_SECRET = SECRET;
process.env.WHATSAPP_ACCESS_TOKEN = TOKEN;
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
process.env.WHATSAPP_API_VERSION = 'v25.0';

const { signToken } = await import('../utils/token.js');
const { default: webhookRoutes } = await import('../routes/whatsappWebhookRoutes.js');
const { default: inboxRoutes } = await import('../routes/whatsappInboxRoutes.js');
const { errorHandler, notFound } = await import('../middleware/errorMiddleware.js');

// ---------------------------------------------------------------------- capture console output
const captured = [];
for (const level of ['log', 'info', 'warn', 'error']) console[level] = (...a) => captured.push(a.map(String).join(' '));
const out = (line) => process.stdout.write(`${line}\n`);

// ---------------------------------------------------------------------- in-memory MongoDB stand-in
const db = { conv: [], msg: [], optOut: new Set() };
let seed = 1;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const tick = async () => { for (let i = Math.floor(rnd() * 3); i > 0; i -= 1) await new Promise((r) => setImmediate(r)); };
const dupKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
const isId = (v) => v && typeof v === 'object' && v._bsontype;
const keyOf = (v) => (v instanceof Date ? +v : isId(v) ? String(v) : v);
const same = (a, b) => keyOf(a) === keyOf(b);

function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const value = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !isId(cond) && !(cond instanceof RegExp)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$lte') return value != null && +value <= +arg;
        if (op === '$gt') return value != null && +value > +arg;
        if (op === '$ne') return !same(value, arg);
        if (op === '$regex') return typeof value === 'string' && new RegExp(arg, cond.$options ?? '').test(value);
        if (op === '$options') return true;
        throw new Error(`the test database does not support the operator ${op}`);
      });
    }
    if (cond === null) return value == null;
    return same(value, cond);
  });
}
function applyUpdate(doc, update, inserting) {
  for (const [op, f] of Object.entries(update)) {
    if (op === '$set') Object.assign(doc, f);
    else if (op === '$inc') Object.entries(f).forEach(([k, n]) => { doc[k] = (doc[k] ?? 0) + n; });
    else if (op === '$setOnInsert') { if (inserting) Object.assign(doc, f); }
    else throw new Error(`the test database does not support the update ${op}`);
  }
}
/** a chainable, awaitable query: find().sort().skip().limit().select().lean() */
function query(table, filter, one) {
  const state = { sort: null, skip: 0, limit: Infinity };
  const run = async () => {
    await tick();
    let rows = db[table].filter((d) => matches(d, filter));
    if (state.sort) {
      rows = [...rows].sort((a, b) => {
        for (const [k, dir] of Object.entries(state.sort)) {
          const x = keyOf(a[k]) ?? -Infinity; const y = keyOf(b[k]) ?? -Infinity;
          if (x !== y) return (x < y ? -1 : 1) * dir;
        }
        return 0;
      });
    }
    rows = rows.slice(state.skip, state.skip + state.limit).map((d) => ({ ...d }));
    return one ? rows[0] ?? null : rows;
  };
  const q = {
    sort(s) { state.sort = s; return q; }, skip(n) { state.skip = n; return q; }, limit(n) { state.limit = n; return q; },
    select() { return q; }, lean() { return q; },
    then: (res, rej) => run().then(res, rej),
  };
  return q;
}
const updateOne = (table) => async (filter, update) => {
  await tick();
  const doc = db[table].find((d) => matches(d, filter));
  if (!doc) return { matchedCount: 0, modifiedCount: 0 };
  const before = JSON.stringify(doc);
  applyUpdate(doc, update, false);
  return { matchedCount: 1, modifiedCount: JSON.stringify(doc) === before ? 0 : 1 };
};

Conv.findOneAndUpdate = async (filter, update, options) => {
  await tick();
  let doc = db.conv.find((d) => matches(d, filter));
  if (!doc) {
    if (!options?.upsert) return null;
    await tick();
    if (db.conv.some((d) => d.phone === filter.phone)) throw dupKey();
    doc = { _id: new mongoose.Types.ObjectId(), ...filter, name: '', contactId: '', lastMessagePreview: '' };
    applyUpdate(doc, update, true);
    db.conv.push(doc);
  } else applyUpdate(doc, update, false);
  return { ...doc };
};
Conv.findById = (id) => query('conv', { _id: id }, true);
Conv.find = (filter) => query('conv', filter ?? {}, false);
Conv.countDocuments = async (filter) => (await tick(), db.conv.filter((d) => matches(d, filter ?? {})).length);
Conv.updateOne = updateOne('conv');

Msg.create = async (data) => {
  await tick();
  const document = new Msg(data);
  await document.validate(); // REAL schema validation
  const row = { ...document.toObject(), createdAt: new Date() };
  if (db.msg.some((m) => m.waMessageId === row.waMessageId)) throw dupKey();
  if (typeof row.clientRequestId === 'string' && db.msg.some((m) => m.clientRequestId === row.clientRequestId)) throw dupKey();
  db.msg.push(row);
  return { ...row, toObject: () => ({ ...row }) };
};
Msg.findOne = (filter) => query('msg', filter, true);
Msg.find = (filter) => query('msg', filter ?? {}, false);
Msg.countDocuments = async (filter) => (await tick(), db.msg.filter((d) => matches(d, filter ?? {})).length);
Msg.updateOne = updateOne('msg');
Msg.updateMany = async (filter, update) => { await tick(); const rows = db.msg.filter((d) => matches(d, filter)); rows.forEach((d) => applyUpdate(d, update, false)); return { modifiedCount: rows.length }; };

OptOut.findOne = ({ phone }) => { const q = { lean: () => q, then: (res, rej) => Promise.resolve(db.optOut.has(phone) ? { phone } : null).then(res, rej) }; return q; };
OptOut.updateOne = async (filter) => { db.optOut.add(filter.phone); return {}; };
OptOut.deleteOne = async (filter) => { db.optOut.delete(filter.phone); return {}; };
Notification.findOne = async () => null;

const ADMIN_ID = new mongoose.Types.ObjectId();
const VIEWER_ID = new mongoose.Types.ObjectId();
User.findById = async (id) => (String(id) === String(ADMIN_ID) ? { _id: ADMIN_ID, role: 'admin' } : String(id) === String(VIEWER_ID) ? { _id: VIEWER_ID, role: 'user' } : null);
const ADMIN = signToken(ADMIN_ID);
const VIEWER = signToken(VIEWER_ID);

// ---------------------------------------------------------------------- mocked Meta (Graph API)
const realFetch = globalThis.fetch;
const meta = { calls: [], next: null, counter: 0 }; // next: a function (callBody) → Response-like, or null for success
globalThis.fetch = async (url, options = {}) => {
  if (!String(url).startsWith('https://graph.facebook.com/')) return realFetch(url, options);
  const body = JSON.parse(options.body);
  meta.calls.push({ url: String(url), auth: options.headers?.Authorization, body });
  await tick();
  const custom = meta.next?.(body);
  if (custom === 'network') throw new TypeError('fetch failed');
  if (custom) return { ok: false, status: custom.status, json: async () => custom.json };
  meta.counter += 1;
  return { ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp', contacts: [{ wa_id: body.to }], messages: [{ id: `wamid.OUT${meta.counter}` }] }) };
};
const metaError = (status, code, message = 'Meta says no') => () => ({ status, json: { error: { code, message } } });

// ---------------------------------------------------------------------- the real app, on a real port
const app = express();
app.use('/api/webhooks/whatsapp', webhookRoutes);
app.use(express.json({ limit: '10kb' }));
app.use('/api/whatsapp', inboxRoutes);
app.use(notFound);
app.use(errorHandler);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

async function api(path, { method = 'GET', body, token = ADMIN } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await realFetch(`${BASE}/api/whatsapp${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* none */ }
  return { status: res.status, data };
}
const sign = (body) => `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
async function webhook(value) {
  const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] }));
  const res = await realFetch(`${BASE}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) }, body });
  return res.status;
}
const nowSec = () => Math.floor(Date.now() / 1000);
const inbound = (id, phone, text, { name, agoSeconds = 5, type = 'text' } = {}) => webhook({
  ...(name !== undefined && { contacts: [{ wa_id: phone, profile: { name } }] }),
  messages: [{ from: phone, id, timestamp: String(nowSec() - agoSeconds), type, ...(type === 'text' ? { text: { body: text } } : { [type]: { id: 'm1' } }) }],
});
const statusReport = (id, status, errors) => webhook({ statuses: [{ id, status, timestamp: String(nowSec()), ...(errors && { errors }) }] });

const PRIYA = '919876543210';
const RAHUL = '919811122233';
const reqId = (() => { let n = 0; return () => `req-${String(++n).padStart(6, '0')}-${Math.random().toString(36).slice(2, 8)}`; })();
const conv = (phone) => db.conv.find((c) => c.phone === phone);
const convId = (phone) => String(conv(phone)._id);

let failed = 0; let count = 0;
async function test(name, fn) {
  db.conv.length = 0; db.msg.length = 0; db.optOut.clear(); meta.calls.length = 0; meta.next = null; meta.counter = 0; seed = 1;
  process.env.WHATSAPP_ACCESS_TOKEN = TOKEN;
  count += 1;
  try { await fn(); out(`PASS  ${name}`); } catch (err) { failed += 1; out(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
}
const section = (t) => out(`\n--- ${t} ---`);

section('who may use it');

await test('every inbox route refuses a missing token (401) and a non-admin (403)', async () => {
  await inbound('wamid.A1', PRIYA, 'hi');
  const id = convId(PRIYA);
  const routes = [['GET', '/conversations'], ['GET', '/unread-count'], ['GET', `/conversations/${id}/messages`], ['POST', `/conversations/${id}/read`], ['POST', `/conversations/${id}/reply`, { text: 'x', clientRequestId: reqId() }]];
  for (const [method, path, body] of routes) {
    assert.equal((await api(path, { method, body, token: null })).status, 401, `no token ${method} ${path}`);
    assert.equal((await api(path, { method, body, token: 'garbage' })).status, 401, `bad token ${method} ${path}`);
    assert.equal((await api(path, { method, body, token: VIEWER })).status, 403, `non-admin ${method} ${path}`);
  }
  assert.equal(meta.calls.length, 0, 'nothing may be sent to WhatsApp for a refused request');
  assert.equal(db.msg.length, 1);
});

section('seeing the messages that were stored');

await test('a customer message that arrived by webhook shows up in the conversation list and thread (Marathi, emoji, line breaks intact)', async () => {
  const text = 'नमस्कार प्रतीक 🙏\nलग्नाचे फोटोग्राफी बुक करायचे आहे';
  assert.equal(await inbound('wamid.A1', PRIYA, text, { name: 'Priya Patil' }), 200);
  const list = (await api('/conversations')).data;
  assert.equal(list.success, true);
  assert.equal(list.data.length, 1);
  const c = list.data[0];
  assert.deepEqual([c.phone, c.name, c.unreadCount, c.lastMessageDirection, c.status], [PRIYA, 'Priya Patil', 1, 'incoming', 'open']);
  assert.equal(c.lastMessagePreview, 'नमस्कार प्रतीक 🙏 लग्नाचे फोटोग्राफी बुक करायचे आहे');
  assert.deepEqual(list.counts, { all: 1, unread: 1, unreadMessages: 1 });
  const thread = (await api(`/conversations/${c.id}/messages`)).data;
  assert.equal(thread.messages.length, 1);
  assert.deepEqual([thread.messages[0].direction, thread.messages[0].type, thread.messages[0].text], ['incoming', 'text', text]);
  assert.deepEqual([thread.reply.windowOpen, thread.reply.optedOut], [true, false]);
});

await test('the API never leaks internal fields (no raw ids of other documents, no __v, no processing state)', async () => {
  await inbound('wamid.A1', PRIYA, 'hi', { name: 'Priya' });
  const c = (await api('/conversations')).data.data[0];
  assert.deepEqual(Object.keys(c).sort(), ['id', 'lastMessageAt', 'lastMessageDirection', 'lastMessagePreview', 'name', 'phone', 'status', 'unreadCount']);
  const m = (await api(`/conversations/${c.id}/messages`)).data.messages[0];
  assert.deepEqual(Object.keys(m).sort(), ['direction', 'id', 'text', 'type', 'waTimestamp']);
});

await test('list: newest activity first, search by name or number, unread-only, and paging', async () => {
  await inbound('wamid.1', PRIYA, 'old', { name: 'Priya Patil', agoSeconds: 300 });
  await inbound('wamid.2', RAHUL, 'new', { name: 'Rahul Shah', agoSeconds: 10 });
  const all = (await api('/conversations')).data;
  assert.deepEqual(all.data.map((c) => c.phone), [RAHUL, PRIYA]);
  assert.deepEqual((await api('/conversations?search=priya')).data.data.map((c) => c.phone), [PRIYA]);
  assert.deepEqual((await api('/conversations?search=981112')).data.data.map((c) => c.phone), [RAHUL]);
  assert.equal((await api('/conversations?search=' + encodeURIComponent('.*'))).data.data.length, 0, 'search must not be treated as a regular expression');
  await api(`/conversations/${convId(PRIYA)}/read`, { method: 'POST' });
  assert.deepEqual((await api('/conversations?unread=1')).data.data.map((c) => c.phone), [RAHUL]);
  const paged = (await api('/conversations?limit=1&page=2')).data;
  assert.deepEqual([paged.data.map((c) => c.phone), paged.total, paged.pages], [[PRIYA], 2, 2]);
  assert.equal((await api('/conversations?page=1&page=2')).status, 400, 'repeated (array) query values are refused');
});

await test('opening a thread and marking it read zeroes the unread count and the sidebar badge', async () => {
  await inbound('wamid.1', PRIYA, 'one');
  await inbound('wamid.2', PRIYA, 'two');
  await inbound('wamid.3', RAHUL, 'three');
  assert.equal((await api('/unread-count')).data.unread, 3);
  const r = await api(`/conversations/${convId(PRIYA)}/read`, { method: 'POST' });
  assert.deepEqual([r.status, r.data.unreadCount], [200, 0]);
  assert.equal((await api('/unread-count')).data.unread, 1);
  assert.equal(conv(PRIYA).unreadCount, 0);
  assert.ok(db.msg.filter((m) => m.phone === PRIYA).every((m) => m.readAt), 'messages are stamped read');
});

await test('mark-read RECOUNTS: it repairs an undercount, and ignores a message the webhook is still processing', async () => {
  await inbound('wamid.1', PRIYA, 'one');
  await inbound('wamid.2', PRIYA, 'two');
  conv(PRIYA).unreadCount = 0; // simulate the Phase 2 crash trade-off (one too low)
  db.msg.push({ _id: new mongoose.Types.ObjectId(), conversationId: conv(PRIYA)._id, waMessageId: 'wamid.HALF', phone: PRIYA, direction: 'incoming', type: 'text', text: 'half-stored', waTimestamp: new Date(), processingStatus: 'received' });
  const r = await api(`/conversations/${convId(PRIYA)}/read`, { method: 'POST' });
  assert.equal(r.data.unreadCount, 0, 'the two processed messages were read and the undercount repaired (it was 0 by hand, the real value is 0 too)');
  const half = db.msg.find((m) => m.waMessageId === 'wamid.HALF');
  assert.deepEqual([half.readAt, half.processingStatus], [undefined, 'received'], 'a message the webhook is still storing is left alone: its own +1 will arrive afterwards');
  // and the undercount repair itself: unread messages that are fully processed are counted even when the stored number is too low
  await inbound('wamid.3', PRIYA, 'three');
  await inbound('wamid.4', PRIYA, 'four');
  conv(PRIYA).unreadCount = 0;
  assert.equal((await api(`/conversations/${convId(PRIYA)}/read`, { method: 'POST' })).data.unreadCount, 0, 'reading marks them read, so the right count after reading is 0');
  assert.equal(db.msg.filter((m) => m.phone === PRIYA && m.direction === 'incoming' && m.processingStatus === 'processed' && !m.readAt).length, 0);
});

await test('bad ids give 404, never a crash', async () => {
  for (const id of ['abc', '000000000000000000000000', '../etc', 'a'.repeat(24)]) {
    assert.equal((await api(`/conversations/${id}/messages`)).status, 404, id);
    assert.equal((await api(`/conversations/${id}/read`, { method: 'POST' })).status, 404, id);
    assert.equal((await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'x', clientRequestId: reqId() } })).status, 404, id);
  }
  assert.equal(meta.calls.length, 0);
});

section('replying: the happy path');

await test('a reply is sent to the right number with the exact text, saved as outgoing, and shown in the thread', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello', { name: 'Priya Patil' });
  const text = 'नमस्कार प्रिया 🙏\nतुमची तारीख उपलब्ध आहे.\n\n— प्रतीक';
  const r = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text, clientRequestId: reqId() } });
  assert.equal(r.status, 201);
  assert.deepEqual([r.data.success, r.data.duplicate, r.data.data.direction, r.data.data.deliveryStatus, r.data.data.text], [true, false, 'outgoing', 'sent', text]);
  assert.equal(meta.calls.length, 1);
  const call = meta.calls[0];
  assert.equal(call.url, 'https://graph.facebook.com/v25.0/123456789012345/messages');
  assert.equal(call.auth, `Bearer ${TOKEN}`);
  assert.deepEqual(call.body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: PRIYA, type: 'text', text: { preview_url: false, body: text } });
  const stored = db.msg.find((m) => m.direction === 'outgoing');
  assert.deepEqual([stored.waMessageId, stored.deliveryStatus, stored.phone, stored.processingStatus], ['wamid.OUT1', 'sent', PRIYA, 'processed']);
  const c = conv(PRIYA);
  assert.deepEqual([c.lastMessageDirection, c.lastMessagePreview, c.unreadCount], ['outgoing', 'नमस्कार प्रिया 🙏 तुमची तारीख उपलब्ध आहे. — प्रतीक', 1]);
  const thread = (await api(`/conversations/${convId(PRIYA)}/messages`)).data.messages;
  assert.deepEqual(thread.map((m) => [m.direction, m.text]), [['incoming', 'Hello'], ['outgoing', text]]);
  assert.equal(thread[1].deliveryStatus, 'sent');
});

await test('delivery reports move a reply forward: sent → delivered → read; late or repeated reports never move it back', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi!', clientRequestId: reqId() } });
  const tick = async () => (await api(`/conversations/${convId(PRIYA)}/messages`)).data.messages.find((m) => m.direction === 'outgoing').deliveryStatus;
  assert.equal(await statusReport('wamid.OUT1', 'sent'), 200);
  assert.equal(await tick(), 'sent');
  await statusReport('wamid.OUT1', 'delivered');
  assert.equal(await tick(), 'delivered');
  await statusReport('wamid.OUT1', 'read');
  assert.equal(await tick(), 'read');
  await statusReport('wamid.OUT1', 'delivered');
  await statusReport('wamid.OUT1', 'failed', [{ title: 'late' }]);
  assert.equal(await tick(), 'read');
  assert.equal(await statusReport('wamid.UNKNOWN', 'delivered'), 200, 'a report for a message we do not know is ignored');
});

await test('a failed delivery report shows the reason on the reply', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi!', clientRequestId: reqId() } });
  await statusReport('wamid.OUT1', 'failed', [{ code: 131026, title: 'Message undeliverable' }]);
  const m = (await api(`/conversations/${convId(PRIYA)}/messages`)).data.messages.find((x) => x.direction === 'outgoing');
  assert.deepEqual([m.deliveryStatus, m.errorText], ['failed', 'Message undeliverable']);
});

await test('customer reply after the admin reply: new unread, summary flips back to incoming, replying again works', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello', { agoSeconds: 30 });
  await api(`/conversations/${convId(PRIYA)}/read`, { method: 'POST' });
  await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } });
  await inbound('wamid.A2', PRIYA, 'Great, thanks', { agoSeconds: -5 }); // the customer writes AFTER our reply
  const c = (await api('/conversations')).data.data[0];
  assert.deepEqual([c.unreadCount, c.lastMessageDirection, c.lastMessagePreview], [1, 'incoming', 'Great, thanks']);
  assert.equal((await api(`/conversations/${c.id}/reply`, { method: 'POST', body: { text: 'You are welcome', clientRequestId: reqId() } })).status, 201);
  assert.equal(meta.calls.length, 2);
});

section('replying: never send twice');

await test('the same clientRequestId sent again returns the first reply (200, duplicate) and sends nothing', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const id = reqId();
  const first = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Once', clientRequestId: id } });
  const again = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Once', clientRequestId: id } });
  assert.deepEqual([first.status, again.status, again.data.duplicate, again.data.data.id], [201, 200, true, first.data.data.id]);
  assert.equal(meta.calls.length, 1);
  assert.equal(db.msg.filter((m) => m.direction === 'outgoing').length, 1);
});

await test('8 identical replies at the same moment (double click, two tabs): exactly ONE message goes to WhatsApp (100 interleavings)', async () => {
  for (let s = 1; s <= 100; s += 1) {
    db.conv.length = 0; db.msg.length = 0; meta.calls.length = 0; meta.counter = 0; seed = s;
    await inbound('wamid.A1', PRIYA, 'Hello');
    const id = reqId();
    const results = await Promise.all(Array.from({ length: 8 }, () => api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Only once please', clientRequestId: id } })));
    assert.ok(results.every((r) => r.status === 200 || r.status === 201), `seed ${s}: ${results.map((r) => r.status)}`);
    assert.equal(results.filter((r) => r.status === 201).length, 1, `seed ${s}: exactly one real send`);
    assert.equal(meta.calls.length, 1, `seed ${s}: WhatsApp must be called once, was ${meta.calls.length}`);
    assert.equal(db.msg.filter((m) => m.direction === 'outgoing').length, 1, `seed ${s}`);
  }
});

section('replying: the rules');

await test('input is validated: empty, blank, not a string, too long, bad or missing clientRequestId → 400 and nothing is sent', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const post = (body) => api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body });
  const cases = [{ text: '', clientRequestId: reqId() }, { text: '   \n ', clientRequestId: reqId() }, { text: 42, clientRequestId: reqId() }, { text: ['a'], clientRequestId: reqId() }, { text: null, clientRequestId: reqId() },
    { text: 'x'.repeat(1501), clientRequestId: reqId() }, { text: '🙏'.repeat(1501), clientRequestId: reqId() }, { text: 'ok' }, { text: 'ok', clientRequestId: 'short' }, { text: 'ok', clientRequestId: 'has spaces and !!!!!!' }, { text: 'ok', clientRequestId: 12345678 }, {}];
  for (const body of cases) assert.equal((await post(body)).status, 400, JSON.stringify(body).slice(0, 60));
  assert.equal(meta.calls.length, 0);
  assert.equal(db.msg.filter((m) => m.direction === 'outgoing').length, 0);
  assert.equal((await post({ text: 'x'.repeat(1500), clientRequestId: reqId() })).status, 201, 'exactly the limit is allowed');
  assert.equal((await post({ text: '🙏'.repeat(1500), clientRequestId: reqId() })).status, 201, '1500 emoji (counted as characters) fit the 10 KB request limit');
});

await test('24-hour window: open at 23h, closed at 23h59m30s (1 minute safety) and at 25h; customer message re-opens it', async () => {
  await inbound('wamid.OLD', PRIYA, 'long ago', { agoSeconds: 25 * 3600 });
  const id = convId(PRIYA);
  const closed = await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'late', clientRequestId: reqId() } });
  assert.equal(closed.status, 409);
  assert.match(closed.data.message, /24-hour/);
  assert.equal((await api(`/conversations/${id}/messages`)).data.reply.windowOpen, false);
  assert.equal(meta.calls.length, 0);
  db.conv.length = 0; db.msg.length = 0;
  await inbound('wamid.EDGE', PRIYA, 'edge', { agoSeconds: 24 * 3600 - 30 });
  assert.equal((await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'x', clientRequestId: reqId() } })).status, 409, 'inside the 1-minute safety margin');
  await inbound('wamid.A23', PRIYA, 'again', { agoSeconds: 23 * 3600 });
  assert.equal((await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'ok', clientRequestId: reqId() } })).status, 201, 'the newest customer message decides');
});

await test('a conversation with no customer message at all cannot be replied to', async () => {
  const c = { _id: new mongoose.Types.ObjectId(), phone: PRIYA, name: '', status: 'open', unreadCount: 0 };
  db.conv.push(c);
  assert.equal((await api(`/conversations/${String(c._id)}/reply`, { method: 'POST', body: { text: 'x', clientRequestId: reqId() } })).status, 409);
});

await test('a customer who sent STOP cannot be messaged (403) until they send START', async () => {
  await inbound('wamid.S1', PRIYA, 'STOP');
  const id = convId(PRIYA);
  assert.equal((await api(`/conversations/${id}/messages`)).data.reply.optedOut, true);
  const r = await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'x', clientRequestId: reqId() } });
  assert.equal(r.status, 403);
  assert.equal(meta.calls.length, 0);
  await inbound('wamid.S2', PRIYA, 'START');
  assert.equal((await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'welcome back', clientRequestId: reqId() } })).status, 201);
});

await test('WhatsApp not configured on the server → 503, nothing saved, nothing sent', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  const r = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'x', clientRequestId: reqId() } });
  assert.equal(r.status, 503);
  assert.equal(db.msg.filter((m) => m.direction === 'outgoing').length, 0);
  assert.equal(meta.calls.length, 0);
});

section('replying: when WhatsApp refuses or cannot be reached');

await test('Meta refusals give 502 with a plain reason, the failed reply is saved and visible, and the access token never appears', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const id = convId(PRIYA);
  const cases = [
    [metaError(400, 131030), /allowed recipient list/],
    [metaError(400, 131047), /24 hours/],
    [metaError(401, 190), /access token is invalid or has expired/],
    [metaError(400, 999, `Something odd with ${TOKEN} inside`), /\[hidden\]/],
    [metaError(500, 1, 'Meta is having a bad day'), /bad day/],
  ];
  for (const [next, expected] of cases) {
    meta.next = next;
    const r = await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } });
    assert.equal(r.status, 502);
    assert.match(r.data.message, expected);
    assert.equal(r.data.data.deliveryStatus, 'failed');
    assert.ok(!JSON.stringify(r.data).includes(TOKEN), 'token leaked into the response');
  }
  const thread = (await api(`/conversations/${id}/messages`)).data.messages.filter((m) => m.direction === 'outgoing');
  assert.equal(thread.length, 5);
  assert.ok(thread.every((m) => m.deliveryStatus === 'failed' && m.errorText), 'each failure is visible with its reason');
  assert.ok(!JSON.stringify(db).includes(TOKEN), 'token leaked into the database');
  assert.equal(conv(PRIYA).lastMessageDirection, 'incoming', 'a failed reply must not become the conversation summary');
});

await test('network failure → 502 "could not reach WhatsApp"; sending again with a NEW request id then works', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const id = convId(PRIYA);
  meta.next = () => 'network';
  const r = await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } });
  assert.equal(r.status, 502);
  assert.match(r.data.message, /Could not reach WhatsApp/);
  meta.next = null;
  assert.equal((await api(`/conversations/${id}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } })).status, 201);
});

await test('re-sending a FAILED reply with the same request id does not call WhatsApp again (it returns the saved failure)', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const id = reqId();
  meta.next = metaError(400, 131030);
  await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: id } });
  meta.next = null;
  const again = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: id } });
  assert.deepEqual([again.status, again.data.duplicate], [200, true]);
  assert.equal(meta.calls.length, 1);
});

await test('a database failure while saving the reply: 500 and WhatsApp is NOT called', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const original = Msg.create;
  Msg.create = async () => { throw Object.assign(new Error('connection lost'), { name: 'MongoNetworkError' }); };
  try {
    const r = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } });
    assert.equal(r.status, 500);
    assert.equal(meta.calls.length, 0, 'no save → no send');
  } finally { Msg.create = original; }
});

await test('WhatsApp accepted but recording the id failed: the customer got it, the reply stays "sending" and the admin still gets success', async () => {
  await inbound('wamid.A1', PRIYA, 'Hello');
  const original = Msg.updateOne;
  Msg.updateOne = async () => { throw Object.assign(new Error('connection lost'), { name: 'MongoNetworkError' }); };
  try {
    const r = await api(`/conversations/${convId(PRIYA)}/reply`, { method: 'POST', body: { text: 'Hi', clientRequestId: reqId() } });
    assert.equal(r.status, 201);
    assert.equal(meta.calls.length, 1);
    assert.equal(db.msg.find((m) => m.direction === 'outgoing').deliveryStatus, 'sending');
  } finally { Msg.updateOne = original; }
});

section('schema (REAL Mongoose) and logging hygiene');

await test('outgoing-message schema: unique clientRequestId index is partial, delivery statuses are validated', async () => {
  const idx = Msg.schema.indexes().find(([k]) => k.clientRequestId);
  assert.ok(idx && idx[1].unique && idx[1].partialFilterExpression, 'unique partial index on clientRequestId');
  const base = { conversationId: new mongoose.Types.ObjectId(), waMessageId: 'w', phone: PRIYA, type: 'text', waTimestamp: new Date(), direction: 'outgoing' };
  for (const s of ['sending', 'sent', 'delivered', 'read', 'failed']) await new Msg({ ...base, deliveryStatus: s }).validate();
  await assert.rejects(new Msg({ ...base, deliveryStatus: 'maybe' }).validate());
  await assert.rejects(new Msg({ ...base, errorText: 'x'.repeat(201) }).validate());
});

await test('nothing sensitive was logged during all the tests above (token, numbers, names, texts, ids, signatures)', async () => {
  const log = captured.join('\n');
  out(`      (${captured.length} log lines were produced and scanned)`);
  for (const word of [TOKEN, SECRET, 'EAA', PRIYA, RAHUL, 'Priya', 'Rahul', 'Patil', 'wamid', 'नमस्कार', 'Hello', 'Only once', 'sha256=', 'Bearer', 'Something odd']) assert.ok(!log.includes(word), `the logs contain "${word}"`);
  assert.ok(!/[a-f0-9]{64}/.test(log), 'something that looks like a signature was logged');
  const allowed = [/^\[whatsapp\] a reply was sent but its WhatsApp id could not be recorded \(\w+\)$/, /^\[whatsapp\] unexpected problem while sending a reply \(\w+\)$/, /^\[whatsapp\] a failed reply could not be marked as failed \(\w+\)$/];
  // lines printed by the error handler for the two deliberate database failures (500) are error dumps, not data
  const dump = (line) => /^(MongoNetworkError|Error)\b/.test(line) || /^\s+at /.test(line);
  for (const line of captured) assert.ok(allowed.some((re) => re.test(line)) || dump(line), `unexpected log line: ${line.slice(0, 120)}`);
});

server.close();
out(failed ? `\n${failed} of ${count} test(s) FAILED  (mocked database and Meta, see the header of this file)` : `\nAll ${count} tests passed  (mocked database and Meta, see the header of this file)`);
process.exit(failed ? 1 : 0);
