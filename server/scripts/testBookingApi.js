/**
 * End-to-end test of the Booking API against your RUNNING server.
 *   1) npm run dev        (terminal 1)
 *   2) npm run test:api   (terminal 2)
 * Needs ADMIN_EMAIL + ADMIN_PASSWORD in .env (the admin created by `npm run seed`).
 * Creates temporary bookings/blocks (emails api-test-*@example.invalid) and deletes them at the end.
 * Other address:  BASE_URL=http://localhost:5001 npm run test:api
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Booking, BlockedDate } from '../models/index.js';

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const MARK = '__api-test__';
const TEST_EMAIL = /^api-test-.*@example\.invalid$/;

const pad = (n) => String(n).padStart(2, '0');
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const D1 = addDays(400);
const D2 = addDays(401);
const D3 = addDays(402);

let failed = 0;
const check = (label, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${pass || !extra ? '' : `   ← ${extra}`}`);
  if (!pass) failed += 1;
};

async function api(method, path, { body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

// Uses the FRONTEND's field names on purpose (people, requests, packageId)
const payload = (n, patch = {}) => ({
  name: 'API Test', email: `api-test-${n}@example.invalid`, phone: '+1 123 456 7890',
  shootType: 'wedding', location: 'outdoor', people: 2, styles: ['Natural'], requests: 'API test booking',
  packageId: 'standard', date: D1, time: '07:00', ...patch,
});

async function run() {
  await connectDB();
  await Booking.deleteMany({ email: TEST_EMAIL });
  await BlockedDate.deleteMany({ note: MARK });

  console.log(`\nTesting ${BASE}\n`);
  const health = await api('GET', '/api/health');
  if (health.status !== 200) throw new Error(`Server not reachable at ${BASE}. Start it with: npm run dev`);
  check('server is running', true);

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');

  console.log('\n-- Login --');
  const wrong = await api('POST', '/api/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: 'definitely-wrong' } });
  check('wrong password → 401', wrong.status === 401);
  const injection = await api('POST', '/api/auth/login', { body: { email: { $ne: '' }, password: { $ne: '' } } });
  check('login with MongoDB operators instead of strings → 400 (injection blocked)', injection.status === 400);
  const login = await api('POST', '/api/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
  check('correct login → 200 + token', login.status === 200 && Boolean(login.data?.token), JSON.stringify(login.data));
  const token = login.data?.token;
  if (!token) throw new Error('Cannot continue without a token (is JWT_SECRET set? are ADMIN_* correct in .env?)');
  check('login response never contains the password', !JSON.stringify(login.data).includes('password'));

  console.log('\n-- Admin routes are protected --');
  check('GET /api/bookings without token → 401', (await api('GET', '/api/bookings')).status === 401);
  check('GET /api/bookings with a garbage token → 401', (await api('GET', '/api/bookings', { token: 'nonsense' })).status === 401);
  check('GET /api/auth/me with token → 200', (await api('GET', '/api/auth/me', { token })).status === 200);

  console.log('\n-- POST /api/bookings (public) --');
  const empty = await api('POST', '/api/bookings', { body: {} });
  check('empty body → 400 with field errors', empty.status === 400 && Object.keys(empty.data?.errors ?? {}).length >= 5, JSON.stringify(empty.data));

  const first = await api('POST', '/api/bookings', { body: payload(1) });
  check('valid booking → 201 with a reference', first.status === 201 && /^AM-[A-Z0-9]{6}$/.test(first.data?.data?.reference), JSON.stringify(first.data));
  const ref = first.data?.data?.reference;
  check('response is minimal (no email/phone echoed back)', first.data?.data && !('email' in first.data.data) && !('phone' in first.data.data));

  check('same slot again → 409', (await api('POST', '/api/bookings', { body: payload(2) })).status === 409);

  const past = await api('POST', '/api/bookings', { body: payload(3, { date: '2020-01-01', time: '09:00' }) });
  check('date in the past → 400 (field: date)', past.status === 400 && Boolean(past.data?.errors?.date), JSON.stringify(past.data));

  const badPkg = await api('POST', '/api/bookings', { body: payload(4, { packageId: 'nope', time: '09:00' }) });
  check('unknown package → 400 (field: packageId)', badPkg.status === 400 && Boolean(badPkg.data?.errors?.packageId));

  const lyingPrice = await api('POST', '/api/bookings', { body: payload(5, { time: '10:00', package: { id: 'standard', price: 1 } }) });
  check('booking with a fake price in the body → 201 (price is ignored)', lyingPrice.status === 201);

  const custom = await api('POST', '/api/bookings', { body: payload(6, { packageId: 'custom', time: '08:00' }) });
  check('"Not sure yet" (custom) package → 201', custom.status === 201);

  const sneaky = await api('POST', '/api/bookings', { body: payload(7, { time: '09:00', status: 'confirmed', adminNotes: 'hacked', bookingId: 'AM-HACKED' }) });
  check('booking that tries to set status/adminNotes/bookingId → 201', sneaky.status === 201);
  const sneakyRef = sneaky.data?.data?.reference;
  const sneakyAdmin = await api('GET', `/api/bookings/${sneakyRef}`, { token });
  check('…but status stayed "pending", notes empty, reference is server-made',
    sneakyAdmin.data?.data?.status === 'pending' && sneakyAdmin.data?.data?.adminNotes === '' && sneakyRef !== 'AM-HACKED', JSON.stringify(sneakyAdmin.data?.data));

  await BlockedDate.create({ date: D2, type: 'personal', blockedTimes: ['09:00'], note: MARK });
  await BlockedDate.create({ date: D3, type: 'vacation', note: MARK }); // whole day
  check('blocked hour → 409', (await api('POST', '/api/bookings', { body: payload(8, { date: D2, time: '09:00' }) })).status === 409);
  check('another hour on the same day → 201', (await api('POST', '/api/bookings', { body: payload(9, { date: D2, time: '10:00' }) })).status === 201);
  check('whole-day block → 409', (await api('POST', '/api/bookings', { body: payload(10, { date: D3, time: '12:00' }) })).status === 409);

  const limitEmail = 'api-test-limit@example.invalid';
  for (const time of ['13:00', '14:00', '15:00']) {
    await api('POST', '/api/bookings', { body: payload(0, { email: limitEmail, date: D1, time }) });
  }
  const fourth = await api('POST', '/api/bookings', { body: payload(0, { email: limitEmail, date: D1, time: '16:00' }) });
  check('4th pending request from the same email → 429', fourth.status === 429);

  console.log('\n-- GET /api/bookings (admin) --');
  const list = await api('GET', '/api/bookings?q=api-test&limit=100&sort=oldest', { token });
  check('list → 200 with data + pagination', list.status === 200 && Array.isArray(list.data?.data) && list.data.total >= 6 && list.data.page === 1, JSON.stringify(list.data)?.slice(0, 200));
  check('list includes adminNotes field (admin view)', list.data?.data?.every((b) => 'adminNotes' in b));
  check('?status=bogus → 400', (await api('GET', '/api/bookings?status=bogus', { token })).status === 400);
  check('?date=not-a-date → 400', (await api('GET', '/api/bookings?date=oops', { token })).status === 400);
  const filtered = await api('GET', `/api/bookings?status=pending&date=${D1}&limit=100`, { token });
  check('?status=pending&date=… filters correctly', filtered.status === 200 && filtered.data.data.length > 0 && filtered.data.data.every((b) => b.date === D1 && b.status === 'pending'));
  check('?q=<regex characters> is safe → 200', (await api('GET', '/api/bookings?q=.*(', { token })).status === 200);
  check('?status[$ne]=x style input is ignored, not executed', (await api('GET', '/api/bookings?status[$ne]=pending', { token })).status === 200);

  console.log('\n-- GET /api/bookings/:id (admin) --');
  const byRef = await api('GET', `/api/bookings/${ref}`, { token });
  check('by reference (AM-XXXXXX) → 200', byRef.status === 200 && byRef.data?.data?.reference === ref);
  const mongoId = byRef.data?.data?.id;
  check('by Mongo id → 200', (await api('GET', `/api/bookings/${mongoId}`, { token })).status === 200);
  check('malformed id → 400', (await api('GET', '/api/bookings/not-an-id', { token })).status === 400);
  check('unknown id → 404', (await api('GET', '/api/bookings/AM-ZZZZZZ', { token })).status === 404);

  console.log('\n-- PATCH /api/bookings/:id (admin) --');
  check('PATCH without token → 401', (await api('PATCH', `/api/bookings/${ref}`, { body: { status: 'confirmed' } })).status === 401);
  const confirm = await api('PATCH', `/api/bookings/${ref}`, { token, body: { status: 'confirmed', adminNotes: 'Called to confirm' } });
  check('status → confirmed (+ note) → 200', confirm.status === 200 && confirm.data?.data?.status === 'confirmed' && confirm.data.data.adminNotes === 'Called to confirm', JSON.stringify(confirm.data));
  check('invalid status → 400', (await api('PATCH', `/api/bookings/${ref}`, { token, body: { status: 'maybe' } })).status === 400);
  check('empty PATCH → 400', (await api('PATCH', `/api/bookings/${ref}`, { token, body: {} })).status === 400);
  check('PATCH cannot change the reference', (await api('PATCH', `/api/bookings/${ref}`, { token, body: { bookingId: 'AM-HACKED', adminNotes: 'x' } })).data?.data?.reference === ref);

  const clash = await api('PATCH', `/api/bookings/${ref}`, { token, body: { date: D1, time: '08:00' } }); // custom booking holds D1 08:00
  check('reschedule into a taken slot → 409', clash.status === 409, JSON.stringify(clash.data));
  const intoBlock = await api('PATCH', `/api/bookings/${ref}`, { token, body: { date: D2, time: '09:00' } });
  check('reschedule into a blocked hour → 409', intoBlock.status === 409);
  const moved = await api('PATCH', `/api/bookings/${ref}`, { token, body: { date: D1, time: '11:00' } });
  check('reschedule to a free slot → 200', moved.status === 200 && moved.data?.data?.time === '11:00');

  const cancelled = await api('PATCH', `/api/bookings/${ref}`, { token, body: { status: 'cancelled' } });
  check('cancel → 200', cancelled.status === 200 && cancelled.data?.data?.status === 'cancelled');
  const reuse = await api('POST', '/api/bookings', { body: payload(11, { time: '11:00' }) });
  check('the cancelled booking\'s slot can be booked again → 201', reuse.status === 201);

  console.log('\n-- DELETE /api/bookings/:id (admin) --');
  check('DELETE without token → 401', (await api('DELETE', `/api/bookings/${ref}`)).status === 401);
  check('DELETE with token → 200', (await api('DELETE', `/api/bookings/${ref}`, { token })).status === 200);
  check('deleted booking is gone → 404', (await api('GET', `/api/bookings/${ref}`, { token })).status === 404);
}

try {
  await run();
} catch (err) {
  console.error(`\nTest stopped: ${err.message}`);
  failed += 1;
} finally {
  await Booking.deleteMany({ email: TEST_EMAIL }).catch(() => {});
  await BlockedDate.deleteMany({ note: MARK }).catch(() => {});
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
