/**
 * npm run test:settings
 *
 * Runs the REAL Express routes, middleware (login check, admin check, error handler, rate limits), controllers, validation and
 * Mongoose schemas of the Settings system (settings, services, booking rules, account security) over real HTTP, against an
 * IN-MEMORY STAND-IN for MongoDB.
 *
 * WHAT THAT MEANS (read before trusting a green result):
 *   - NOT tested here: a real MongoDB server. Model methods (find, create, updateOne, ...) are replaced; filters are run by the
 *     `mingo` library (an independent implementation of MongoDB's query language). Unique indexes are simulated by hand.
 *   - NOT tested here: Meta / WhatsApp and Cloudinary. Their web addresses are intercepted: the test records what WOULD have been
 *     sent, and answers like the real services do. No real message is sent and no real image is touched.
 *   - Tested for real: validation, who may call what, what the public can see, that settings change how bookings behave,
 *     that bookings keep their data when a service changes, and password / session handling.
 * Needs the `mingo` dev dependency (npm install).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import express from 'express';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.BUSINESS_TIMEZONE = 'Asia/Kolkata';
process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
process.env.CLOUDINARY_API_KEY = 'cloud-key-123';
process.env.CLOUDINARY_API_SECRET = 'CLOUD-SECRET-VALUE-XYZ';
process.env.WHATSAPP_ACCESS_TOKEN = 'WA-SECRET-TOKEN-ABC123';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.WHATSAPP_API_VERSION = 'v21.0';
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321';
process.env.WHATSAPP_APP_SECRET = 'WA-APP-SECRET';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'WA-VERIFY-TOKEN';
process.env.PHOTOGRAPHER_WHATSAPP_NUMBER = '+91 84467 41308';
delete process.env.CLOUDINARY_FOLDER;
delete process.env.SMTP_HOST;

const { Aggregator, Query } = await import('mingo').catch(() => {
  console.log('SKIPPED: this test needs the "mingo" dev dependency. Run: npm install');
  process.exit(1);
});
const { Booking, BlockedDate, Notification, Package, Service, Setting, User } = await import('../models/index.js');
const { signToken } = await import('../utils/token.js');
const { errorHandler, notFound } = await import('../middleware/errorMiddleware.js');
const { default: settingsRoutes } = await import('../routes/settingsRoutes.js');
const { default: serviceRoutes } = await import('../routes/serviceRoutes.js');
const { createBooking } = await import('../controllers/bookingController.js');
const { invalidate } = await import('../utils/settings.js');
const { seedDefaultServices } = await import('../utils/services.js');
const { createNotifier } = await import('../utils/notificationHelper.js');
const { createSettingsStore } = await import('../utils/settings.js');
const { resetRuntimeConfig } = await import('../utils/runtimeConfig.js');
const { addDays, todayKey } = await import('../utils/validators.js');
const { weekdayOf } = await import('../utils/schedule.js');

// ---------------------------------------------------------------------- quiet console (and a record of what was logged)
const logs = [];
const realLog = console.log;
const out = (s) => realLog(s);
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));
console.info = (...a) => logs.push(a.join(' '));

// ---------------------------------------------------------------------- in-memory stand-in
const db = { settings: [], services: [], bookings: [], users: [], notifications: [], blocks: [], packages: [] };
const tables = { bookings: db.bookings, services: db.services };
const tick = () => new Promise((r) => setImmediate(r));
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
const compare = (a, b) => { const x = a instanceof Date ? +a : a; const y = b instanceof Date ? +b : b; if (x == null && y == null) return 0; if (x == null) return -1; if (y == null) return 1; return x < y ? -1 : x > y ? 1 : 0; };
const sortRows = (rows, sort) => (!sort ? rows : [...rows].sort((a, b) => { for (const [k, dir] of Object.entries(sort)) { const c = compare(a[k], b[k]); if (c) return c * dir; } return 0; }));
const applyUpdate = (row, update) => {
  let changed = false;
  for (const [k, v] of Object.entries(plain(update.$set ?? {}))) { if (JSON.stringify(row[k]) !== JSON.stringify(v)) { row[k] = v; changed = true; } }
  for (const [k, v] of Object.entries(update.$inc ?? {})) { row[k] = (row[k] ?? 0) + v; changed = true; }
  return changed;
};
const query = (run) => {
  const state = {};
  const q = {
    sort(s) { state.sort = s; return q; }, select() { return q; }, limit(n) { state.limit = n; return q; }, lean() { state.lean = true; return q; },
    then(res, rej) { return tick().then(() => run(state)).then(res, rej); },
  };
  return q;
};

function install(Model, table, { unique = [] } = {}) {
  const rows = db[table];
  const attach = (doc) => {
    doc.save = async function save() {
      await this.validate();
      // run the model's real "before save" hooks (e.g. the password hashing)
      await new Promise((resolve, reject) => {
        const p = Model.schema.s.hooks.execPre('save', this, [], (e) => (e ? reject(e) : resolve()));
        if (p?.then) p.then(resolve, reject); // this version of the hooks library answers with a promise
      });
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
  Model.prototype.save = function saveNew() { attach(this); return this.save(); }; // documents made with `new Model()` too
  const open = (row, state) => (state.lean ? structuredClone(row) : attach(Model.hydrate(structuredClone(row))));
  Model.findOne = (filter) => query((s) => { const row = sortRows(rows.filter((r) => matches(r, filter)), s.sort)[0]; return row ? open(row, s) : null; });
  Model.findById = (id) => Model.findOne({ _id: String(id) });
  Model.find = (filter) => query((s) => sortRows(rows.filter((r) => matches(r, filter)), s.sort).slice(0, s.limit ?? Infinity).map((r) => open(r, s)));
  Model.countDocuments = async (filter) => { await tick(); return rows.filter((r) => matches(r, filter)).length; };
  Model.exists = async (filter) => { await tick(); const r = rows.find((x) => matches(x, filter)); return r ? { _id: r._id } : null; };
  Model.create = async (data) => {
    await tick();
    const doc = new Model(data); await doc.validate();
    const raw = plain(doc.toObject());
    for (const f of unique) if (rows.some((r) => r[f] === raw[f])) throw dupKey({ [f]: raw[f] });
    rows.push({ ...raw, createdAt: new Date(), updatedAt: new Date() });
    return attach(Model.hydrate(structuredClone(rows.at(-1))));
  };
  Model.insertMany = async (docs) => { for (const d of docs) await Model.create(d); };
  Model.updateOne = async (filter, update, options = {}) => {
    await tick();
    let row = rows.find((r) => matches(r, filter));
    if (!row && options.upsert) {
      const base = Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== 'object'));
      row = { _id: String(new mongoose.Types.ObjectId()), ...base, ...plain(update.$setOnInsert ?? {}) };
      rows.push(row);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    return { matchedCount: 1, modifiedCount: applyUpdate(row, update) ? 1 : 0 };
  };
  // findOneAndUpdate(...).select().lean(): used for the atomic token-version bump ($inc), returns the updated row when { new: true }
  Model.findOneAndUpdate = (filter, update, options = {}) => query((st) => {
    const row = rows.find((r) => matches(r, filter));
    if (!row) return null;
    const before = structuredClone(row);
    applyUpdate(row, update);
    return open(options.new ? row : before, st);
  });
  Model.aggregate = async (pipeline) => { await tick(); return new Aggregator(plain(pipeline)).run(structuredClone(rows)); };
}
install(Service, 'services', { unique: ['slug'] });
install(Booking, 'bookings');
install(User, 'users', { unique: ['email'] });
install(Notification, 'notifications');
install(Setting, 'settings');
Service.bulkWrite = async (ops) => { await tick(); for (const { updateOne: { filter, update } } of ops) { const row = db.services.find((r) => r._id === String(filter._id)); if (row) applyUpdate(row, update); } };
Booking.prototype.save = async function saveBooking() {
  await this.validate(); await tick();
  const raw = plain(this.toObject());
  if (db.bookings.some((r) => (r.slotKeys ?? []).some((k) => (raw.slotKeys ?? []).includes(k)))) throw dupKey({ slotKeys: 'taken' }); // the unique slot index
  db.bookings.push({ ...raw, createdAt: new Date(), updatedAt: new Date() });
  return this;
};
// Settings: findOne(...).lean() and findOneAndUpdate with upsert
Setting.findOne = (filter) => query(() => { const r = db.settings.find((x) => matches(x, filter)); return r ? structuredClone(r) : null; });
Setting.findOneAndUpdate = async (filter, update) => {
  await tick();
  let row = db.settings.find((x) => matches(x, filter));
  if (!row) { row = { _id: String(new mongoose.Types.ObjectId()), key: 'site' }; db.settings.push(row); }
  Object.assign(row, plain(update.$set));
  return structuredClone(row);
};
BlockedDate.find = (filter) => query(() => db.blocks.filter((b) => matches(b, filter)).map((b) => structuredClone(b)));
Package.findOne = async ({ slug }) => ({ _id: new mongoose.Types.ObjectId(), slug, name: 'Standard', price: 5000, duration: '2 hours', durationHours: 2 });
Package.countDocuments = async () => 0;

Object.defineProperty(mongoose.connection, 'readyState', { get: () => 0, configurable: true }); // no CRM linking in these tests

// ---------------------------------------------------------------------- Cloudinary + Meta are intercepted
const outbound = [];
const mode = { wa: 'ok', cloudinary: 'ok' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.cloudinary.com/')) {
    outbound.push({ to: 'cloudinary', url: u, body: String(init?.body ?? '') });
    if (mode.cloudinary === 'fail') throw new Error('network down');
    return new Response(JSON.stringify({ result: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://graph.facebook.com/')) {
    outbound.push({ to: 'meta', url: u, body: String(init?.body ?? '') });
    if (mode.wa === 'fail') return new Response(JSON.stringify({ error: { code: 190, message: 'Invalid token WA-SECRET-TOKEN-ABC123' } }), { status: 401 });
    if (u.includes('message_templates')) return new Response(JSON.stringify({ data: [{ name: 'new_booking_admin', status: 'APPROVED', language: 'en' }, { name: 'booking_received_customer', status: 'PENDING', language: 'en' }] }), { status: 200 });
    if (u.includes('/messages')) return new Response(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }), { status: 200 });
    return new Response(JSON.stringify({ display_phone_number: '+91 84467 41308', verified_name: 'Pratik', quality_rating: 'GREEN' }), { status: 200 });
  }
  return realFetch(url, init);
};

// ---------------------------------------------------------------------- real HTTP server with the real routes
const PASSWORD = 'correct horse battery';
const ADMIN_ID = String(new mongoose.Types.ObjectId());
const OUTSIDER_ID = String(new mongoose.Types.ObjectId());
const hash = bcrypt.hashSync(PASSWORD, 4);
function seedUsers() {
  db.users.push({ _id: ADMIN_ID, name: 'Pratik Shelke', email: 'pratik@example.com', password: hash, role: 'admin', tokenVersion: 0, createdAt: new Date() });
  db.users.push({ _id: OUTSIDER_ID, name: 'Someone', email: 'other@example.com', password: hash, role: 'customer', tokenVersion: 0, createdAt: new Date() });
}
const adminToken = signToken(ADMIN_ID, 0);
const outsiderToken = signToken(OUTSIDER_ID, 0);

const app = express();
app.set('trust proxy', true); // every test uses its own fake IP so the rate limits of one test never touch another
app.use(express.json());
app.post('/api/bookings', createBooking); // real controller (the booking route's own rate limiter is left out so tests can book freely)
app.use('/api/settings', settingsRoutes);
app.use('/api/services', serviceRoutes);
app.use(notFound);
app.use(errorHandler);
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let ipCounter = 0;
async function call(method, path, { body, token = adminToken, ip } = {}) {
  const res = await realFetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...(token && { authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
const get = (p, o) => call('GET', p, o);
const post = (p, body, o) => call('POST', p, { body, ...o });
const patch = (p, body, o) => call('PATCH', p, { body, ...o });
const put = (p, body, o) => call('PUT', p, { body, ...o });
const del = (p, o) => call('DELETE', p, o);

// ---------------------------------------------------------------------- situations
const IMG = (name) => ({ url: `https://res.cloudinary.com/democloud/image/upload/v1/alex-morgan/portfolio/branding/${name}.png`, publicId: `alex-morgan/portfolio/branding/${name}` });
let dayCounter = 40;
/** the next date `n` days from today whose weekday is `weekday` (or any weekday) */
const futureDate = (weekday, min = 10) => { let d = addDays(todayKey(), min); while (weekday && weekdayOf(d) !== weekday) d = addDays(d, 1); return d; };
const bookingBody = (o = {}) => ({
  name: 'Priya Sharma', email: 'priya@example.com', phone: '+91 98765 43210', shootType: 'wedding', location: 'studio', numberOfPeople: 2,
  package: { id: 'standard' }, date: addDays(todayKey(), (dayCounter += 1)), time: '10:00', ...o,
});
const book = (o) => post('/api/bookings', bookingBody(o), { token: null });
const saveGroup = (group, body) => patch(`/api/settings/${group}`, body);
const seedBookingRow = (o = {}) => {
  const row = { _id: String(new mongoose.Types.ObjectId()), bookingId: `AM-T${String(db.bookings.length + 1).padStart(5, '0')}`, name: 'Seed', email: 's@example.com', phone: '+91 90000 00000', shootType: 'wedding', shootTypeName: 'Weddings', location: 'studio', package: { name: 'Standard', durationHours: 2 }, date: addDays(todayKey(), 12), time: '10:00', status: 'pending', createdAt: new Date(), ...o };
  db.bookings.push(row);
  return row;
};

function reset() {
  Object.values(db).forEach((t) => { t.length = 0; });
  seedUsers();
  invalidate();
  resetRuntimeConfig();
  logs.length = 0; outbound.length = 0;
  mode.wa = 'ok'; mode.cloudinary = 'ok';
  dayCounter = 40;
}
const seeded = async () => { await seedDefaultServices(); };

let failed = 0; let count = 0;
async function test(name, fn) {
  reset(); count += 1;
  try { await fn(); out(`PASS  ${name}`); } catch (err) { failed += 1; out(`FAIL  ${name}\n      ${String(err.stack ?? err.message).split('\n').slice(0, 9).join('\n      ')}`); }
}
const section = (t) => out(`\n--- ${t} ---`);

// ======================================================================= 1  who may call what
section('1  login and admin checks');
const ADMIN_ROUTES = [
  ['GET', '/api/settings'], ['GET', '/api/settings/general'], ['PATCH', '/api/settings/general'], ['GET', '/api/settings/upload-signature'],
  ['GET', '/api/settings/whatsapp/status'], ['POST', '/api/settings/whatsapp/test'], ['GET', '/api/settings/account'],
  ['PATCH', '/api/settings/account/email'], ['PATCH', '/api/settings/account/password'], ['POST', '/api/settings/account/logout-all'],
  ['GET', '/api/services/admin'], ['POST', '/api/services'], ['PUT', '/api/services/order'], ['PATCH', '/api/services/000000000000000000000001'], ['DELETE', '/api/services/000000000000000000000001'],
];
await test('[1] every admin settings and services route refuses no token or a bad token (401) and returns nothing private', async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    for (const token of [null, 'garbage', `${adminToken}x`]) {
      const r = await call(method, path, { token, body: method === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${method} ${path} with ${token}`);
      assert.ok(!r.text.includes('pratik1238737'));
    }
  }
});
await test('[2] a logged-in user who is not an admin gets 403 on every admin route', async () => {
  for (const [method, path] of ADMIN_ROUTES) {
    const r = await call(method, path, { token: outsiderToken, body: method === 'GET' ? undefined : {} });
    assert.equal(r.status, 403, `${method} ${path}`);
  }
});
await test('[3] the public settings and public services need no login', async () => {
  assert.equal((await get('/api/settings/public', { token: null })).status, 200);
  assert.equal((await get('/api/services', { token: null })).status, 200);
});

// ======================================================================= 2  public settings
section('2  what the public can see');
await test('[4] public settings work with NO saved document (defaults) and expose only safe fields', async () => {
  assert.equal(db.settings.length, 0);
  const r = await get('/api/settings/public', { token: null });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.data).sort(), ['booking', 'business', 'general', 'seo', 'website']);
  assert.match(r.headers.get('cache-control'), /max-age/);
  assert.equal(r.json.data.general.currency, 'INR');
  assert.equal(r.json.data.booking.enabled, true);
});
await test('[5] public settings never contain notification choices, the schedule, image ids, tokens or secrets', async () => {
  await saveGroup('general', { logo: IMG('logo') });
  await saveGroup('notifications', { events: { booking_cancelled_customer: false } });
  await saveGroup('booking', { bufferHours: 2 });
  const r = await get('/api/settings/public', { token: null });
  for (const banned of ['publicId', 'notifications', 'availability', 'bufferHours', 'weekly', 'WA-SECRET', 'CLOUD-SECRET', 'cloud-key', 'updatedBy', 'tokenVersion', 'password']) {
    assert.ok(!r.text.includes(banned), `public settings leaked "${banned}"`);
  }
  assert.equal(r.json.data.general.logo.url, IMG('logo').url);
});
await test('[6] a saved change shows up on the public endpoint straight away', async () => {
  await saveGroup('business', { businessName: 'Studio Lumen', social: { youtube: 'https://youtube.com/@lumen' } });
  const r = await get('/api/settings/public', { token: null });
  assert.equal(r.json.data.business.businessName, 'Studio Lumen');
  assert.equal(r.json.data.business.social.youtube, 'https://youtube.com/@lumen');
});

// ======================================================================= 3  reading and saving groups
section('3  reading and saving each section');
await test('[7] GET /api/settings returns every group and the options the screen needs', async () => {
  const r = await get('/api/settings');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.data).sort(), ['availability', 'booking', 'business', 'general', 'notifications', 'seo', 'website']);
  assert.ok(r.json.options.currencies.length > 3); assert.equal(r.json.options.weekdays.length, 7);
  assert.equal(r.json.options.notificationEvents.length, 5); assert.equal(r.json.options.imageStorageConfigured, true);
  assert.ok(!r.text.includes('CLOUD-SECRET') && !r.text.includes('WA-SECRET'));
});
await test('[8] each group saves, persists and returns what was stored; only that group is written', async () => {
  const bodies = {
    general: { websiteName: 'Lumen Studio', timeFormat: '24h' },
    business: { city: 'Pune', postalCode: '411001' },
    booking: { bufferHours: 1, allowNotes: false },
    availability: { weekly: { sunday: { enabled: false, periods: [] } } },
    notifications: { events: { new_message_admin: false } },
    website: { home: { testimonials: false }, contact: { ctaText: 'Say hello' } },
    seo: { title: 'Lumen', description: 'Pune photographer' },
  };
  for (const [group, body] of Object.entries(bodies)) {
    const r = await saveGroup(group, body);
    assert.equal(r.status, 200, `${group}: ${r.text}`);
    assert.equal(r.json.success, true);
    const g = (await get(`/api/settings/${group}`)).json.data;
    assert.deepEqual(g, r.json.data);
  }
  assert.deepEqual(Object.keys(db.settings[0]).filter((k) => !['_id', 'key', 'updatedBy'].includes(k)).sort(), Object.keys(bodies).sort());
  assert.equal(db.settings[0].updatedBy, ADMIN_ID);
});
await test('[9] invalid input gets 400 with a message per field and saves NOTHING', async () => {
  const r = await saveGroup('booking', { enabled: 'yes', bufferHours: 99, minAdvanceDays: 10, maxAdvanceDays: 5 });
  assert.equal(r.status, 400);
  assert.ok(r.json.errors.enabled && r.json.errors.bufferHours);
  assert.equal(db.settings.length, 0);
  const g = await saveGroup('business', { email: 'nope', social: { instagram: 'http://x.com' } });
  assert.equal(g.status, 400); assert.ok(g.json.errors.email && g.json.errors['social.instagram']);
  assert.equal(db.settings.length, 0);
});
await test('[10] unknown group → 404; a body that is not an object → 400; junk keys are ignored', async () => {
  assert.equal((await get('/api/settings/nonsense')).status, 404);
  assert.equal((await saveGroup('nonsense', {})).status, 404);
  assert.equal((await saveGroup('general', [1, 2])).status, 400);
  const r = await saveGroup('general', { websiteName: 'Fine name', role: 'admin', __proto__: { polluted: true } });
  assert.equal(r.status, 200); assert.equal(r.json.data.role, undefined); assert.equal({}.polluted, undefined);
});
await test('[11] two admins saving different sections at the same moment never overwrite each other', async () => {
  const [a, b] = await Promise.all([saveGroup('business', { city: 'Pune' }), saveGroup('seo', { title: 'My SEO title' })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const all = (await get('/api/settings')).json.data;
  assert.equal(all.business.city, 'Pune'); assert.equal(all.seo.title, 'My SEO title');
});
await test('[12] saving a group never touches the others (defaults stay for what was never saved)', async () => {
  await saveGroup('seo', { title: 'Only this' });
  const all = (await get('/api/settings')).json.data;
  assert.equal(all.booking.enabled, true); assert.equal(all.general.currency, 'INR'); assert.equal(all.website.portfolio.enabled, true);
});

// ======================================================================= 4  images
section('4  logo, favicon and sharing image');
await test('[13] the upload signature is for our folder only and never contains the API secret', async () => {
  const r = await get('/api/settings/upload-signature');
  assert.equal(r.status, 200);
  assert.match(r.json.data.folder, /\/branding$/); assert.equal(r.json.data.cloudName, 'democloud');
  assert.ok(!r.text.includes('CLOUD-SECRET-VALUE-XYZ'));
});
await test('[14] an image that did not come from our uploader is refused; a real one is stored', async () => {
  for (const bad of [{ url: 'https://evil.example/x.png', publicId: 'x' }, { url: IMG('a').url, publicId: 'alex-morgan/portfolio/../../x' }, 'text']) {
    assert.equal((await saveGroup('general', { logo: bad })).status, 400);
  }
  assert.equal((await saveGroup('general', { logo: IMG('a') })).status, 200);
  assert.equal(db.settings[0].general.logo.publicId, IMG('a').publicId);
});
await test('[15] replacing or removing an image deletes the old file from storage; a storage failure does not fail the save', async () => {
  await saveGroup('general', { logo: IMG('one') });
  outbound.length = 0;
  assert.equal((await saveGroup('general', { logo: IMG('two') })).status, 200);
  assert.equal(outbound.filter((o) => o.to === 'cloudinary').length, 1);
  assert.ok(outbound[0].body.includes('branding%2Fone'));
  outbound.length = 0; mode.cloudinary = 'fail';
  const r = await saveGroup('general', { logo: null });
  assert.equal(r.status, 200); assert.equal(r.json.data.logo.url, '');
  assert.equal(db.settings[0].general.logo.url, '');
});
await test('[16] saving a group without touching the image does not delete it', async () => {
  await saveGroup('general', { logo: IMG('keep') });
  outbound.length = 0;
  await saveGroup('general', { websiteName: 'Another name' });
  assert.equal(outbound.length, 0);
});

// ======================================================================= 5  services
section('5  photography services');
await test('[17] the six starting services are created ONCE, in order; a deleted one never comes back', async () => {
  assert.deepEqual(await seedDefaultServices(), { seeded: true, created: 6 });
  assert.deepEqual(db.services.map((s) => s.name), ['Weddings', 'Pre-weddings', 'Portrait', 'Baby-Shoots', 'Events', 'Commercial']);
  assert.deepEqual(await seedDefaultServices(), { seeded: false });
  const id = db.services.find((s) => s.slug === 'events')._id;
  assert.equal((await del(`/api/services/${id}`)).status, 200);
  await seedDefaultServices();
  assert.equal(db.services.length, 5);
});
await test('[18] starting-up seeding twice at the same moment creates each service once', async () => {
  await Promise.all([seedDefaultServices(), seedDefaultServices(), seedDefaultServices()]);
  assert.equal(db.services.length, 6);
});
await test('[19] the public list has only ACTIVE services, in display order, with no admin data', async () => {
  await seeded();
  const id = db.services.find((s) => s.slug === 'portrait')._id;
  assert.equal((await patch(`/api/services/${id}`, { active: false })).status, 200);
  const r = await get('/api/services', { token: null });
  assert.deepEqual(r.json.data.map((s) => s.slug), ['wedding', 'pre-wedding', 'baby-shoot', 'events', 'commercial']);
  assert.ok(!r.text.includes('usage') && !r.text.includes('publicId') && !r.text.includes('active'));
});
await test('[R5] a service cannot be named "General" or "Custom" (ids the website already uses), and bad types are refused', async () => {
  await seeded();
  for (const name of ['General', 'custom', ' GENERAL ']) assert.equal((await post('/api/services', { name })).status, 400, name);
  assert.equal((await post('/api/services', { name: 'Okay Shoot', active: 'false' })).status, 400);
  assert.equal((await post('/api/services', { name: 'Okay Shoot', description: 42 })).status, 400);
});
await test('[R6] if creating the starting services fails, the claim is released so the next start tries again', async () => {
  const realInsert = Service.insertMany;
  Service.insertMany = async () => { throw new Error('disk full'); };
  try { await assert.rejects(seedDefaultServices(), /disk full/); } finally { Service.insertMany = realInsert; }
  assert.deepEqual(await seedDefaultServices(), { seeded: true, created: 6 });
});
await test('[20] add a service: the id comes from the name, it goes last, duplicates are refused (409)', async () => {
  await seeded();
  const r = await post('/api/services', { name: '  Maternity  Shoots ', description: 'Glowing portraits' });
  assert.equal(r.status, 201);
  assert.equal(r.json.data.slug, 'maternity-shoots'); assert.equal(r.json.data.name, 'Maternity Shoots'); assert.equal(r.json.data.active, true);
  assert.equal((await get('/api/services', { token: null })).json.data.at(-1).slug, 'maternity-shoots');
  assert.equal((await post('/api/services', { name: 'Maternity Shoots' })).status, 409);
  assert.equal((await post('/api/services', { name: '' })).status, 400);
  assert.equal((await post('/api/services', { name: '!!!' })).status, 400);
  assert.equal((await post('/api/services', { name: 'x'.repeat(61) })).status, 400);
  assert.equal((await post('/api/services', { name: 'Okay', coverImage: { url: 'https://evil.example/a.png', publicId: 'a' } })).status, 400);
});
await test('[21] edit a service: name, description, cover, active. Its id (slug) never changes', async () => {
  await seeded();
  const s = db.services.find((x) => x.slug === 'wedding');
  const r = await patch(`/api/services/${s._id}`, { name: 'Wedding Stories', description: 'New text', slug: 'hacked', coverImage: IMG('cover') });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.slug, 'wedding'); assert.equal(r.json.data.name, 'Wedding Stories'); assert.equal(r.json.data.coverImage.url, IMG('cover').url);
  assert.equal((await patch(`/api/services/${s._id}`, { name: 'X' })).status, 400); // too short
  assert.equal((await patch(`/api/services/${s._id}`, { active: 'no' })).status, 400);
  assert.equal((await patch('/api/services/not-an-id', { name: 'Fine name' })).status, 404);
  assert.equal((await patch('/api/services/ffffffffffffffffffffffff', { name: 'Fine name' })).status, 404);
});
await test('[22] reorder: needs every id exactly once; the public list follows the new order', async () => {
  await seeded();
  const ids = db.services.map((s) => s._id).reverse();
  assert.equal((await put('/api/services/order', { ids })).status, 200);
  assert.deepEqual((await get('/api/services', { token: null })).json.data.map((s) => s.slug), ['commercial', 'events', 'baby-shoot', 'portrait', 'pre-wedding', 'wedding']);
  assert.equal((await put('/api/services/order', { ids: ids.slice(1) })).status, 409);
  assert.equal((await put('/api/services/order', { ids: [...ids.slice(1), ids[1]] })).status, 400);
  assert.equal((await put('/api/services/order', { ids: 'x' })).status, 400);
});
await test('[23] delete: allowed only when no booking uses the service (409 otherwise, nothing deleted); an unused one is removed', async () => {
  await seeded();
  const used = db.services.find((s) => s.slug === 'wedding');
  seedBookingRow({ shootType: 'wedding' });
  const r = await del(`/api/services/${used._id}`);
  assert.equal(r.status, 409); assert.match(r.json.message, /booking/); assert.match(r.json.message, /Switch it off/);
  assert.ok(db.services.some((s) => s.slug === 'wedding'));
  const free = db.services.find((s) => s.slug === 'commercial');
  assert.equal((await del(`/api/services/${free._id}`)).status, 200);
  assert.ok(!db.services.some((s) => s.slug === 'commercial'));
  assert.equal((await del(`/api/services/${free._id}`)).status, 404);
});
await test('[24] the admin list shows how many bookings use each service', async () => {
  await seeded(); seedBookingRow({ shootType: 'portrait' }); seedBookingRow({ shootType: 'portrait' });
  const r = await get('/api/services/admin');
  assert.equal(r.json.data.find((s) => s.slug === 'portrait').usage.bookings, 2);
  assert.equal(r.json.data.find((s) => s.slug === 'events').usage.bookings, 0);
});

// ======================================================================= 6  settings drive bookings
section('6  settings really change how bookings behave');
await test('[25] with default settings a normal booking works exactly like before (201, name snapshot saved)', async () => {
  await seeded();
  const r = await book();
  assert.equal(r.status, 201, r.text);
  assert.equal(db.bookings.length, 1);
  assert.equal(db.bookings[0].shootType, 'wedding'); assert.equal(db.bookings[0].shootTypeName, 'Weddings');
});
await test('[26] bookings switched OFF: 403 with the saved message, nothing stored; switching back ON works again', async () => {
  await seeded();
  await saveGroup('booking', { enabled: false, disabledMessage: 'Back in December!' });
  const r = await book();
  assert.equal(r.status, 403); assert.equal(r.json.message, 'Back in December!');
  assert.equal(db.bookings.length, 0);
  await saveGroup('booking', { enabled: true });
  assert.equal((await book()).status, 201);
});
await test('[27] an INACTIVE or unknown service cannot be booked (400 on shootType); a deleted/disabled service leaves old bookings intact', async () => {
  await seeded();
  assert.equal((await book()).status, 201);
  const s = db.services.find((x) => x.slug === 'wedding');
  await patch(`/api/services/${s._id}`, { active: false });
  const r = await book({ shootType: 'wedding' });
  assert.equal(r.status, 400); assert.ok(r.json.errors.shootType);
  assert.equal((await book({ shootType: 'astro-photography' })).status, 400);
  assert.equal((await book({ shootType: 'wedding; drop' })).status, 400);
  assert.equal(db.bookings.length, 1);
  assert.equal(db.bookings[0].shootType, 'wedding'); assert.equal(db.bookings[0].shootTypeName, 'Weddings');
});
await test('[28] renaming a service does not change what old bookings say; new bookings use the new name', async () => {
  await seeded();
  await book();
  const s = db.services.find((x) => x.slug === 'wedding');
  await patch(`/api/services/${s._id}`, { name: 'Wedding Stories' });
  assert.equal(db.bookings[0].shootTypeName, 'Weddings');
  await book();
  assert.equal(db.bookings[1].shootTypeName, 'Wedding Stories');
});
await test('[29] a brand-new service can be booked straight away', async () => {
  await seeded();
  await post('/api/services', { name: 'Maternity' });
  const r = await book({ shootType: 'maternity' });
  assert.equal(r.status, 201); assert.equal(db.bookings[0].shootTypeName, 'Maternity');
});
await test('[30] same-day: refused by default; allowed (future hours only) once switched on', async () => {
  await seeded();
  const today = todayKey();
  assert.equal((await book({ date: today })).status, 400);
  await saveGroup('booking', { allowSameDay: true });
  const hourNowIST = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hourNowIST < 20) {
    const late = `${String(Math.max(hourNowIST + 1, 7) + 1).padStart(2, '0')}:00`;
    assert.equal((await book({ date: today, time: late })).status, 201);
  }
  assert.equal((await book({ date: today, time: '07:00' })).status, hourNowIST >= 7 ? 409 : 201); // an hour that has passed is not offered
});
await test('[31] minimum and maximum advance are enforced on the server', async () => {
  await seeded();
  await saveGroup('booking', { minAdvanceDays: 5, maxAdvanceDays: 30 });
  const t = todayKey();
  assert.equal((await book({ date: addDays(t, 4) })).status, 400);
  assert.equal((await book({ date: addDays(t, 5) })).status, 201);
  assert.equal((await book({ date: addDays(t, 30), time: '12:00' })).status, 201);
  assert.equal((await book({ date: addDays(t, 31) })).status, 400);
});
await test('[32] working hours: a day switched off, hours outside the day, and a multi-hour shoot crossing a break are refused', async () => {
  await seeded();
  const monday = futureDate('monday'); const tuesday = futureDate('tuesday'); const wednesday = futureDate('wednesday');
  await saveGroup('availability', { weekly: {
    monday: { enabled: false, periods: [] },
    tuesday: { enabled: true, periods: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
  } });
  assert.equal((await book({ date: monday })).status, 409);
  assert.equal((await book({ date: tuesday, time: '08:00' })).status, 409);
  assert.equal((await book({ date: tuesday, time: '19:00' })).status, 409);
  assert.equal((await book({ date: tuesday, time: '11:00' })).status, 409); // 2 hours: 11-13 crosses the 12-14 break
  assert.equal((await book({ date: tuesday, time: '10:00' })).status, 201);
  assert.equal((await book({ date: tuesday, time: '14:00' })).status, 201);
  assert.equal((await book({ date: wednesday, time: '07:00' })).status, 201); // untouched weekday keeps the defaults
});
await test('[33] a special working day opens a day that is normally off', async () => {
  await seeded();
  const sunday = futureDate('sunday');
  await saveGroup('availability', { weekly: { sunday: { enabled: false, periods: [] } } });
  assert.equal((await book({ date: sunday, time: '10:00' })).status, 409);
  await saveGroup('availability', { specialDays: [{ date: sunday, periods: [{ start: '10:00', end: '14:00' }], reason: 'Festival shoot' }] });
  assert.equal((await book({ date: sunday, time: '10:00' })).status, 201);
  assert.equal((await book({ date: sunday, time: '15:00' })).status, 409);
});
await test('[34] blocked dates (holiday, fully booked, vacation) still win, and no slot is ever booked twice', async () => {
  await seeded();
  const d1 = futureDate(null, 12); const d2 = futureDate(null, 14);
  db.blocks.push({ _id: String(new mongoose.Types.ObjectId()), date: d1, type: 'public_holiday', blockedTimes: [] });
  assert.equal((await book({ date: d1 })).status, 409);
  assert.equal((await book({ date: d2, time: '10:00' })).status, 201);
  assert.equal((await book({ date: d2, time: '10:00' })).status, 409); // same slot
  assert.equal((await book({ date: d2, time: '11:00' })).status, 409); // overlaps the 2-hour shoot
  const racing = await Promise.all([book({ date: addDays(d2, 3), time: '10:00' }), book({ date: addDays(d2, 3), time: '10:00' }), book({ date: addDays(d2, 3), time: '10:00' })]);
  assert.equal(racing.filter((r) => r.status === 201).length, 1);
  assert.ok(racing.every((r) => [201, 409].includes(r.status)));
});
await test('[35] buffer time keeps other bookings apart', async () => {
  await seeded();
  const d = futureDate(null, 12);
  await saveGroup('booking', { bufferHours: 1 });
  assert.equal((await book({ date: d, time: '10:00' })).status, 201); // 10-12
  assert.equal((await book({ date: d, time: '12:00' })).status, 409); // directly after: no gap
  assert.equal((await book({ date: d, time: '08:00' })).status, 409); // ends at 10: no gap before
  assert.equal((await book({ date: d, time: '13:00' })).status, 201);
});
await test('[36] optional fields: email / phone / location can be switched to optional, and stay required while on', async () => {
  await seeded();
  assert.equal((await book({ email: '' })).status, 400);
  assert.equal((await book({ phone: '' })).status, 400);
  assert.equal((await book({ location: '' })).status, 400);
  await saveGroup('booking', { emailRequired: false, phoneRequired: false, locationRequired: false });
  const r = await book({ email: '', phone: '', location: '' });
  assert.equal(r.status, 201, r.text);
  assert.equal(db.bookings[0].location, 'undecided');
  assert.equal((await book({ email: 'not-an-email' })).status, 400); // a wrong value is still wrong
  assert.equal((await book({ phone: '123' })).status, 400);
});
await test('[37] notes switched off: notes sent anyway are not stored; custom ("not sure yet") duration follows the setting', async () => {
  await seeded();
  assert.equal((await book({ specialRequest: 'Candid please' })).status, 201);
  assert.equal(db.bookings[0].specialRequest, 'Candid please');
  await saveGroup('booking', { allowNotes: false, customDurationHours: 3 });
  const r = await book({ specialRequest: 'sneaky', package: { id: 'custom' }, time: '10:00' });
  assert.equal(r.status, 201);
  assert.equal(db.bookings[1].specialRequest || '', '');
  assert.equal(db.bookings[1].package.durationHours, 3);
});
await test('[38] saving working hours reports existing bookings that now fall outside them, and changes none of them', async () => {
  await seeded();
  const tuesday = futureDate('tuesday');
  seedBookingRow({ date: tuesday, time: '19:00' }); seedBookingRow({ date: tuesday, time: '09:00', bookingId: 'AM-T99999' });
  const r = await saveGroup('availability', { weekly: { tuesday: { enabled: true, periods: [{ start: '09:00', end: '12:00' }] } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.warnings.bookingsOutsideHours.count, 1);
  assert.equal(db.bookings.length, 2); assert.ok(db.bookings.every((b) => b.status === 'pending'));
  assert.equal((await saveGroup('availability', { weekly: { tuesday: { enabled: true, periods: [{ start: '07:00', end: '22:00' }] } } })).json.warnings, undefined);
});

// ======================================================================= 7  notifications and WhatsApp
section('7  notifications and WhatsApp');
function fakeNotifier(isEventEnabled) {
  const sent = []; const created = [];
  const deps = {
    settings: { isEventEnabled },
    wa: { isConfigured: () => true, normalizeInternational: (n) => String(n).replace(/\D/g, ''), normalizePhone: (n) => String(n).replace(/\D/g, ''), sendTemplate: async (m) => { sent.push(m.template); return { messageId: 'wamid.1' }; } },
    models: { WhatsAppOptOut: { exists: async () => null }, Notification: { create: async (d) => { created.push(d.event); return { ...d, _id: 'n1', attempts: 0, save: async () => {} }; } } },
  };
  return { sent, created, notifier: createNotifier(async () => deps, { info() {}, error() {} }) };
}
await test('[39] a notification switched OFF in Settings is not sent, not logged, and does not use up the one-per-event key', async () => {
  const enabled = { new_booking_admin: true, booking_received_customer: false, booking_confirmed_customer: true, booking_cancelled_customer: false, new_message_admin: true };
  const f = fakeNotifier(async (e) => enabled[e]);
  const booking = { _id: 'b1', bookingId: 'AM-X', whatsappOptIn: true, phone: '+919876543210', status: 'cancelled', name: 'A', date: '2030-01-01', time: '10:00', shootType: 'wedding', package: { name: 'S' } };
  const r = await f.notifier.notifyBookingCreated(booking);
  assert.equal(r.admin.status, 'sent'); assert.equal(r.customer.status, 'disabled');
  assert.deepEqual(f.sent, ['new_booking_admin']); assert.deepEqual(f.created, ['new_booking_admin']);
  assert.equal((await f.notifier.notifyBookingStatusChanged(booking)).status, 'disabled'); // cancelled message is off
});
await test('[40] with no settings saved every notification is on; the real toggles come from the saved document', async () => {
  const f = fakeNotifier(async () => true);
  assert.equal((await f.notifier.notifyNewMessage({ _id: 'm1', name: 'A', email: 'a@b.co', subject: 'general', message: 'hi' })).status, 'sent');
  const store = createSettingsStore(async () => Setting);
  assert.equal(await store.isEventEnabled('new_booking_admin'), true);
  await saveGroup('notifications', { events: { new_booking_admin: false } });
  assert.equal(await createSettingsStore(async () => Setting).isEventEnabled('new_booking_admin'), false);
});
await test('[41] WhatsApp status shows state, names of missing settings and templates, but NEVER a token or secret', async () => {
  const r = await get('/api/settings/whatsapp/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.configured, true); assert.equal(r.json.data.connection.state, 'unchecked');
  assert.equal(r.json.data.webhook.appSecretSet, true);
  assert.equal(r.json.data.templates.length, 5); assert.ok(r.json.data.templates.every((t) => t.approval === null && t.purpose));
  for (const secret of ['WA-SECRET-TOKEN-ABC123', 'WA-APP-SECRET', 'WA-VERIFY-TOKEN', '123456789', '987654321', '84467']) assert.ok(!r.text.includes(secret), `leaked ${secret}`);
  assert.equal(outbound.length, 0); // not live: nothing was sent to Meta
});
await test('[42] the live check asks Meta; only Meta\'s answer marks a template approved', async () => {
  const r = await get('/api/settings/whatsapp/status?live=1');
  assert.equal(r.json.data.connection.state, 'connected'); assert.equal(r.json.data.templateCheck.state, 'checked');
  const by = Object.fromEntries(r.json.data.templates.map((t) => [t.event, t.approval]));
  assert.equal(by.new_booking_admin, 'APPROVED'); assert.equal(by.booking_received_customer, 'PENDING'); assert.equal(by.new_message_admin, 'NOT_FOUND');
  assert.ok(!r.text.includes('WA-SECRET-TOKEN-ABC123'));
});
await test('[43] when Meta rejects the token the error is reported without the token', async () => {
  mode.wa = 'fail';
  const r = await get('/api/settings/whatsapp/status?live=1');
  assert.equal(r.status, 200); assert.equal(r.json.data.connection.state, 'error');
  assert.ok(!r.text.includes('WA-SECRET-TOKEN-ABC123'));
});
await test('[44] last success and last error come from the notification log, with no phone numbers', async () => {
  db.notifications.push({ _id: 'n1', event: 'new_booking_admin', status: 'sent', sentAt: new Date('2026-11-01T10:00:00Z'), recipientHint: '****1308' });
  db.notifications.push({ _id: 'n2', event: 'new_message_admin', status: 'failed', lastError: 'Template not approved', updatedAt: new Date('2026-11-02T10:00:00Z') });
  const r = await get('/api/settings/whatsapp/status');
  assert.equal(r.json.data.lastSuccessAt, '2026-11-01T10:00:00.000Z');
  assert.equal(r.json.data.lastError.message, 'Template not approved');
  assert.ok(!r.text.includes('1308'));
});
await test('[45] the test message needs explicit confirmation, goes only to the photographer\'s own number from .env, and stores nothing', async () => {
  assert.equal((await post('/api/settings/whatsapp/test', {})).status, 400);
  assert.equal((await post('/api/settings/whatsapp/test', { confirm: 'yes' })).status, 400);
  assert.equal(outbound.length, 0);
  const r = await post('/api/settings/whatsapp/test', { confirm: true, to: '+919999999999', phone: '+919999999999' });
  assert.equal(r.status, 200); assert.match(r.json.message, /\*\*\*\*1308/);
  const sent = JSON.parse(outbound[0].body);
  assert.equal(sent.to, '918446741308'); // the number from .env, never the one in the request
  assert.equal(sent.template.name, 'new_message_admin');
  assert.equal(db.notifications.length, 0);
  assert.ok(!r.text.includes('WA-SECRET'));
});
await test('[46] the test message is rate limited (3 per 10 minutes)', async () => {
  const ip = '203.0.113.9';
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await post('/api/settings/whatsapp/test', { confirm: true }, { ip })).status);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});
await test('[47] a failed test send is reported as an error, without the token', async () => {
  mode.wa = 'fail';
  const r = await post('/api/settings/whatsapp/test', { confirm: true });
  assert.ok(r.status >= 400); assert.ok(!r.text.includes('WA-SECRET-TOKEN-ABC123'));
});

// ======================================================================= 8  account and security
section('8  account and security');
await test('[48] account info has no password or hash, says what is supported, and shows session times', async () => {
  const r = await get('/api/settings/account');
  assert.equal(r.status, 200);
  assert.equal(r.json.data.email, 'pratik@example.com');
  assert.deepEqual(r.json.data.features, { changeEmail: true, changePassword: true, logoutEverywhere: true, listSessions: false });
  assert.ok(r.json.data.session.expiresAt);
  for (const banned of ['password', hash, PASSWORD, 'tokenVersion']) assert.ok(!r.text.includes(banned), `leaked ${banned}`);
});
await test('[49] change password: the current password is checked first (400, not 401), and bad new passwords are refused', async () => {
  const bad = (body) => patch('/api/settings/account/password', body);
  const wrong = await bad({ currentPassword: 'nope', newPassword: 'abcdefgh1', confirmPassword: 'abcdefgh1' });
  assert.equal(wrong.status, 400); assert.ok(wrong.json.errors.currentPassword);
  assert.equal((await bad({ newPassword: 'abcdefgh1', confirmPassword: 'abcdefgh1' })).status, 400);
  assert.ok((await bad({ currentPassword: PASSWORD, newPassword: 'short', confirmPassword: 'short' })).json.errors.newPassword);
  assert.ok((await bad({ currentPassword: PASSWORD, newPassword: 'abcdefgh1', confirmPassword: 'different' })).json.errors.confirmPassword);
  assert.ok((await bad({ currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD })).json.errors.newPassword);
  assert.ok((await bad({ currentPassword: PASSWORD, newPassword: 'é'.repeat(40), confirmPassword: 'é'.repeat(40) })).json.errors.newPassword); // 80 bytes > bcrypt's 72
  assert.equal((await bad({ currentPassword: { $ne: '' }, newPassword: 'abcdefgh1', confirmPassword: 'abcdefgh1' })).status, 400);
  assert.equal(db.users[0].password, hash); // nothing changed
});
await test('[50] change password works: stored hashed (never plain), old sessions end, this one continues with a fresh token', async () => {
  const r = await patch('/api/settings/account/password', { currentPassword: PASSWORD, newPassword: 'a brand new pass', confirmPassword: 'a brand new pass' });
  assert.equal(r.status, 200); assert.ok(r.json.token);
  const stored = db.users.find((u) => u._id === ADMIN_ID);
  assert.notEqual(stored.password, hash); assert.notEqual(stored.password, 'a brand new pass'); assert.match(stored.password, /^\$2[aby]\$/);
  assert.ok(await bcrypt.compare('a brand new pass', stored.password));
  assert.equal(stored.tokenVersion, 1);
  assert.ok(!r.text.includes(stored.password));
  assert.equal((await get('/api/settings/account')).status, 401); // the old token is dead
  assert.equal((await get('/api/settings/account', { token: r.json.token })).status, 200);
});
await test('[51] log out everywhere: needs the password, ends the other sessions, keeps this device signed in', async () => {
  const other = signToken(ADMIN_ID, 0); // a token on "another device"
  assert.equal((await post('/api/settings/account/logout-all', {})).status, 400);
  assert.equal((await post('/api/settings/account/logout-all', { currentPassword: 'wrong' })).status, 400);
  const r = await post('/api/settings/account/logout-all', { currentPassword: PASSWORD });
  assert.equal(r.status, 200); assert.ok(r.json.token);
  assert.equal((await get('/api/settings/account', { token: other })).status, 401);
  assert.equal((await get('/api/settings/account', { token: r.json.token })).status, 200);
});
await test('[52] a login token from before this feature (no version claim) still works until logout-everywhere is used', async () => {
  const jwt = (await import('jsonwebtoken')).default;
  const legacy = jwt.sign({ id: ADMIN_ID }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  assert.equal((await get('/api/settings/account', { token: legacy })).status, 200);
});
await test('[53] change email: password required, must be valid and unused; the new address is stored lower-case', async () => {
  const body = (o) => patch('/api/settings/account/email', { currentPassword: PASSWORD, email: 'new@example.com', ...o });
  assert.ok((await body({ currentPassword: 'nope' })).json.errors.currentPassword);
  assert.ok((await body({ email: 'not-an-email' })).json.errors.email);
  assert.ok((await body({ email: 'PRATIK@example.com' })).json.errors.email); // already yours
  assert.equal((await body({ email: 'other@example.com' })).status, 409); // someone else's
  const r = await body({ email: ' New.Admin@Example.com ' });
  assert.equal(r.status, 200); assert.equal(r.json.data.email, 'new.admin@example.com');
  assert.equal(db.users.find((u) => u._id === ADMIN_ID).email, 'new.admin@example.com');
  assert.ok(!r.text.includes('password'));
});
await test('[54] password attempts are rate limited like the login (10 per 15 minutes)', async () => {
  const ip = '203.0.113.50'; let last;
  for (let i = 0; i < 11; i += 1) last = (await patch('/api/settings/account/password', { currentPassword: 'nope', newPassword: 'abcdefgh1', confirmPassword: 'abcdefgh1' }, { ip })).status;
  assert.equal(last, 429);
});

// ======================================================================= 9  nothing leaks anywhere
section('9  secrets');
await test('[55] no response of any settings route contains a secret from .env', async () => {
  await seeded();
  const secrets = ['WA-SECRET-TOKEN-ABC123', 'CLOUD-SECRET-VALUE-XYZ', 'WA-APP-SECRET', 'WA-VERIFY-TOKEN', process.env.JWT_SECRET, hash];
  const responses = [
    await get('/api/settings'), await get('/api/settings/public', { token: null }), await get('/api/settings/whatsapp/status?live=1'),
    await get('/api/settings/upload-signature'), await get('/api/settings/account'), await get('/api/services/admin'), await get('/api/services', { token: null }),
    await saveGroup('seo', { title: 'x title' }), await saveGroup('booking', { bufferHours: 99 }),
  ];
  for (const r of responses) for (const s of secrets) assert.ok(!r.text.includes(s), `response leaked a secret (${r.status})`);
});

console.log = realLog;
server.close();
out(`\n${count - failed} of ${count} passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed ? 1 : 0);
