/**
 * Proves the booking-management API rules against the RUNNING server.
 *   1) npm run dev                 (terminal 1)
 *   2) npm run test:bookings       (terminal 2)
 * Creates 4 temporary bookings (customer "mgmt-test@example.invalid", ~300 days ahead) and deletes them at the end.
 * Counts towards the public limit of 10 booking requests per hour. Uses ADMIN_EMAIL / ADMIN_PASSWORD from .env.
 * Confirmation/cancellation emails are printed in the server terminal (no SMTP needed).
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

const d = new Date(); d.setDate(d.getDate() + 300);
const DAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const created = [];

async function book(time) {
  const res = await call('/bookings', {
    method: 'POST',
    body: { name: 'Mgmt Test', email: 'mgmt-test@example.invalid', phone: '+1 123 456 7890', shootType: 'portrait', location: 'studio', people: 1, packageId: 'essential', date: DAY, time },
  });
  if (res.status === 201) created.push(res.data.data.reference);
  return res;
}
const patch = (ref, body) => call(`/bookings/${ref}`, { method: 'PATCH', body, token });

try {
  const [A, B, C] = [await book('07:00'), await book('09:00'), await book('11:00')];
  if (![A, B, C].every((r) => r.status === 201)) {
    console.error(`Could not create the test bookings on ${DAY} (statuses ${[A, B, C].map((r) => r.status)}). Is something already booked then, or did you hit the 10-per-hour limit?`);
    throw new Error('setup failed');
  }
  const [a, b, c] = [A, B, C].map((r) => r.data.data.reference);

  console.log('\n-- Viewing --');
  const found = await call(`/bookings?search=${a}`, { token });
  check('search by reference finds exactly that booking', found.status === 200 && found.data.total === 1 && found.data.data[0].reference === a);
  const pending = await call('/bookings?status=pending&search=Mgmt%20Test&limit=100', { token });
  check('status + search filters return the pending test bookings', pending.status === 200 && [a, b, c].every((r) => pending.data.data.some((x) => x.reference === r)));
  check('the list never exposes admin notes', !('adminNotes' in (found.data.data[0] ?? {})));
  const one = await call(`/bookings/${a}`, { token });
  check('details by reference include the customer and admin notes', one.status === 200 && one.data.data.email === 'mgmt-test@example.invalid' && 'adminNotes' in one.data.data);

  console.log('\n-- Status flow: pending > confirmed > completed --');
  check('pending cannot jump straight to completed → 400', (await patch(a, { status: 'completed' })).status === 400);
  const confirm = await patch(a, { status: 'confirmed' });
  check('confirm a pending booking → 200', confirm.status === 200 && confirm.data.data.status === 'confirmed', `got ${confirm.status}`);
  check('confirmed cannot go back to pending → 400', (await patch(a, { status: 'pending' })).status === 400);
  const done = await patch(a, { status: 'completed' });
  check('mark a confirmed booking completed → 200', done.status === 200 && done.data.data.status === 'completed', `got ${done.status}`);
  check('completed is final: cancel → 400', (await patch(a, { status: 'cancelled' })).status === 400);
  check('completed is final: reopen → 400', (await patch(a, { status: 'pending' })).status === 400);
  check('an unknown status → 400', (await patch(c, { status: 'archived' })).status === 400);

  console.log('\n-- Cancelling frees the slot, reopening needs it free --');
  check('cancel a pending booking → 200', (await patch(b, { status: 'cancelled' })).status === 200);
  const rebook = await book('09:00');
  check('the freed slot can be booked by someone else', rebook.status === 201, `got ${rebook.status}`);
  const taken = await patch(b, { status: 'pending' });
  check('reopening while someone else holds the slot → 409', taken.status === 409, `got ${taken.status}`);
  if (rebook.status === 201) await patch(rebook.data.data.reference, { status: 'cancelled' });
  check('reopening works again once the slot is free → 200', (await patch(b, { status: 'pending' })).status === 200);

  console.log('\n-- Notes and deleting --');
  const notes = await patch(c, { adminNotes: 'Called the customer, wants golden hour.' });
  check('admin notes can be saved', notes.status === 200);
  check('and read back from the details endpoint', (await call(`/bookings/${c}`, { token })).data?.data?.adminNotes === 'Called the customer, wants golden hour.');
  check('delete → 200', (await call(`/bookings/${c}`, { method: 'DELETE', token })).status === 200);
  check('a deleted booking is gone (404)', (await call(`/bookings/${c}`, { token })).status === 404);
  check('deleting it again → 404', (await call(`/bookings/${c}`, { method: 'DELETE', token })).status === 404);

  console.log('\n-- Everything above needs a token --');
  check('PATCH without a token → 401', (await call(`/bookings/${a}`, { method: 'PATCH', body: { status: 'cancelled' } })).status === 401);
  check('DELETE without a token → 401', (await call(`/bookings/${a}`, { method: 'DELETE' })).status === 401);
} catch (err) {
  if (err.message !== 'setup failed') console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  for (const ref of created) await call(`/bookings/${ref}`, { method: 'DELETE', token }).catch(() => {});
  console.log(`\nCleaned up ${created.length} temporary booking(s).`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
