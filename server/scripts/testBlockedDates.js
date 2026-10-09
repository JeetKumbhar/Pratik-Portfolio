/**
 * Tests the block-dates API against the RUNNING server.
 *   1) npm run dev                  (terminal 1)
 *   2) npm run test:blocks          (terminal 2)
 * Blocks some days ~200 days ahead, books one slot, checks the rules, and removes everything it created.
 * Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env. Counts as 1 of your 10 public booking requests per hour.
 */
import 'dotenv/config';

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

let failed = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `   (${detail})` : ''}`);
  if (!pass) failed += 1;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

try { await call('/health'); } catch { console.error(`Cannot reach ${BASE}. Start the server first (npm run dev).`); process.exit(1); }
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env'); process.exit(1); }
const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
const token = login.data?.token;
if (!token) { console.error('Admin login failed. Check ADMIN_EMAIL / ADMIN_PASSWORD (the seeded admin).'); process.exit(1); }

const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const [V1, V2, V3] = [day(200), day(201), day(202)]; // a three-day vacation
const PARTIAL = day(210);
const BOOKED = day(215);

const blockIds = [];
let bookingRef = null;
const block = async (body) => {
  const res = await call('/blocked-dates', { method: 'POST', body, token });
  (res.data?.data ?? []).forEach((b) => blockIds.push(b.id));
  return res;
};
const adminDay = async (date) => {
  const [y, m] = date.split('-').map(Number);
  const res = await call(`/availability/admin/calendar?year=${y}&month=${m}`, { token });
  return res.data?.data?.find((x) => x.date === date);
};
const publicMonth = async (date) => {
  const [y, m] = date.split('-').map(Number);
  return (await call(`/availability?year=${y}&month=${m}`)).data;
};

try {
  console.log('\n-- Only an admin can change blocks --');
  check('POST without a token → 401', (await call('/blocked-dates', { method: 'POST', body: { type: 'vacation', startDate: V1 } })).status === 401);
  check('DELETE without a token → 401', (await call('/blocked-dates/000000000000000000000000', { method: 'DELETE' })).status === 401);

  console.log('\n-- Bad requests are refused --');
  const refuse = async (label, body) => { const r = await block(body); check(label, r.status === 400, `got ${r.status}`); };
  await refuse('no date → 400', { type: 'vacation' });
  await refuse('end date before start date → 400', { type: 'vacation', startDate: V2, endDate: V1 });
  await refuse('a range longer than 60 days → 400', { type: 'vacation', startDate: V1, endDate: day(200 + 61) });
  await refuse('an unknown type → 400', { type: 'holiday', startDate: V1 });
  await refuse('a malformed hour → 400', { type: 'offline_booking', startDate: V1, blockedTimes: ['25:00'] });
  await refuse('a date in the past → 400', { type: 'vacation', startDate: day(-3) });
  await refuse('a fake date → 400', { type: 'vacation', startDate: '2099-02-31' });

  console.log('\n-- A three-day vacation --');
  const vac = await block({ type: 'vacation', startDate: V1, endDate: V3, reason: 'Test trip', note: 'private' });
  check('created 3 blocks (one per day) → 201', vac.status === 201 && vac.data.created === 3, `got ${vac.status}: ${vac.data?.message ?? ''}`);
  const again = await block({ type: 'vacation', startDate: V1, endDate: V3 });
  check('asking again is harmless: nothing new, 3 skipped', again.status === 201 && again.data.created === 0 && again.data.skipped === 3);
  const a1 = await adminDay(V1);
  check('admin calendar labels the day "vacation" and returns the block id + note', a1?.label === 'vacation' && Boolean(a1.blocks[0]?.id) && a1.blocks[0].note === 'private', JSON.stringify(a1?.blocks?.[0]));
  const pub = await publicMonth(V2);
  check('customers see those days as unavailable', pub?.data?.[V1] === 'unavailable' && pub?.data?.[V2] === 'unavailable' && pub?.data?.[V3] === 'unavailable');
  check('and never see the reason', !/vacation|Test trip|private/i.test(JSON.stringify(pub)));

  console.log('\n-- Blocking only some hours (an offline booking) --');
  const part = await block({ type: 'offline_booking', startDate: PARTIAL, blockedTimes: ['14:00', '15:00'], reason: 'Phone booking' });
  check('partial block created', part.status === 201 && part.data.created === 1, `got ${part.status}`);
  const slots = (await call(`/availability/${PARTIAL}`)).data?.data?.slots ?? [];
  const free = (t) => slots.find((s) => s.time === t)?.available;
  check('the blocked hours are unavailable, the rest stay bookable', free('14:00') === false && free('15:00') === false && free('13:00') === true && free('16:00') === true);
  const adminPartial = await adminDay(PARTIAL);
  check('admin sees it as an offline booking with its hours', adminPartial?.blocks[0]?.type === 'offline_booking' && adminPartial.blocks[0].allDay === false && adminPartial.blocks[0].blockedTimes.join() === '14:00,15:00');

  console.log('\n-- Blocking over a customer booking --');
  const booked = await call('/bookings', { method: 'POST', body: { name: 'Block Test', email: 'block-test@example.invalid', phone: '+1 123 456 7890', shootType: 'portrait', location: 'studio', people: 1, packageId: 'essential', date: BOOKED, time: '10:00' } });
  if (booked.status !== 201) throw new Error(`setup: could not create a booking on ${BOOKED} (status ${booked.status}: ${booked.data?.message})`);
  bookingRef = booked.data.data.reference;

  const wholeDay = await block({ type: 'editing', startDate: BOOKED });
  check('blocking the whole day over a booking → 409 with the booking listed', wholeDay.status === 409 && wholeDay.data.conflicts?.[0]?.reference === bookingRef, `got ${wholeDay.status}`);
  const elsewhere = await block({ type: 'personal', startDate: BOOKED, blockedTimes: ['15:00'] });
  check('blocking hours that do NOT touch the booking → 201', elsewhere.status === 201, `got ${elsewhere.status}`);
  const forced = await block({ type: 'editing', startDate: BOOKED, force: true });
  check('force:true blocks anyway and still reports the conflict', forced.status === 201 && forced.data.created === 1 && forced.data.conflicts.length === 1, `got ${forced.status}`);
  const adminBooked = await adminDay(BOOKED);
  check('admin calendar shows both the booking and the editing block', adminBooked?.bookings[0]?.reference === bookingRef && adminBooked.blocks.some((b) => b.type === 'editing'));

  console.log('\n-- Removing a block --');
  const target = a1.blocks[0].id;
  check('DELETE a block → 200', (await call(`/blocked-dates/${target}`, { method: 'DELETE', token })).status === 200);
  check('the day is bookable again', (await adminDay(V1))?.blocks.length === 0);
  check('deleting it again → 404', (await call(`/blocked-dates/${target}`, { method: 'DELETE', token })).status === 404);
  check('a malformed id → 404', (await call('/blocked-dates/not-an-id', { method: 'DELETE', token })).status === 404);
} catch (err) {
  console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  for (const id of blockIds) await call(`/blocked-dates/${id}`, { method: 'DELETE', token }).catch(() => {});
  if (bookingRef) await call(`/bookings/${bookingRef}`, { method: 'DELETE', token }).catch(() => {});
  console.log(`\nCleaned up ${blockIds.length} block(s)${bookingRef ? ' and 1 booking' : ''}.`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
