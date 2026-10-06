
/**
 * Proves the BACKEND (not the React screens) protects the admin API.
 *   1) npm run dev          (terminal 1)
 *   2) npm run test:auth    (terminal 2)
 * Uses ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET from .env. Creates nothing in the database.
 * Failed logins count towards the login limit (10 per 15 min): this script uses 4. A server restart resets it.
 * Other address:  BASE_URL=http://localhost:5001 npm run test:auth
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const { ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET } = process.env;

let failed = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `   (${detail})` : ''}`);
  if (!pass) failed += 1;
};

async function call(path, { method = 'GET', body, token, authorization } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authorization) headers.Authorization = authorization;
  else if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const FAKE_ID = '0'.repeat(24);

// ---------------------------------------------------------------- setup
try { await call('/health'); } catch { console.error(`Cannot reach ${BASE}. Start the server first (npm run dev).`); process.exit(1); }
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) { console.error('ADMIN_EMAIL, ADMIN_PASSWORD and JWT_SECRET must be set in .env'); process.exit(1); }

const d = new Date(); d.setMonth(d.getMonth() + 1);
const PROTECTED = [
  ['GET', '/auth/me'],
  ['GET', '/bookings'],
  ['GET', '/bookings/AM-AAAAAA'],
  ['PATCH', '/bookings/AM-AAAAAA', { status: 'confirmed' }],
  ['DELETE', '/bookings/AM-AAAAAA'],
  ['GET', `/availability/admin/calendar?year=${d.getFullYear()}&month=${d.getMonth() + 1}`],
];

/** Every protected endpoint must answer 401 to this credential */
async function allRefuse(label, creds, expected = 401) {
  const statuses = [];
  for (const [method, path, body] of PROTECTED) statuses.push((await call(path, { method, body, ...creds })).status);
  check(label, statuses.every((s) => s === expected), `got ${statuses.join(',')}`);
}

// ---------------------------------------------------------------- 1. things that must be refused
console.log('\n-- Protected endpoints refuse everything except a real admin token --');
await allRefuse('no token', {});
await allRefuse('wrong scheme ("Basic ...")', { authorization: 'Basic YWRtaW46YWRtaW4=' });
await allRefuse('garbage token', { token: 'abc.def.ghi' });
await allRefuse('valid format but signed with the WRONG secret', { token: jwt.sign({ id: FAKE_ID }, 'x'.repeat(48), { algorithm: 'HS256' }) });
await allRefuse('EXPIRED token (correct secret)', { token: jwt.sign({ id: FAKE_ID, exp: now() - 60 }, JWT_SECRET, { algorithm: 'HS256' }) });
await allRefuse('unsigned "alg: none" token', { token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: FAKE_ID, role: 'admin', exp: now() + 3600 })}.` });
await allRefuse('correctly signed token for a user that does not exist (role claim ignored)', { token: jwt.sign({ id: FAKE_ID, role: 'admin' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }) });

// ---------------------------------------------------------------- 2. login
console.log('\n-- Login --');
const wrong = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: 'definitely-not-the-password' } });
const unknown = await call('/auth/login', { method: 'POST', body: { email: 'nobody@example.invalid', password: 'whatever123' } });
check('wrong password → 401', wrong.status === 401, `got ${wrong.status}`);
check('unknown email → 401 with the SAME message (no account enumeration)', unknown.status === 401 && unknown.data?.message === wrong.data?.message);
const inject = await call('/auth/login', { method: 'POST', body: { email: { $ne: '' }, password: { $ne: '' } } });
check('MongoDB operators instead of strings → 400 (injection blocked)', inject.status === 400, `got ${inject.status}`);
const empty = await call('/auth/login', { method: 'POST', body: {} });
check('empty body → 400', empty.status === 400, `got ${empty.status}`);

const ok = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
check('correct details → 200 + token', ok.status === 200 && typeof ok.data?.token === 'string', `got ${ok.status}: ${ok.data?.message ?? ''}`);
check('login response never contains the password or its hash', !JSON.stringify(ok.data ?? {}).toLowerCase().includes('password'));
check('user role is admin', ok.data?.user?.role === 'admin');

// ---------------------------------------------------------------- 3. with a real admin token
console.log('\n-- A real admin token works --');
const token = ok.data?.token;
if (!token) {
  console.error('Cannot continue without a token. Check ADMIN_EMAIL / ADMIN_PASSWORD (the seeded admin) and the login limit.');
} else {
  const me = await call('/auth/me', { token });
  check('GET /auth/me → 200 and the right user', me.status === 200 && me.data?.user?.email === ADMIN_EMAIL.toLowerCase(), `got ${me.status}`);
  check('GET /bookings → 200', (await call('/bookings', { token })).status === 200);
  const cal = await call(PROTECTED[5][1], { token });
  check('GET /availability/admin/calendar → 200 with a day list', cal.status === 200 && Array.isArray(cal.data?.data) && cal.data.data.length >= 28);
  check('PATCH on a missing booking → 404 (auth passed, nothing to change)', (await call('/bookings/AM-AAAAAA', { method: 'PATCH', body: { status: 'confirmed' }, token })).status === 404);
}

// ---------------------------------------------------------------- 4. the public side stays public
console.log('\n-- Public endpoints stay open --');
check('GET /packages → 200 without a token', (await call('/packages')).status === 200);
const day = new Date(); day.setDate(day.getDate() + 30);
const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
const pubDay = await call(`/availability/${key}`);
check('GET /availability/:date → 200 without a token', pubDay.status === 200);
check('public availability never exposes reasons (editing / vacation / names)', !/editing|vacation|personal|offline|reference|name/i.test(JSON.stringify(pubDay.data ?? {})));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed: the backend refuses everyone but a verified admin.');
process.exit(failed ? 1 : 0);
