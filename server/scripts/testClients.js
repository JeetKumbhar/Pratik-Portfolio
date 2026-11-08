/**
 * npm run test:clients
 *
 * Runs the REAL Express routes, middleware (login check, admin check, error handler), controllers, validation, services and
 * Mongoose schemas for the Clients section, over real HTTP, against an IN-MEMORY STAND-IN for MongoDB.
 *
 * WHAT THAT MEANS (read before trusting a green result):
 *   - NOT tested here: a real MongoDB server. The stand-in replaces the Model methods (find, create, updateOne, aggregate, ...).
 *     Its filters and the aggregation pipelines are executed by the `mingo` library (an independent implementation of
 *     MongoDB's query and aggregation language), so the pipelines are really run and checked, but a real server may still
 *     differ in small ways. UNIQUE INDEXES are simulated by hand (normalizedPhone). Real indexes are not built here.
 *   - NOT tested here: Meta / WhatsApp. WhatsApp senders come in through the same function the webhook calls.
 *   - Tested for real: schema validation, the auth middleware, request validation, response shapes, the "client is created when a
 *     booking is CONFIRMED" rules (real PATCH /api/bookings/:id controller), the WhatsApp linking rules, duplicate prevention under
 *     simultaneous requests, and that no private data leaks.
 * To check against a real database, run the server and use `npm run test:clients-api`.
 *
 * Needs the `mingo` dev dependency (npm install).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BUSINESS_TIMEZONE = 'Asia/Kolkata';
process.env.CLIENT_DEFAULT_COUNTRY_CODE = '91';
delete process.env.WHATSAPP_ACCESS_TOKEN; // no outgoing WhatsApp from tests
delete process.env.SMTP_HOST;

const { Aggregator, Query } = await import('mingo').catch(() => {
  console.log('SKIPPED: this test needs the "mingo" dev dependency. Run: npm install');
  process.exit(1);
});
const { Booking, BlockedDate, Client, ClientNote, Package, Service, Setting, User, WhatsAppConversation } = await import('../models/index.js');
const { signToken } = await import('../utils/token.js');
const { errorHandler, notFound } = await import('../middleware/errorMiddleware.js');
const { default: clientRoutes } = await import('../routes/clientRoutes.js');
const { createBooking, updateBooking } = await import('../controllers/bookingController.js');
const { protect } = await import('../middleware/authMiddleware.js');
const { adminOnly } = await import('../middleware/adminMiddleware.js');
const clientsService = await import('../utils/clients.js');
const { addDays, todayKey } = await import('../utils/validators.js');

// ---------------------------------------------------------------------- quiet console (and a record of what was logged)
const logs = [];
const realLog = console.log;
const realError = console.error;
const out = (s) => realLog(s);
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));

// ---------------------------------------------------------------------- the in-memory stand-in
const db = { clients: [], bookings: [], conversations: [], notes: [], users: [] };
const tables = { clients: db.clients, bookings: db.bookings, whatsappconversations: db.conversations, clientnotes: db.notes };
const faults = { clientCreate: false, bookingSave: false };
const tick = () => new Promise((r) => setImmediate(r)); // lets simultaneous requests interleave, like real database calls do
const dupKey = (keyValue) => Object.assign(new Error('E11000 duplicate key error'), { code: 11000, keyValue });

const plain = (v) => {
  if (v === null || v === undefined || v instanceof Date || v instanceof RegExp) return v;
  if (v._bsontype === 'ObjectId') return String(v);
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') {
    if (typeof v.toObject === 'function') return plain(v.toObject());
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
};
const matches = (row, filter) => new Query(plain(filter ?? {})).test(row);
const compare = (a, b) => {
  const x = a instanceof Date ? +a : a;
  const y = b instanceof Date ? +b : b;
  if (x == null && y == null) return 0;
  if (x == null) return -1; // MongoDB sorts missing/null first when ascending
  if (y == null) return 1;
  return x < y ? -1 : x > y ? 1 : 0;
};
const sortRows = (rows, sort) => {
  if (!sort) return rows;
  const keys = Object.entries(sort);
  return [...rows].sort((a, b) => { for (const [k, dir] of keys) { const c = compare(a[k], b[k]); if (c) return c * dir; } return 0; });
};
const applyUpdate = (row, update) => {
  let changed = false;
  for (const [k, v] of Object.entries(plain(update.$set ?? {}))) { if (JSON.stringify(row[k]) !== JSON.stringify(v)) { row[k] = v; changed = true; } }
  if (changed) row.updatedAt = new Date();
  return changed;
};

/** a Mongoose-style query you can chain (.sort .select .limit .lean) and await */
const query = (run) => {
  const state = {};
  const q = {
    sort(s) { state.sort = s; return q; },
    select() { return q; },
    limit(n) { state.limit = n; return q; },
    lean() { state.lean = true; return q; },
    then(res, rej) { return tick().then(() => run(state)).then(res, rej); },
  };
  return q;
};

function install(Model, table, { unique = [] } = {}) {
  const rows = db[table];
  const attach = (doc) => {
    doc.save = async function save() {
      await this.validate();
      const raw = plain(this.toObject());
      const i = rows.findIndex((r) => r._id === raw._id);
      for (const f of unique) if (rows.some((r) => r._id !== raw._id && r[f] === raw[f])) throw dupKey({ [f]: raw[f] });
      raw.updatedAt = new Date();
      if (i === -1) rows.push({ createdAt: new Date(), ...raw }); else Object.assign(rows[i], raw);
      return this;
    };
    doc.deleteOne = async function deleteOne() { const i = rows.findIndex((r) => r._id === String(this._id)); if (i !== -1) rows.splice(i, 1); return { deletedCount: 1 }; };
    return doc;
  };
  const open = (row, state) => (state.lean ? structuredClone(row) : attach(Model.hydrate(structuredClone(row))));

  Model.findOne = (filter) => query((s) => { const row = sortRows(rows.filter((r) => matches(r, filter)), s.sort)[0]; return row ? open(row, s) : null; });
  Model.findById = (id) => Model.findOne({ _id: String(id) });
  Model.find = (filter) => query((s) => sortRows(rows.filter((r) => matches(r, filter)), s.sort).slice(0, s.limit ?? Infinity).map((r) => open(r, s)));
  Model.countDocuments = async (filter) => { await tick(); return rows.filter((r) => matches(r, filter)).length; };
  Model.exists = async (filter) => { await tick(); const r = rows.find((x) => matches(x, filter)); return r ? { _id: r._id } : null; };
  Model.create = async (data) => {
    await tick();
    const doc = new Model(data);
    await doc.validate();
    const raw = plain(doc.toObject());
    await tick(); // the gap in which a simultaneous request can insert the same number
    for (const f of unique) if (rows.some((r) => r[f] === raw[f])) throw dupKey({ [f]: raw[f] });
    const now = new Date();
    rows.push({ ...raw, createdAt: raw.createdAt ?? now, updatedAt: now });
    return attach(Model.hydrate(structuredClone(rows.at(-1))));
  };
  Model.updateOne = async (filter, update) => {
    await tick();
    const row = rows.find((r) => matches(r, filter));
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    return { matchedCount: 1, modifiedCount: applyUpdate(row, update) ? 1 : 0 };
  };
  Model.updateMany = async (filter, update) => {
    await tick();
    const hit = rows.filter((r) => matches(r, filter));
    return { matchedCount: hit.length, modifiedCount: hit.filter((r) => applyUpdate(r, update)).length };
  };
  Model.aggregate = async (pipeline) => {
    await tick();
    return new Aggregator(plain(pipeline), { collectionResolver: (name) => tables[name] ?? [] }).run(structuredClone(rows));
  };
}

install(Client, 'clients', { unique: ['normalizedPhone'] });
install(ClientNote, 'notes');
install(Booking, 'bookings');
install(WhatsAppConversation, 'conversations');
install(User, 'users');
Booking.prototype.save = async function saveBooking() {
  await this.validate();
  await tick();
  if (faults.bookingSave) throw dupKey({ slotKeys: 'taken' });
  const raw = plain(this.toObject());
  db.bookings.push({ ...raw, createdAt: raw.createdAt ?? new Date(), updatedAt: new Date() });
  return this;
};
BlockedDate.find = () => query(() => []);
// Booking now reads the Settings document (none saved here → defaults) and checks the service exists (services are records now).
Setting.findOne = () => ({ lean: async () => null });
Service.findOne = async ({ slug }) => ({ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), active: true });
Package.findOne = async ({ slug }) => ({ _id: new mongoose.Types.ObjectId(), slug, name: 'Standard', price: 5000, duration: '1 hour', durationHours: 1 });
const realClientCreate = Client.create;

// The booking and webhook code only does its CRM step while the database connection is up. Tests flip this switch.
let connected = true;
Object.defineProperty(mongoose.connection, 'readyState', { get: () => (connected ? 1 : 0), configurable: true });

// ---------------------------------------------------------------------- a real HTTP server with the real routes
const ADMIN = { _id: new mongoose.Types.ObjectId(), name: 'Pratik Shelke', role: 'admin' };
const OUTSIDER = { _id: new mongoose.Types.ObjectId(), name: 'Someone Else', role: 'customer' };
User.findById = async (id) => [ADMIN, OUTSIDER].find((u) => String(u._id) === String(id)) ?? null;
const adminToken = signToken(ADMIN._id);
const outsiderToken = signToken(OUTSIDER._id);

const app = express();
app.use(express.json());
app.post('/api/bookings', createBooking); // the real controller (the route-level rate limiter is left out so the test can book freely)
app.patch('/api/bookings/:id', protect, adminOnly, updateBooking); // the real status change: this is where a client is created
app.use('/api/clients', clientRoutes);
app.use(notFound);
app.use(errorHandler);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, { body, token = adminToken } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, text: JSON.stringify(json) };
}
const get = (path, o) => call('GET', path, o);
const post = (path, body, o) => call('POST', path, { body, ...o });
const patch = (path, body, o) => call('PATCH', path, { body, ...o });

// ---------------------------------------------------------------------- helpers to build situations
const PRIYA = '919876543210';
let bookingDay = 40;
const bookingBody = (o = {}) => ({
  name: 'Priya Sharma', email: 'priya@example.com', phone: '+91 98765 43210', shootType: 'wedding', location: 'studio', numberOfPeople: 2,
  package: { id: 'standard' }, date: addDays(todayKey(), bookingDay += 1), time: '10:00', ...o,
});
const book = (o) => post('/api/bookings', bookingBody(o), { token: null });
/** the admin sets a booking's status (default: confirmed). `r` = the response of book() */
const setStatus = (r, status = 'confirmed', extra = {}) => patch(`/api/bookings/${r.json.data.reference}`, { status, ...extra });
const confirm = (r, extra) => setStatus(r, 'confirmed', extra);
const bookAndConfirm = async (o) => { const r = await book(o); const c = await confirm(r); assert.equal(c.status, 200, c.text); return { booking: r, confirmed: c }; };
const clientByPhone = (p) => db.clients.find((c) => c.normalizedPhone === p);
const seedClient = (o = {}) => {
  const row = { _id: String(new mongoose.Types.ObjectId()), name: 'Seed', phone: '+91 90000 00000', normalizedPhone: '919000000000', email: '', city: '', source: 'manual', nameSource: 'manual', createdAt: new Date(), updatedAt: new Date(), ...o };
  db.clients.push(row);
  return row;
};
const seedBooking = (clientId, o = {}) => {
  const row = { _id: String(new mongoose.Types.ObjectId()), bookingId: `AM-${String(db.bookings.length + 1).padStart(6, '0')}`, name: 'Seed', email: 's@example.com', phone: '+91 90000 00000', shootType: 'wedding', location: 'studio', package: { name: 'Standard' }, date: addDays(todayKey(), 10), time: '10:00', status: 'pending', createdAt: new Date(), ...o, ...(clientId && { clientId }) };
  db.bookings.push(row);
  return row;
};
const seedConversation = (o = {}) => {
  const row = { _id: String(new mongoose.Types.ObjectId()), phone: PRIYA, name: '', lastMessagePreview: 'Hello Pratik', lastMessageAt: new Date('2026-11-04T10:00:00Z'), lastMessageDirection: 'in', unreadCount: 2, status: 'open', createdAt: new Date(), ...o };
  db.conversations.push(row);
  return row;
};
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

function reset() {
  Object.values(db).forEach((t) => { t.length = 0; });
  faults.clientCreate = false;
  faults.bookingSave = false;
  Client.create = realClientCreate;
  logs.length = 0;
  bookingDay = 40;
}

// ---------------------------------------------------------------------- tiny test runner
let failed = 0;
let count = 0;
async function test(name, fn) {
  reset();
  count += 1;
  try { await fn(); out(`PASS  ${name}`); } catch (err) { failed += 1; out(`FAIL  ${name}\n      ${String(err.stack ?? err.message).split('\n').slice(0, 9).join('\n      ')}`); }
}
const section = (t) => out(`\n--- ${t} ---`);

// ======================================================================= 1  admin authentication and authorization
section('1  admin authentication and authorization');
const ROUTES = [
  ['GET', '/api/clients/stats'], ['GET', '/api/clients'], ['POST', '/api/clients'], ['GET', '/api/clients/ID'], ['PATCH', '/api/clients/ID'],
  ['GET', '/api/clients/ID/bookings'], ['GET', '/api/clients/ID/whatsapp'], ['GET', '/api/clients/ID/notes'], ['POST', '/api/clients/ID/notes'],
  ['PATCH', '/api/clients/ID/notes/NID'], ['DELETE', '/api/clients/ID/notes/NID'],
];
await test('[1] every client route refuses a visitor with no token or a bad token (401), and answers nothing private', async () => {
  const c = seedClient({ name: 'Secret Name' });
  for (const [method, path] of ROUTES) {
    const p = path.replace('NID', '000000000000000000000001').replace('ID', c._id);
    for (const token of [null, 'garbage', `${adminToken}x`]) {
      const r = await call(method, p, { token, body: method === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${method} ${path} with ${token}`);
      assert.ok(!r.text.includes('Secret Name'));
    }
  }
});
await test('[2] a logged-in user who is not an admin gets 403 on every client route', async () => {
  const c = seedClient();
  for (const [method, path] of ROUTES) {
    const p = path.replace('NID', '000000000000000000000001').replace('ID', c._id);
    const r = await call(method, p, { token: outsiderToken, body: method === 'GET' ? undefined : {} });
    assert.equal(r.status, 403, `${method} ${path}`);
  }
});
await test('[3] an admin is let in', async () => {
  assert.equal((await get('/api/clients/stats')).status, 200);
  assert.equal((await get('/api/clients')).status, 200);
});

// ======================================================================= 2  clients are created by confirmed bookings only
section('2  there is no manual "add client": clients come from confirmed bookings');
await test('[4] POST /api/clients no longer exists (an admin gets 404) and nothing is created', async () => {
  const r = await post('/api/clients', { name: 'Priya Sharma', phone: '+91 98765 43210', email: 'priya@example.com' });
  assert.equal(r.status, 404);
  assert.equal(db.clients.length, 0);
  assert.equal((await post('/api/clients', { name: 'x' }, { token: null })).status, 401); // still private
});
await test('[5] a pending booking creates NO client (and the public response carries no internal link)', async () => {
  const r = await book();
  assert.equal(r.status, 201);
  assert.equal(r.json.data.status, 'pending');
  assert.equal(db.clients.length, 0);
  assert.equal(db.bookings[0].clientId, undefined);
  assert.ok(!('clientId' in r.json.data));
  const stats = await get('/api/clients/stats');
  assert.deepEqual(stats.json.data, { total: 0, newThisMonth: 0, repeat: 0, totalBookings: 0 });
});
await test('[6] FIRST booking confirmed → exactly one client is created from the booking and the booking is linked to it', async () => {
  const { booking, confirmed } = await bookAndConfirm();
  assert.equal(confirmed.json.clientLink, 'created');
  assert.ok(!confirmed.json.warnings);
  assert.equal(db.clients.length, 1);
  const c = db.clients[0];
  assert.equal(c.normalizedPhone, PRIYA);
  assert.equal(c.phone, '+91 98765 43210');
  assert.equal(c.name, 'Priya Sharma');
  assert.equal(c.nameSource, 'booking');
  assert.equal(c.source, 'booking');
  assert.equal(c.email, 'priya@example.com');
  assert.equal(c.city, '');
  assert.equal(db.bookings[0].status, 'confirmed');
  assert.equal(db.bookings[0].clientId, c._id);
  assert.ok(!('clientId' in confirmed.json.data), 'the booking response must not carry the internal link');
  assert.ok(!confirmed.text.includes(c._id));
  const detail = await get(`/api/clients/${c._id}`);
  assert.equal(detail.json.data.summary.totalBookings, 1);
  assert.equal(detail.json.data.summary.type, 'new');
  assert.deepEqual((await get('/api/clients/stats')).json.data, { total: 1, newThisMonth: 1, repeat: 0, totalBookings: 1 });
  assert.equal(booking.status, 201);
});
await test('[7] SECOND booking of the same customer confirmed → the existing client is updated, not duplicated (other format, other email)', async () => {
  await bookAndConfirm();
  const { booking, confirmed } = await bookAndConfirm({ phone: '098765 43210', email: 'priya.work@example.com', name: 'Priya S' });
  assert.equal(confirmed.json.clientLink, 'linked');
  assert.equal(db.clients.length, 1);
  const c = db.clients[0];
  assert.equal(c.email, 'priya@example.com'); // the client keeps its own email
  assert.equal(c.name, 'Priya Sharma'); // the first booking's name stays (same rank, never overwritten)
  assert.equal(db.bookings.length, 2);
  assert.ok(db.bookings.every((b) => b.clientId === c._id));
  assert.equal(db.bookings[1].email, 'priya.work@example.com'); // the booking keeps what the customer typed
  const detail = (await get(`/api/clients/${c._id}`)).json.data;
  assert.equal(detail.summary.totalBookings, 2);
  assert.equal(detail.summary.type, 'repeat');
  assert.equal((await get('/api/clients/stats')).json.data.totalBookings, 2);
  assert.equal(booking.status, 201);
});
await test('[8] the SAME booking confirmed twice (and cancelled → pending → confirmed again) never duplicates the client or the count', async () => {
  const r = await book();
  assert.equal((await confirm(r)).json.clientLink, 'created');
  const again = await confirm(r); // already confirmed: saving it again must be harmless
  assert.equal(again.status, 200);
  assert.equal(again.json.clientLink, undefined); // nothing to do
  assert.equal((await confirm(r, { adminNotes: 'sent the contract' })).status, 200);
  assert.equal((await setStatus(r, 'cancelled')).status, 200);
  assert.equal((await setStatus(r, 'pending')).status, 200);
  const third = await confirm(r);
  assert.equal(third.json.clientLink, 'already_linked');
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings.filter((b) => b.clientId).length, 1);
  assert.equal((await get(`/api/clients/${db.clients[0]._id}`)).json.data.summary.totalBookings, 1);
  assert.equal((await get('/api/clients/stats')).json.data.totalBookings, 1);
});
await test('[9] the same booking confirmed by two requests at the same moment links once', async () => {
  const r = await book();
  const results = await Promise.all([confirm(r), confirm(r), confirm(r)]);
  assert.ok(results.every((x) => x.status === 200));
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, db.clients[0]._id);
  assert.equal((await get('/api/clients/stats')).json.data.totalBookings, 1);
});
await test('[10] two DIFFERENT bookings for the same phone number confirmed at the same moment → only ONE client exists', async () => {
  const a = await book({ phone: '+91 98765 43210', name: 'Priya A', date: addDays(todayKey(), 90) });
  const b = await book({ phone: '098765 43210', name: 'Priya B', email: 'b@example.com', date: addDays(todayKey(), 91) });
  const c = await book({ phone: '9876543210', name: 'Priya C', email: 'c@example.com', date: addDays(todayKey(), 92) });
  const d = await book({ phone: '0091-98765-43210', name: 'Priya D', email: 'd@example.com', date: addDays(todayKey(), 93) });
  const results = await Promise.all([a, b, c, d].map((x) => confirm(x)));
  assert.ok(results.every((x) => x.status === 200), results.map((x) => x.status).join());
  assert.equal(db.clients.length, 1, 'one client per phone number');
  assert.ok(db.bookings.every((x) => x.clientId === db.clients[0]._id));
  assert.equal(results.filter((x) => x.json.clientLink === 'created').length, 1);
  assert.equal((await get(`/api/clients/${db.clients[0]._id}`)).json.data.summary.totalBookings, 4);
});
await test('[11] different phone numbers confirmed together → one client each', async () => {
  const people = ['+91 98111 22233', '+91 98222 33344', '+91 98333 44455'];
  const bookings = [];
  for (const [i, phone] of people.entries()) bookings.push(await book({ phone, name: `Person ${i}`, email: `p${i}@example.com`, date: addDays(todayKey(), 95 + i) }));
  await Promise.all(bookings.map((x) => confirm(x)));
  assert.equal(db.clients.length, 3);
  assert.equal(new Set(db.bookings.map((x) => x.clientId)).size, 3);
});
await test('[12] a cancelled booking creates no client, and a pending booking that is cancelled creates none either', async () => {
  const r = await book();
  assert.equal((await setStatus(r, 'cancelled')).status, 200);
  assert.equal(db.clients.length, 0);
  assert.equal(db.bookings[0].clientId, undefined);
  assert.equal((await setStatus(r, 'cancelled')).json.clientLink, undefined);
  // a status change that is not allowed (pending → completed) changes nothing and creates nothing
  const other = await book({ phone: '+91 98111 22233', date: addDays(todayKey(), 99) });
  assert.equal((await setStatus(other, 'completed')).status, 400);
  assert.equal(db.clients.length, 0);
});
await test('[13] a confirmed booking that is later cancelled or completed keeps its client and its link (history is preserved)', async () => {
  const { booking } = await bookAndConfirm();
  const clientId = db.clients[0]._id;
  assert.equal((await setStatus(booking, 'cancelled')).status, 200);
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, clientId);
  const detail = (await get(`/api/clients/${clientId}`)).json.data;
  assert.equal(detail.summary.totalBookings, 1);
  assert.equal(detail.summary.cancelledBookings, 1);
  assert.equal((await get(`/api/clients/${clientId}/bookings`)).json.data.length, 1);

  const second = await bookAndConfirm({ date: addDays(todayKey(), 120) });
  assert.equal((await setStatus(second.booking, 'completed')).status, 200);
  assert.equal(db.clients.length, 1);
  assert.ok(db.bookings.every((x) => x.clientId === clientId));
  assert.equal((await get(`/api/clients/${clientId}`)).json.data.summary.completedBookings, 1);
});
await test('[14] an EXISTING client (other email, a name the admin chose) is reused by a confirmed booking: nothing is overwritten', async () => {
  seedClient({ name: "Priya Ma'am", nameSource: 'manual', normalizedPhone: PRIYA, phone: '+91 98765 43210', email: 'priya.old@example.com', source: 'manual' });
  const { confirmed } = await bookAndConfirm({ email: 'priya.new@example.com', name: 'Priya Sharma' });
  assert.equal(confirmed.json.clientLink, 'linked');
  assert.equal(db.clients.length, 1);
  const c = db.clients[0];
  assert.equal(c.name, "Priya Ma'am");
  assert.equal(c.email, 'priya.old@example.com');
  assert.equal(db.bookings[0].clientId, c._id);
});
await test('[15] a booking confirmation fills in a missing email on an existing client, and takes over an unlinked conversation', async () => {
  seedClient({ name: 'Priya', nameSource: 'placeholder', normalizedPhone: PRIYA, phone: '+91 98765 43210', email: '', source: 'whatsapp' });
  seedConversation();
  await bookAndConfirm();
  const c = db.clients[0];
  assert.equal(db.clients.length, 1);
  assert.equal(c.email, 'priya@example.com');
  assert.equal(c.name, 'Priya Sharma'); // a real name replaces the placeholder
  assert.equal(db.conversations[0].clientId, c._id);
});
await test('[16] invalid or refused bookings create no client', async () => {
  assert.equal((await book({ email: 'nope' })).status, 400);
  assert.equal((await book({ name: '' })).status, 400);
  const day = addDays(todayKey(), 60);
  assert.equal((await book({ date: day, phone: '+91 91111 11111' })).status, 201);
  assert.equal((await book({ date: day, phone: '+91 92222 22222', name: 'Second Person' })).status, 409);
  faults.bookingSave = true;
  assert.equal((await book()).status, 409);
  assert.equal(db.clients.length, 0);
});
await test('[17] if creating the client fails, the booking STAYS confirmed, the admin is warned, nothing personal is logged, and saving the booking again repairs it', async () => {
  let attempts = 0;
  Client.create = async () => { attempts += 1; throw Object.assign(new Error('boom: priya@example.com 919876543210'), { name: 'MongoNetworkError' }); };
  const r = await book();
  const c = await confirm(r);
  assert.equal(c.status, 200);
  assert.equal(c.json.data.status, 'confirmed');
  assert.equal(db.bookings[0].status, 'confirmed');
  assert.equal(c.json.clientLink, 'error');
  assert.match(c.json.warnings.clientLink, /client profile could not be created/i);
  assert.equal(attempts, 3, 'one try and two retries');
  assert.equal(db.clients.length, 0);
  assert.equal(db.bookings[0].clientId, undefined);
  const text = logs.filter((l) => l.startsWith('[clients]')).join('\n');
  assert.ok(text.includes('could not be linked'));
  assert.ok(!text.includes('priya@example.com') && !text.includes('919876543210') && !text.includes('Priya'), 'no personal data in logs');

  Client.create = realClientCreate; // the database is back: saving the booking again makes the client
  const fixed = await patch(`/api/bookings/${r.json.data.reference}`, { adminNotes: 'retry' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.json.clientLink, 'created');
  assert.ok(!fixed.json.warnings);
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, db.clients[0]._id);
});
await test('[18] a failure that clears by itself (one dropped call) is retried and succeeds without any warning', async () => {
  let calls = 0;
  Client.create = async (data) => { calls += 1; if (calls === 1) throw Object.assign(new Error('socket closed'), { name: 'MongoNetworkError' }); return realClientCreate(data); };
  const { confirmed } = await bookAndConfirm();
  assert.equal(confirmed.json.clientLink, 'created');
  assert.ok(!confirmed.json.warnings);
  assert.equal(db.clients.length, 1);
});
await test('[19] a phone number too short to place: the booking is confirmed, the admin is told, no client is guessed; fixing the number and saving links it', async () => {
  const r = await book({ phone: '1234567' });
  const c = await confirm(r);
  assert.equal(c.status, 200);
  assert.equal(c.json.clientLink, 'unmatched');
  assert.match(c.json.warnings.clientLink, /country code/i);
  assert.equal(db.clients.length, 0);
  const fixed = await patch(`/api/bookings/${r.json.data.reference}`, { phone: '+91 98765 43210' });
  assert.equal(fixed.json.clientLink, 'created');
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, db.clients[0]._id);
});
await test('[20] the client created from a booking is complete and valid (no city, no notes needed) and shows in the list', async () => {
  await bookAndConfirm();
  const c = db.clients[0];
  assert.equal((await get(`/api/clients/${c._id}`)).json.data.city, '');
  const list = await get('/api/clients');
  assert.equal(list.json.total, 1);
  assert.equal(list.json.data[0].totalBookings, 1);
});
await test('[21] the profile lists ALL of a client\'s bookings, whatever their status', async () => {
  const first = await bookAndConfirm({ date: addDays(todayKey(), 70) });
  await bookAndConfirm({ date: addDays(todayKey(), 71), shootType: 'portrait' });
  await setStatus(first.booking, 'cancelled');
  const c = db.clients[0];
  const r = await get(`/api/clients/${c._id}/bookings`);
  assert.equal(r.json.data.length, 2);
  assert.deepEqual(r.json.data.map((x) => x.status).sort(), ['cancelled', 'confirmed']);
  assert.ok(r.json.data.every((x) => x.reference && x.date && x.time));
  assert.equal((await get(`/api/clients/${c._id}/bookings?filter=cancelled`)).json.data.length, 1);
  assert.equal((await get(`/api/clients/${c._id}`)).json.data.summary.totalBookings, 2);
});

// ======================================================================= 5  WhatsApp
section('5  WhatsApp never creates a client; it attaches to one that exists');
const wa = clientsService.linkWhatsAppSender;
await test('[22] a WhatsApp message from an unknown number creates NO client and the conversation stays unlinked', async () => {
  seedConversation();
  const r = await wa({ phone: PRIYA, name: 'Priya Patil' });
  assert.equal(r.outcome, 'no_client');
  assert.equal(db.clients.length, 0);
  assert.equal(db.conversations[0].clientId, undefined);
  assert.deepEqual((await get('/api/clients/stats')).json.data, { total: 0, newThisMonth: 0, repeat: 0, totalBookings: 0 });
});
await test('[23] a WhatsApp message from an existing client attaches the conversation and changes nothing else (not even the name)', async () => {
  const c = seedClient({ name: 'Priya Sharma', nameSource: 'booking', normalizedPhone: PRIYA, phone: '+91 98765 43210', email: 'priya@example.com', source: 'booking' });
  seedConversation();
  const r = await wa({ phone: PRIYA, name: 'priya 🌸' });
  assert.equal(r.outcome, 'linked');
  assert.equal(db.conversations[0].clientId, c._id);
  assert.equal(db.clients.length, 1);
  assert.equal(db.clients[0].name, 'Priya Sharma');
  assert.equal(db.clients[0].email, 'priya@example.com');
});
await test('[24] messaging before booking: still no client; when the booking is CONFIRMED there is one client with the conversation attached', async () => {
  seedConversation();
  await wa({ phone: PRIYA, name: 'Priya' });
  assert.equal(db.clients.length, 0);
  const r = await book();
  assert.equal(db.clients.length, 0); // pending
  await confirm(r);
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, db.clients[0]._id);
  assert.equal(db.conversations[0].clientId, db.clients[0]._id);
});
await test('[25] confirming first, then messaging: one client and the conversation gets linked', async () => {
  await bookAndConfirm();
  seedConversation();
  const r = await wa({ phone: PRIYA, name: 'Priya' });
  assert.equal(r.outcome, 'linked');
  assert.equal(db.clients.length, 1);
  assert.equal(db.conversations[0].clientId, db.clients[0]._id);
});
await test('[26] repeated and simultaneous messages never create or duplicate anything', async () => {
  seedConversation();
  await Promise.all([1, 2, 3, 4, 5].map(() => wa({ phone: PRIYA, name: 'Priya' })));
  assert.equal(db.clients.length, 0);
  await bookAndConfirm();
  await Promise.all([1, 2, 3, 4, 5].map(() => wa({ phone: PRIYA, name: 'Priya' })));
  assert.equal(db.clients.length, 1);
});
await test('[27] a conversation that already belongs to another client is never taken over', async () => {
  const other = seedClient({ name: 'Other', normalizedPhone: '919811122233' });
  seedClient({ name: 'Priya', normalizedPhone: PRIYA });
  seedConversation({ clientId: other._id });
  await wa({ phone: PRIYA, name: 'Priya' });
  assert.equal(db.conversations[0].clientId, other._id);
});
await test('[28] an unusable sender number links nothing and creates nothing', async () => {
  for (const phone of ['', undefined, null, '12', 'abc']) assert.equal((await wa({ phone, name: 'X' })).outcome, 'unmatched');
  assert.equal(db.clients.length, 0);
});
await test('[29] the safe wrappers never throw, retry a failing booking link, log no personal data, and skip when the database is not ready', async () => {
  let tries = 0;
  const boom = {
    linkWhatsAppSender: async () => { throw Object.assign(new Error('failed for 919876543210 Priya'), { name: 'MongoServerError' }); },
    linkBookingToClient: async () => { tries += 1; throw Object.assign(new Error('failed for priya@example.com'), { name: 'MongoNetworkError' }); },
  };
  const safe = clientsService.createSafeLinks(boom, { sleep: async () => {} });
  assert.deepEqual(await safe.linkWhatsApp({ from: PRIYA, name: 'Priya' }), { outcome: 'error' });
  assert.deepEqual(await safe.linkBooking({ phone: PRIYA, status: 'confirmed' }), { outcome: 'error' });
  assert.equal(tries, 3);
  assert.ok(!logs.join('\n').includes('919876543210') && !logs.join('\n').includes('Priya') && !logs.join('\n').includes('priya@example.com'));
  const idle = clientsService.createSafeLinks(boom, { isReady: async () => false });
  assert.deepEqual(await idle.linkWhatsApp({ from: PRIYA }), { outcome: 'skipped' });
  assert.deepEqual(await idle.linkBooking({ phone: PRIYA }), { outcome: 'skipped' });
  // the real exported wrappers are skipped while the database connection is down
  connected = false;
  try {
    assert.deepEqual(await clientsService.safeLinkWhatsApp({ from: PRIYA, name: 'Priya' }), { outcome: 'skipped' });
    assert.deepEqual(await clientsService.safeLinkBooking({ phone: PRIYA, status: 'confirmed' }), { outcome: 'skipped' });
  } finally { connected = true; }
  assert.equal(db.clients.length, 0);
});
await test('[30] linkBookingToClient itself refuses pending / cancelled bookings and leaves an already linked booking alone', async () => {
  for (const status of ['pending', 'cancelled']) assert.equal((await clientsService.linkBookingToClient({ _id: 'x', status, phone: '+91 98765 43210', name: 'Priya Sharma' })).outcome, 'not_confirmed');
  assert.equal((await clientsService.linkBookingToClient({ _id: 'x', status: 'confirmed', clientId: 'abc', phone: '+91 98765 43210', name: 'Priya Sharma' })).outcome, 'already_linked');
  assert.equal(db.clients.length, 0);
});

// ======================================================================= 3  editing
section('3  editing a client');
await test('[8] editing changes only what was sent; a hand-edited name becomes "manual"', async () => {
  const c = seedClient({ name: '+91 98765 43210', nameSource: 'placeholder', normalizedPhone: PRIYA, phone: '+91 98765 43210' });
  const r = await patch(`/api/clients/${c._id}`, { name: 'Priya Sharma', email: 'P@Example.com', city: 'Pune' });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.name, 'Priya Sharma');
  assert.equal(c.email, 'p@example.com');
  assert.equal(c.city, 'Pune');
  assert.equal(c.nameSource, 'manual');
  assert.equal(c.normalizedPhone, PRIYA);
  assert.equal((await patch(`/api/clients/${c._id}`, { email: '' })).status, 200);
  assert.equal(c.email, '');
});
await test('[9] saving without touching the name does not lock a placeholder name in', async () => {
  const c = seedClient({ name: '+91 98765 43210', nameSource: 'placeholder', normalizedPhone: PRIYA });
  await patch(`/api/clients/${c._id}`, { name: '+91 98765 43210', city: 'Pune' });
  assert.equal(c.nameSource, 'placeholder');
});
await test('[10] changing the phone re-normalizes it; a number another client has is refused (409) and names that client', async () => {
  const a = seedClient({ name: 'A', normalizedPhone: PRIYA, phone: '+91 98765 43210' });
  const b = seedClient({ name: 'Bhavesh', normalizedPhone: '919811122233', phone: '+91 98111 22233' });
  assert.equal((await patch(`/api/clients/${a._id}`, { phone: '089999 88877' })).status, 200);
  assert.equal(a.normalizedPhone, '918999988877');
  assert.equal(a.phone, '+91 89999 88877');
  const dup = await patch(`/api/clients/${a._id}`, { phone: '+91 98111 22233' });
  assert.equal(dup.status, 409);
  assert.ok(dup.json.errors.phone);
  assert.equal(dup.json.existing.name, 'Bhavesh');
  assert.equal(dup.json.existing.id, b._id);
  assert.equal(a.normalizedPhone, '918999988877'); // unchanged
  assert.equal((await patch(`/api/clients/${a._id}`, { phone: '+91 89999 88877' })).status, 200); // its own number again is fine
});
await test('[11] bad edits: invalid email / phone / name, empty body, unknown fields only', async () => {
  const c = seedClient();
  assert.equal((await patch(`/api/clients/${c._id}`, { email: 'nope' })).status, 400);
  assert.equal((await patch(`/api/clients/${c._id}`, { phone: '12' })).status, 400);
  assert.equal((await patch(`/api/clients/${c._id}`, { name: '' })).status, 400);
  assert.equal((await patch(`/api/clients/${c._id}`, {})).status, 400);
  assert.equal((await patch(`/api/clients/${c._id}`, { source: 'booking', normalizedPhone: '1', nameSource: 'x' })).status, 400); // internal fields cannot be set
  assert.equal(c.source, 'manual');
});

await test('[31] the service itself: five confirmations racing for one new number still end with ONE client (the unique index + duplicate recovery, no retry to hide behind)', async () => {
  const rows = [0, 1, 2, 3, 4].map((i) => seedBooking(undefined, { status: 'confirmed', phone: ['+91 98765 43210', '098765 43210', '9876543210', '919876543210', '+91-98765-43210'][i], name: `Priya ${i}` }));
  const results = await Promise.all(rows.map((r) => clientsService.linkBookingToClient({ _id: r._id, status: 'confirmed', phone: r.phone, name: r.name, email: '' })));
  assert.equal(db.clients.length, 1);
  assert.equal(results.filter((x) => x.outcome === 'created').length, 1);
  assert.equal(results.filter((x) => x.outcome === 'linked').length, 4);
  assert.ok(db.bookings.every((b) => b.clientId === db.clients[0]._id));
});
await test('[32] a booking that already belongs to a client is never moved to another (the attach is guarded in the database)', async () => {
  const mine = seedClient({ name: 'Original', normalizedPhone: '919811122233', phone: '+91 98111 22233' });
  const row = seedBooking(mine._id, { status: 'confirmed', phone: '+91 98765 43210' });
  // a stale copy of the booking (loaded before it was linked) reaches the service with no clientId
  const r = await clientsService.linkBookingToClient({ _id: row._id, status: 'confirmed', phone: '+91 98765 43210', name: 'Priya Sharma', email: '' });
  assert.equal(r.outcome, 'already_linked');
  assert.equal(db.clients.length, 1, 'no extra client is created for a booking that already has one');
  assert.equal(db.bookings.find((b) => b._id === row._id).clientId, mine._id);
});

// ======================================================================= 6  the WhatsApp summary on a profile
section('6  WhatsApp conversation lookup');
await test('[32] the profile shows the linked conversation: last message, time, direction, unread (a summary, no credentials)', async () => {
  const c = seedClient({ normalizedPhone: PRIYA });
  seedConversation({ clientId: c._id, lastMessagePreview: 'Are you free on Dec 12?', lastMessageDirection: 'in', unreadCount: 3 });
  const r = await get(`/api/clients/${c._id}/whatsapp`);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.available, true);
  assert.deepEqual(Object.keys(r.json.data.conversation).sort(), ['id', 'lastMessageAt', 'lastMessageDirection', 'lastMessagePreview', 'status', 'unreadCount']);
  assert.equal(r.json.data.conversation.lastMessagePreview, 'Are you free on Dec 12?');
  assert.equal(r.json.data.conversation.unreadCount, 3);
  assert.equal(r.json.data.conversation.id, db.conversations[0]._id);
  assert.ok(!/token|secret|clientId/i.test(r.text));
});
await test('[33] an older conversation with the same number but no link is found and linked now', async () => {
  const c = seedClient({ normalizedPhone: PRIYA });
  seedConversation();
  const r = await get(`/api/clients/${c._id}/whatsapp`);
  assert.equal(r.json.data.available, true);
  assert.equal(db.conversations[0].clientId, c._id);
});
await test('[34] a client with no conversation (neither bookings nor WhatsApp) gets a clear "none", and conversations of others are not shown', async () => {
  const c = seedClient({ normalizedPhone: PRIYA });
  const other = seedClient({ normalizedPhone: '919811122233' });
  seedConversation({ phone: '919811122233', clientId: other._id });
  const r = await get(`/api/clients/${c._id}/whatsapp`);
  assert.deepEqual(r.json.data, { available: false, conversation: null });
  const detail = await get(`/api/clients/${c._id}`);
  assert.equal(detail.json.data.summary.totalBookings, 0);
  assert.equal(detail.json.data.summary.type, 'new');
  assert.equal(detail.json.data.summary.lastBookingAt, null);
});
await test('[35] a client with WhatsApp but no bookings works', async () => {
  const c = seedClient({ normalizedPhone: PRIYA });
  seedConversation({ clientId: c._id });
  assert.equal((await get(`/api/clients/${c._id}/bookings`)).json.count, 0);
  assert.equal((await get(`/api/clients/${c._id}/whatsapp`)).json.data.available, true);
});

// ======================================================================= 7  booking history
section('7  booking history');
await test('[36] history lists the client\'s own bookings with the right fields, and filters + counts are correct', async () => {
  const c = seedClient();
  const other = seedClient({ normalizedPhone: '919811122233' });
  const today = todayKey();
  seedBooking(c._id, { bookingId: 'AM-000001', date: addDays(today, 5), status: 'confirmed', shootType: 'wedding', package: { name: 'Gold' } });
  seedBooking(c._id, { bookingId: 'AM-000002', date: addDays(today, 9), status: 'pending' });
  seedBooking(c._id, { bookingId: 'AM-000003', date: addDays(today, -20), status: 'completed' });
  seedBooking(c._id, { bookingId: 'AM-000004', date: addDays(today, 15), status: 'cancelled' }); // future but cancelled: not "upcoming"
  seedBooking(c._id, { bookingId: 'AM-000005', date: addDays(today, 0), status: 'confirmed' }); // today counts as upcoming
  seedBooking(c._id, { bookingId: 'AM-000006', date: addDays(today, -3), status: 'pending' }); // past and never completed: only in "all"
  seedBooking(other._id, { bookingId: 'AM-000099', date: addDays(today, 1) });

  const all = await get(`/api/clients/${c._id}/bookings`);
  assert.equal(all.status, 200);
  assert.deepEqual(all.json.counts, { all: 6, upcoming: 3, completed: 1, cancelled: 1 });
  assert.equal(all.json.data.length, 6);
  assert.ok(!all.json.data.some((b) => b.reference === 'AM-000099'));
  assert.deepEqual(Object.keys(all.json.data[0]).sort(), ['createdAt', 'date', 'id', 'packageName', 'reference', 'shootType', 'shootTypeName', 'status', 'time']);
  assert.deepEqual(all.json.data.map((b) => b.date), [...all.json.data.map((b) => b.date)].sort().reverse()); // newest shoot first
  assert.equal(all.json.data.find((b) => b.reference === 'AM-000001').packageName, 'Gold');

  const up = await get(`/api/clients/${c._id}/bookings?filter=upcoming`);
  assert.deepEqual(up.json.data.map((b) => b.reference), ['AM-000005', 'AM-000001', 'AM-000002']); // soonest first
  assert.deepEqual((await get(`/api/clients/${c._id}/bookings?filter=completed`)).json.data.map((b) => b.reference), ['AM-000003']);
  assert.deepEqual((await get(`/api/clients/${c._id}/bookings?filter=cancelled`)).json.data.map((b) => b.reference), ['AM-000004']);
  assert.equal((await get(`/api/clients/${c._id}/bookings?filter=bogus`)).status, 400);
});
await test('[37] a client with no bookings has an empty history, not an error', async () => {
  const c = seedClient();
  const r = await get(`/api/clients/${c._id}/bookings`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.counts, { all: 0, upcoming: 0, completed: 0, cancelled: 0 });
  assert.deepEqual(r.json.data, []);
});

// ======================================================================= 8  statistics
section('8  statistics');
await test('[38] the four cards come from the data: total, new this month, repeat, total bookings', async () => {
  assert.deepEqual((await get('/api/clients/stats')).json.data, { total: 0, newThisMonth: 0, repeat: 0, totalBookings: 0 });

  const oldRepeat = seedClient({ name: 'Two bookings', normalizedPhone: '919000000001', createdAt: daysAgo(90) });
  const oneCompleted = seedClient({ name: 'One completed', normalizedPhone: '919000000002', createdAt: daysAgo(60) });
  const onePending = seedClient({ name: 'One pending', normalizedPhone: '919000000003', createdAt: daysAgo(1) });
  const cancelledOnly = seedClient({ name: 'Cancelled only', normalizedPhone: '919000000004', createdAt: daysAgo(2) });
  seedClient({ name: 'Nothing', normalizedPhone: '919000000005', createdAt: daysAgo(70) });
  seedClient({ name: 'Last year', normalizedPhone: '919000000006', createdAt: new Date('2025-01-01') });
  seedBooking(oldRepeat._id, { status: 'pending' });
  seedBooking(oldRepeat._id, { status: 'confirmed' });
  seedBooking(oneCompleted._id, { status: 'completed' });
  seedBooking(onePending._id, { status: 'pending' });
  seedBooking(cancelledOnly._id, { status: 'cancelled' });
  seedBooking(cancelledOnly._id, { status: 'cancelled' });
  seedBooking(null, { status: 'pending' }); // a booking nobody is linked to: not counted

  const r = (await get('/api/clients/stats')).json.data;
  const expectedNew = db.clients.filter((c) => c.createdAt >= new Date(new Date(`${todayKey().slice(0, 7)}-01T00:00:00+05:30`))).length;
  assert.equal(r.total, 6);
  assert.equal(r.newThisMonth, expectedNew);
  assert.equal(r.repeat, 2); // two active bookings, or a completed one. Two cancelled bookings do not make a repeat client.
  assert.equal(r.totalBookings, 6);
});

// ======================================================================= 9  list, search, filters, sort, pagination
section('9  list, search, filters, sort and pagination');
function populate() {
  const mk = (name, phone, o = {}) => seedClient({ name, normalizedPhone: phone, phone: `+${phone}`, ...o });
  const A = mk('Aarav Mehta', '919000000011', { email: 'aarav@gmail.com', createdAt: daysAgo(50) }); // 1 pending, upcoming
  const B = mk('Bhavna Rao', '919000000012', { email: 'bhavna@example.com', createdAt: daysAgo(40) }); // 2 bookings: repeat, last booking newest
  const C = mk('Chirag Shah', '919000000013', { email: '', createdAt: daysAgo(30) }); // completed: repeat
  const D = mk('Divya Nair', '919000000014', { email: 'divya@example.com', createdAt: daysAgo(20) }); // none
  const E = mk('Esha Gupta', '919000000015', { email: 'esha@gmail.com', createdAt: daysAgo(10) }); // none
  const today = todayKey();
  seedBooking(A._id, { status: 'pending', date: addDays(today, 7), createdAt: daysAgo(3) });
  seedBooking(B._id, { status: 'confirmed', date: addDays(today, 20), createdAt: daysAgo(1) });
  seedBooking(B._id, { status: 'completed', date: addDays(today, -40), createdAt: daysAgo(35) });
  seedBooking(C._id, { status: 'completed', date: addDays(today, -10), createdAt: daysAgo(12) });
  return { A, B, C, D, E };
}
const names = (r) => r.json.data.map((c) => c.name);

await test('[39] default list: newest first, with booking numbers, type and page info', async () => {
  populate();
  const r = await get('/api/clients');
  assert.equal(r.status, 200);
  assert.deepEqual(names(r), ['Esha Gupta', 'Divya Nair', 'Chirag Shah', 'Bhavna Rao', 'Aarav Mehta']);
  assert.equal(r.json.total, 5);
  assert.equal(r.json.page, 1);
  assert.equal(r.json.pages, 1);
  const byName = Object.fromEntries(r.json.data.map((c) => [c.name, c]));
  assert.equal(byName['Bhavna Rao'].totalBookings, 2);
  assert.equal(byName['Bhavna Rao'].upcomingBookings, 1);
  assert.equal(byName['Bhavna Rao'].type, 'repeat');
  assert.equal(byName['Chirag Shah'].type, 'repeat');
  assert.equal(byName['Aarav Mehta'].type, 'new');
  assert.equal(byName['Divya Nair'].totalBookings, 0);
  assert.equal(byName['Divya Nair'].lastBookingAt, null);
  assert.ok(byName['Aarav Mehta'].lastBookingAt);
  assert.ok(!('bk' in byName['Aarav Mehta']) && !('normalizedPhone' in byName['Aarav Mehta']) && !('_id' in byName['Aarav Mehta']) && !('nameSource' in byName['Aarav Mehta']));
});
await test('[40] filters: all, new, repeat, upcoming, none', async () => {
  populate();
  assert.deepEqual(names(await get('/api/clients?filter=all')).length, 5);
  assert.deepEqual(names(await get('/api/clients?filter=repeat')).sort(), ['Bhavna Rao', 'Chirag Shah']);
  assert.deepEqual(names(await get('/api/clients?filter=new')).sort(), ['Aarav Mehta', 'Divya Nair', 'Esha Gupta']);
  assert.deepEqual(names(await get('/api/clients?filter=upcoming')).sort(), ['Aarav Mehta', 'Bhavna Rao']);
  assert.deepEqual(names(await get('/api/clients?filter=none')).sort(), ['Divya Nair', 'Esha Gupta']);
  const r = await get('/api/clients?filter=repeat');
  assert.equal(r.json.total, 2);
});
await test('[41] sorting: recent, oldest, most recent booking, most bookings', async () => {
  populate();
  assert.deepEqual(names(await get('/api/clients?sort=oldest')), ['Aarav Mehta', 'Bhavna Rao', 'Chirag Shah', 'Divya Nair', 'Esha Gupta']);
  assert.deepEqual(names(await get('/api/clients?sort=recent')), ['Esha Gupta', 'Divya Nair', 'Chirag Shah', 'Bhavna Rao', 'Aarav Mehta']);
  const lb = names(await get('/api/clients?sort=lastBooking'));
  assert.deepEqual(lb.slice(0, 3), ['Bhavna Rao', 'Aarav Mehta', 'Chirag Shah']); // booking made 1, 3, 12 days ago
  assert.deepEqual(lb.slice(3).sort(), ['Divya Nair', 'Esha Gupta']); // no bookings: last
  const mb = names(await get('/api/clients?sort=mostBookings'));
  assert.equal(mb[0], 'Bhavna Rao');
  assert.deepEqual(mb.slice(1, 3), ['Chirag Shah', 'Aarav Mehta']); // 1 booking each, newest client first
});
await test('[42] filter + sort + search work together', async () => {
  populate();
  assert.deepEqual(names(await get('/api/clients?filter=repeat&sort=oldest')), ['Bhavna Rao', 'Chirag Shah']);
  assert.deepEqual(names(await get('/api/clients?filter=none&search=gmail')), ['Esha Gupta']);
  assert.deepEqual(names(await get('/api/clients?filter=repeat&search=zzz')), []);
});
await test('[43] search: partial name, email, phone in any format; case-insensitive; no results is an empty list', async () => {
  populate();
  assert.deepEqual(names(await get('/api/clients?search=bhav')), ['Bhavna Rao']);
  assert.deepEqual(names(await get('/api/clients?search=RAO')), ['Bhavna Rao']);
  assert.deepEqual(names(await get('/api/clients?search=gmail')).sort(), ['Aarav Mehta', 'Esha Gupta']);
  assert.deepEqual(names(await get('/api/clients?search=divya@')), ['Divya Nair']);
  assert.deepEqual(names(await get('/api/clients?search=9000000013')), ['Chirag Shah']);
  assert.deepEqual(names(await get(`/api/clients?search=${encodeURIComponent('+91 90000 00014')}`)), ['Divya Nair']);
  assert.deepEqual(names(await get(`/api/clients?search=${encodeURIComponent('09000000015')}`)), ['Esha Gupta']);
  const none = await get('/api/clients?search=nobody-here');
  assert.equal(none.status, 200);
  assert.deepEqual(none.json.data, []);
  assert.equal(none.json.total, 0);
  assert.equal(none.json.pages, 1);
  assert.equal((await get(`/api/clients?search=${encodeURIComponent('.*')}`)).json.total, 0); // regex characters are literal
  assert.equal((await get(`/api/clients?search=${encodeURIComponent('(')}`)).status, 200);
});
await test('[44] pagination: pages, totals, no overlap, last page, page beyond the end', async () => {
  populate();
  const p1 = await get('/api/clients?limit=2&page=1');
  const p2 = await get('/api/clients?limit=2&page=2');
  const p3 = await get('/api/clients?limit=2&page=3');
  assert.deepEqual([p1.json.count, p2.json.count, p3.json.count], [2, 2, 1]);
  assert.equal(p1.json.total, 5);
  assert.equal(p1.json.pages, 3);
  assert.deepEqual([...names(p1), ...names(p2), ...names(p3)], ['Esha Gupta', 'Divya Nair', 'Chirag Shah', 'Bhavna Rao', 'Aarav Mehta']);
  const beyond = await get('/api/clients?limit=2&page=9');
  assert.deepEqual(beyond.json.data, []);
  assert.equal(beyond.json.total, 5);
  const stats = await get('/api/clients?limit=2&page=2&sort=mostBookings'); // paging also works on the booking-based path
  assert.equal(stats.json.count, 2);
  assert.equal(stats.json.total, 5);
});
await test('[45] bad list parameters are refused (400)', async () => {
  populate();
  for (const q of ['page=0', 'page=-1', 'page=1.5', 'page=abc', 'limit=0', 'limit=101', 'limit=abc', 'filter=bogus', 'sort=bogus', `search=${'x'.repeat(51)}`]) {
    assert.equal((await get(`/api/clients?${q}`)).status, 400, q);
  }
  // operator-style query strings can never become a database operator: refused, or ignored as an unknown key (never a 500, never a filtered list)
  for (const q of ['search[$ne]=1', 'filter[]=all', 'search[$regex]=.*&search[$options]=i']) {
    const r = await get(`/api/clients?${q}`);
    assert.ok(r.status === 400 || (r.status === 200 && r.json.total === 5), q);
  }
});
await test('[46] pagination never loads every client: a page of 2 asks the database for 2', async () => {
  populate();
  let aggregated = 0;
  const real = Client.aggregate;
  Client.aggregate = async (p) => { aggregated += 1; const facet = p.at(-1).$facet; assert.ok(facet.rows.some((s) => s.$limit === 2)); return real(p); };
  const r = await get('/api/clients?limit=2');
  Client.aggregate = real;
  assert.equal(aggregated, 1);
  assert.equal(r.json.count, 2);
});

// ======================================================================= 10  invalid references
section('10  invalid and deleted references');
await test('[47] a mistyped, malformed or deleted client id is a clean 404 everywhere', async () => {
  const gone = '0123456789abcdef01234567';
  for (const id of ['not-an-id', '123', gone, '%24ne', '..%2F..']) {
    for (const [method, suffix] of [['GET', ''], ['PATCH', ''], ['GET', '/bookings'], ['GET', '/whatsapp'], ['GET', '/notes'], ['POST', '/notes'], ['PATCH', `/notes/${gone}`], ['DELETE', `/notes/${gone}`]]) {
      const r = await call(method, `/api/clients/${id}${suffix}`, { body: method === 'GET' ? undefined : { name: 'x', body: 'x' } });
      assert.equal(r.status, 404, `${method} ${id}${suffix}`);
      assert.equal(r.json.success, false);
    }
  }
});
await test('[48] bookings or conversations pointing at a client that no longer exists do not break the list or the stats', async () => {
  const c = seedClient({ name: 'Real' });
  seedBooking('0123456789abcdef01234567', { status: 'completed' });
  seedConversation({ clientId: '0123456789abcdef01234567' });
  assert.equal((await get('/api/clients')).status, 200);
  assert.equal((await get('/api/clients')).json.total, 1);
  assert.equal((await get(`/api/clients/${c._id}`)).status, 200);
  assert.equal((await get('/api/clients/stats')).status, 200);
});

// ======================================================================= 11  private notes
section('11  private notes');
await test('[49] add, list (newest first), edit and delete a note, with author and dates', async () => {
  const c = seedClient();
  const a = await post(`/api/clients/${c._id}/notes`, { body: '  Prefers candid wedding photography  ' });
  assert.equal(a.status, 201);
  assert.equal(a.json.data.body, 'Prefers candid wedding photography');
  assert.equal(a.json.data.authorName, 'Pratik Shelke');
  assert.ok(a.json.data.createdAt);
  assert.equal(a.json.data.editedAt, undefined);
  assert.ok(!('authorId' in a.json.data));
  await post(`/api/clients/${c._id}/notes`, { body: 'Venue is in Pune' });
  db.notes[0].createdAt = daysAgo(2); // make the order certain

  const list = await get(`/api/clients/${c._id}/notes`);
  assert.equal(list.json.count, 2);
  assert.deepEqual(list.json.data.map((n) => n.body), ['Venue is in Pune', 'Prefers candid wedding photography']);

  const id = a.json.data.id;
  const edited = await patch(`/api/clients/${c._id}/notes/${id}`, { body: 'Prefers candid + traditional' });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.data.body, 'Prefers candid + traditional');
  assert.ok(edited.json.data.editedAt);
  assert.equal(edited.json.data.createdAt, new Date(db.notes.find((n) => n._id === id).createdAt).toISOString()); // the original date stays

  const del = await call('DELETE', `/api/clients/${c._id}/notes/${id}`);
  assert.equal(del.status, 200);
  assert.equal((await get(`/api/clients/${c._id}/notes`)).json.count, 1);
  assert.equal((await call('DELETE', `/api/clients/${c._id}/notes/${id}`)).status, 404); // already gone
});
await test('[50] note validation: empty, blank, too long, wrong type', async () => {
  const c = seedClient();
  for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'x'.repeat(2001) }, { body: { $ne: 1 } }, { body: ['a'] }]) {
    const r = await post(`/api/clients/${c._id}/notes`, body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40));
    assert.ok(r.json.errors.body);
  }
  assert.equal((await post(`/api/clients/${c._id}/notes`, { body: 'x'.repeat(2000) })).status, 201);
  assert.equal(db.notes.length, 1);
});
await test('[51] a note can only be reached through its own client', async () => {
  const a = seedClient({ normalizedPhone: '919000000021' });
  const b = seedClient({ normalizedPhone: '919000000022' });
  const n = await post(`/api/clients/${a._id}/notes`, { body: 'private to A' });
  assert.equal((await patch(`/api/clients/${b._id}/notes/${n.json.data.id}`, { body: 'hijack' })).status, 404);
  assert.equal((await call('DELETE', `/api/clients/${b._id}/notes/${n.json.data.id}`)).status, 404);
  assert.equal(db.notes[0].body, 'private to A');
  assert.equal((await get(`/api/clients/${b._id}/notes`)).json.count, 0);
});
await test('[52] notes never leak: not in the client, list, bookings, WhatsApp, stats or the public booking response', async () => {
  const SECRET = 'SECRET-NOTE-TEXT-9917';
  const b = await book();
  await confirm(b);
  const c = db.clients[0];
  await post(`/api/clients/${c._id}/notes`, { body: SECRET });
  seedConversation({ clientId: c._id });
  const responses = [
    await get(`/api/clients/${c._id}`), await get('/api/clients'), await get('/api/clients?search=Priya'), await get(`/api/clients/${c._id}/bookings`),
    await get(`/api/clients/${c._id}/whatsapp`), await get('/api/clients/stats'), await book({ name: 'Another Customer', phone: '+91 91234 56780' }),
  ];
  for (const r of responses) assert.ok(!r.text.includes(SECRET));
  assert.ok(!b.text.includes(SECRET));
  assert.equal((await get(`/api/clients/${c._id}/notes`)).json.data[0].body, SECRET); // only the notes route returns it
});

// ======================================================================= 12  the shape of a profile
section('12  profile');
await test('[53] the profile returns the client with its booking summary', async () => {
  const c = seedClient({ name: 'Priya', email: 'p@example.com', city: 'Pune' });
  seedBooking(c._id, { status: 'completed', date: addDays(todayKey(), -5) });
  seedBooking(c._id, { status: 'confirmed', date: addDays(todayKey(), 5) });
  seedBooking(c._id, { status: 'cancelled' });
  const r = await get(`/api/clients/${c._id}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.data.name, 'Priya');
  assert.equal(r.json.data.city, 'Pune');
  assert.deepEqual(Object.keys(r.json.data.summary).sort(), ['cancelledBookings', 'completedBookings', 'lastBookingAt', 'totalBookings', 'type', 'upcomingBookings']);
  assert.equal(r.json.data.summary.totalBookings, 3);
  assert.equal(r.json.data.summary.upcomingBookings, 1);
  assert.equal(r.json.data.summary.completedBookings, 1);
  assert.equal(r.json.data.summary.cancelledBookings, 1);
  assert.equal(r.json.data.summary.type, 'repeat');
  assert.ok(r.json.data.summary.lastBookingAt);
});
await test('[54] unknown routes still 404 as JSON and the stats route is not mistaken for an id', async () => {
  assert.equal((await get('/api/clients/stats')).status, 200);
  assert.equal((await get('/api/nothing')).status, 404);
});

await test('[55] a huge page number is a 400, not a database error', async () => {
  assert.equal((await get('/api/clients?page=1e300')).status, 400);
  assert.equal((await get('/api/clients?page=100001')).status, 400);
  assert.equal((await get('/api/clients?page=2')).status, 200);
});
await test('[56] changing the phone of a client still named after the old number renames them after the new one; a real name stays', async () => {
  const a = seedClient({ name: '+91 98765 43210', nameSource: 'placeholder', normalizedPhone: '919876543210', phone: '+91 98765 43210' });
  const r = await patch(`/api/clients/${a._id}`, { name: '+91 98765 43210', phone: '+91 91234 56789' });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.name, '+91 91234 56789');
  const b = seedClient({ name: 'Real Name', nameSource: 'manual', normalizedPhone: '919000000001', phone: '+91 90000 00001' });
  const r2 = await patch(`/api/clients/${b._id}`, { phone: '+91 90000 00002' });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.data.name, 'Real Name');
});


// ======================================================================= 9  review follow-ups
section('9  confirmedAt, clientLinked flag, phone mismatch, empty phone');
await test('[57] confirming records confirmedAt once; it is never cleared and never moved by later saves', async () => {
  const r = await book();
  assert.equal(db.bookings[0].confirmedAt, undefined);
  await confirm(r);
  const first = db.bookings[0].confirmedAt;
  assert.ok(first instanceof Date);
  await setStatus(r, 'cancelled');
  assert.equal(String(db.bookings[0].confirmedAt), String(first));
  await patch(`/api/bookings/${r.json.data.reference}`, { adminNotes: 'x' });
  assert.equal(String(db.bookings[0].confirmedAt), String(first));
});
await test('[58] confirmed, the client could not be created, then cancelled: saving the cancelled booking still links it (it WAS confirmed)', async () => {
  Client.create = async () => { throw Object.assign(new Error('down'), { name: 'MongoNetworkError' }); };
  const r = await book();
  assert.equal((await confirm(r)).json.clientLink, 'error');
  Client.create = realClientCreate;
  const c = await setStatus(r, 'cancelled');
  assert.equal(c.status, 200);
  assert.equal(c.json.clientLink, 'created');
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, db.clients[0]._id);
});
await test('[59] a booking that was never confirmed and is cancelled still gets no client', async () => {
  const r = await book();
  await setStatus(r, 'cancelled');
  assert.equal(db.clients.length, 0);
  assert.equal(db.bookings[0].confirmedAt, undefined);
});
await test('[60] the admin response says whether the booking has a client (clientLinked) but never the client id', async () => {
  const r = await book();
  const c1 = await confirm(r);
  assert.equal(c1.json.data.clientLinked, true);
  assert.ok(!('clientId' in c1.json.data));
  assert.ok(!c1.text.includes(db.clients[0]._id));
  assert.equal(r.json.data.clientLinked, false); // pending booking just created: no client
  Client.create = async () => { throw Object.assign(new Error('down'), { name: 'MongoNetworkError' }); };
  const r2 = await book({ phone: '+91 98111 22233', date: addDays(todayKey(), 99) });
  assert.equal((await confirm(r2)).json.data.clientLinked, false);
});
await test('[61] changing the phone of a linked booking to another person warns "mismatch" and does NOT move the booking or create a client', async () => {
  const { booking } = await bookAndConfirm();
  const before = db.bookings[0].clientId;
  const r = await patch(`/api/bookings/${booking.json.data.reference}`, { phone: '+91 91111 22222' });
  assert.equal(r.status, 200);
  assert.equal(r.json.clientLink, 'mismatch');
  assert.match(r.json.warnings.clientLink, /no longer matches/i);
  assert.equal(db.clients.length, 1);
  assert.equal(db.bookings[0].clientId, before);
  // same person, different formatting: no warning
  const ok = await patch(`/api/bookings/${booking.json.data.reference}`, { phone: '98765 43210' });
  assert.equal(ok.status, 200);
  // (the number now differs from the one saved before, but still belongs to the linked client)
  assert.equal(ok.json.clientLink, undefined);
});
await test('[62] a confirmed booking with an EMPTY phone gets its own wording (not "country code")', async () => {
  const r = await book();
  db.bookings[0].phone = '';
  const c = await confirm(r);
  assert.equal(c.json.clientLink, 'unmatched');
  assert.match(c.json.warnings.clientLink, /no phone number/i);
  assert.ok(!/country code/i.test(c.json.warnings.clientLink));
});
await test('[63] linking with a stale copy of an already-linked booking creates nothing', async () => {
  const { booking } = await bookAndConfirm();
  const stale = { ...db.bookings[0], clientId: undefined };
  const out = await (await import('../utils/clients.js')).linkBookingToClient(stale);
  assert.equal(out.outcome, 'already_linked');
  assert.equal(db.clients.length, 1);
  assert.ok(booking);
});

// ---------------------------------------------------------------------- done
server.close();
console.log = realLog;
console.error = realError;
console.log(failed ? `\n${failed} of ${count} tests FAILED` : `\nAll ${count} tests passed  (in-memory stand-in for MongoDB, see the header of this file)`);
process.exit(failed ? 1 : 0);
