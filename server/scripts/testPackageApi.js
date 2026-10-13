/**
 * Tests the package-management API against the RUNNING server.
 *   1) npm run dev                  (terminal 1)
 *   2) npm run test:packages        (terminal 2)
 * Creates ONE temporary package ("API Test Package") and ONE temporary booking made with it, then deletes both.
 * Counts as 1 of your 10 public booking requests per hour. Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env.
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

const NEW = { name: 'API Test Package', price: 750, duration: '90 minutes', durationHours: 2, description: 'temporary', features: ['  1 location ', '', 'Online gallery'], category: 'general' };
let id = null;
let bookingRef = null;
const publicList = async () => (await call('/packages')).data?.data ?? [];
const publicHas = async () => (await publicList()).find((p) => p.id === 'api-test-package');
const adminHas = async () => ((await call('/packages/admin', { token })).data?.data ?? []).find((p) => p._id === id);

try {
  console.log('\n-- Only an admin can manage packages --');
  for (const [label, path, method, body] of [
    ['list every package', '/packages/admin', 'GET'],
    ['create a package', '/packages', 'POST', NEW],
    ['edit a package', '/packages/000000000000000000000000', 'PATCH', { price: 1 }],
    ['delete a package', '/packages/000000000000000000000000', 'DELETE'],
  ]) check(`${label} without a token → 401`, (await call(path, { method, body })).status === 401);
  check('the public list needs no token → 200', (await call('/packages')).status === 200);

  console.log('\n-- Creating --');
  const refuse = async (label, body, expected = 400) => { const r = await call('/packages', { method: 'POST', body, token }); check(label, r.status === expected, `got ${r.status}: ${r.data?.message ?? ''}`); };
  await refuse('no name → 400', { ...NEW, name: '' });
  await refuse('a negative price → 400', { ...NEW, name: 'Neg', price: -5 });
  await refuse('no price → 400', { ...NEW, name: 'NoPrice', price: undefined });
  await refuse('no duration → 400', { ...NEW, name: 'NoDur', duration: '' });
  await refuse('duration of 0 hours → 400', { ...NEW, name: 'Zero', durationHours: 0 });
  await refuse('duration of 13 hours → 400', { ...NEW, name: 'Long', durationHours: 13 });
  await refuse('a part-hour duration (2.5) → 400', { ...NEW, name: 'Half', durationHours: 2.5 });
  await refuse('more than 15 features → 400', { ...NEW, name: 'Many', features: Array.from({ length: 16 }, (_, i) => `f${i}`) });
  await refuse('an unknown category → 400', { ...NEW, name: 'Cat', category: 'spa' });
  await refuse('the reserved name "Custom" → 400', { ...NEW, name: 'Custom' });
  await refuse('the reserved name "  CUSTOM! " → 400', { ...NEW, name: '  CUSTOM! ' });

  const made = await call('/packages', { method: 'POST', body: NEW, token });
  check('a valid package → 201', made.status === 201 && Boolean(made.data?.data?._id), `got ${made.status}: ${made.data?.message ?? ''}`);
  id = made.data?.data?._id;
  const pkg = made.data?.data ?? {};
  check('link name (slug) is made from the name, and it is active by default', pkg.slug === 'api-test-package' && pkg.id === 'api-test-package' && pkg.active === true);
  check('features are tidied (trimmed, blanks dropped)', JSON.stringify(pkg.features) === '["1 location","Online gallery"]', JSON.stringify(pkg.features));
  check('a new package goes to the end of the list', typeof pkg.sortOrder === 'number' && pkg.sortOrder > 0);
  check('it shows on the public pricing list', Boolean(await publicHas()));
  await refuse('the same name again → 409', NEW, 409);
  await refuse('a near-identical name ("api test package!") → 409', { ...NEW, name: 'api test package!' }, 409);

  console.log('\n-- Editing: price, features, name --');
  const edit = await call(`/packages/${id}`, { method: 'PATCH', body: { price: 900, features: ['Everything in the gallery', 'Print release', ''] }, token });
  check('change price and features → 200', edit.status === 200 && edit.data.data.price === 900 && edit.data.data.features.length === 2, `got ${edit.status}`);
  const live = await publicHas();
  check('the public list shows the new price and features straight away', live?.price === 900 && live.features[0] === 'Everything in the gallery');
  const renamed = await call(`/packages/${id}`, { method: 'PATCH', body: { name: 'API Test Package Renamed' }, token });
  check('renaming keeps the same link name (old links and bookings keep working)', renamed.status === 200 && renamed.data.data.slug === 'api-test-package' && renamed.data.data.name === 'API Test Package Renamed');
  check('the link name itself cannot be edited (nothing editable in that request → 400)', (await call(`/packages/${id}`, { method: 'PATCH', body: { slug: 'hacked' }, token })).status === 400);
  check('features must be a list → 400', (await call(`/packages/${id}`, { method: 'PATCH', body: { features: 'nope' }, token })).status === 400);
  check('renaming to "Custom" → 400', (await call(`/packages/${id}`, { method: 'PATCH', body: { name: 'custom' }, token })).status === 400);
  check('a negative price → 400', (await call(`/packages/${id}`, { method: 'PATCH', body: { price: -1 }, token })).status === 400);
  check('an empty edit → 400', (await call(`/packages/${id}`, { method: 'PATCH', body: {}, token })).status === 400);

  console.log('\n-- Activate / deactivate --');
  await call(`/packages/${id}`, { method: 'PATCH', body: { active: false }, token });
  check('deactivated → gone from the public list…', !(await publicHas()));
  const hidden = await adminHas();
  check('…but still in the admin list, marked inactive', hidden?.active === false);
  const blocked = await call('/bookings', { method: 'POST', body: { name: 'Pkg Test', email: 'pkg-test@example.invalid', phone: '+1 123 456 7890', shootType: 'portrait', location: 'studio', people: 1, packageId: 'api-test-package', date: '2099-01-01', time: '10:00' } });
  check('a customer cannot book an inactive package → 400', blocked.status === 400, `got ${blocked.status}`);
  await call(`/packages/${id}`, { method: 'PATCH', body: { active: true }, token });
  check('reactivated → back on the public list', Boolean(await publicHas()));

  console.log('\n-- Deleting --');
  const d = new Date(); d.setDate(d.getDate() + 400);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const booked = await call('/bookings', { method: 'POST', body: { name: 'Pkg Test', email: 'pkg-test@example.invalid', phone: '+1 123 456 7890', shootType: 'portrait', location: 'studio', people: 1, packageId: 'api-test-package', date: day, time: '10:00' } });
  if (booked.status !== 201) throw new Error(`setup: could not book the test package (status ${booked.status}: ${booked.data?.message})`);
  bookingRef = booked.data.data.reference;
  const usage = (await call('/packages/admin', { token })).data?.usage ?? {};
  check('the admin list counts the bookings that used the package', usage['api-test-package'] === 1, JSON.stringify(usage['api-test-package']));

  const del = await call(`/packages/${id}`, { method: 'DELETE', token });
  check('delete → 200 and it says how many bookings used it', del.status === 200 && del.data.bookings === 1, `got ${del.status}: ${JSON.stringify(del.data)}`);
  check('it is gone from the public and the admin list', !(await publicHas()) && !(await adminHas()));
  const kept = await call(`/bookings/${bookingRef}`, { token });
  check('the booking made with it keeps its saved name, price and duration', kept.status === 200 && kept.data.data.package.name === 'API Test Package Renamed' && kept.data.data.package.price === 900 && kept.data.data.package.durationHours === 2, JSON.stringify(kept.data?.data?.package));
  check('deleting it again → 404', (await call(`/packages/${id}`, { method: 'DELETE', token })).status === 404);
  check('a malformed id → 404', (await call('/packages/not-an-id', { method: 'DELETE', token })).status === 404);
  id = null;
} catch (err) {
  console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  if (bookingRef) await call(`/bookings/${bookingRef}`, { method: 'DELETE', token }).catch(() => {});
  if (id) await call(`/packages/${id}`, { method: 'DELETE', token }).catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
