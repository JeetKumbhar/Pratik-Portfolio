/**
 * Tests the contact-message API against the RUNNING server.
 *   1) npm run dev                   (terminal 1)
 *   2) npm run test:messages         (terminal 2)
 * Sends TWO real-looking messages from "messages-test@example.invalid" (counts towards the public limit of 5 per hour),
 * reads/marks/deletes them, and cleans up. It does NOT touch your real messages (it never uses "mark all as read").
 * The "new message" alert emails are printed in the server terminal.
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

const MARK = `Test ${Date.now()}`;
const MSG = { name: MARK, email: 'messages-test@example.invalid', phone: '+1 123 456 7890', subject: 'wedding', message: 'Hello! I would like to ask about a wedding shoot next summer.' };
const ids = [];
const find = async (query) => ((await call(`/messages?${query}&limit=100`, { token })).data?.data ?? []);
const unread = async () => (await call('/messages/unread-count', { token })).data?.unread;

try {
  console.log('\n-- Sending a message (public, no token) --');
  const before = await unread();
  const sent = await call('/messages', { method: 'POST', body: MSG });
  check('a valid message → 201', sent.status === 201 && sent.data?.success === true, `got ${sent.status}: ${sent.data?.message ?? ''}`);
  check('nothing from the message is sent back (no email, phone or text)', !/messages-test|123 456|wedding shoot/.test(JSON.stringify(sent.data)));

  console.log('\n-- Bad messages are refused --');
  const refuse = async (label, patch) => check(label, (await call('/messages', { method: 'POST', body: { ...MSG, ...patch } })).status === 400);
  await refuse('no name → 400', { name: '' });
  await refuse('a bad email → 400', { email: 'nope' });
  await refuse('a bad phone → 400', { phone: '12' });
  await refuse('a message under 10 characters → 400', { message: 'hi' });
  await refuse('a message over 1000 characters → 400', { message: 'x'.repeat(1001) });
  await refuse('an unknown subject → 400', { subject: 'hello' });
  await refuse('text fields sent as objects instead of text → 400', { name: { $ne: '' }, message: { $gt: '' } });
  const sneaky = await call('/messages', { method: 'POST', body: { ...MSG, name: `${MARK} sneaky`, status: 'read' } });
  const sneakyStored = (await find(`search=${encodeURIComponent(`${MARK} sneaky`)}`))[0];
  check('a visitor cannot choose the status: it is always "new"', sneaky.status === 201 && sneakyStored?.status === 'new', `stored status: ${sneakyStored?.status}`);
  if (sneakyStored) ids.push(sneakyStored.id);

  const bot = await call('/messages', { method: 'POST', body: { ...MSG, name: `${MARK} bot`, website: 'http://spam.example' } });
  check('the hidden "website" trap looks successful to a bot…', bot.status === 201);
  check('…but nothing is stored', (await find(`search=${encodeURIComponent(`${MARK} bot`)}`)).length === 0);

  console.log('\n-- Only an admin can read or change messages --');
  for (const [label, path, method, body] of [
    ['list messages', '/messages', 'GET'],
    ['read the unread count', '/messages/unread-count', 'GET'],
    ['mark all as read', '/messages/mark-all-read', 'POST'],
    ['change a message', '/messages/000000000000000000000000', 'PATCH', { status: 'read' }],
    ['delete a message', '/messages/000000000000000000000000', 'DELETE'],
  ]) check(`${label} without a token → 401`, (await call(path, { method, body })).status === 401);

  console.log('\n-- Reading --');
  const mine = (await find(`search=${encodeURIComponent(MARK)}`)).find((m) => m.name === MARK);
  check('the message is in the admin list with its full text', mine?.message === MSG.message && mine.email === MSG.email && mine.subject === 'wedding');
  check('it starts as unread ("new")', mine?.status === 'new');
  if (mine) ids.push(mine.id);
  check('the unread count went up by one (plus the "sneaky" test message)', (await unread()) === before + 2, `before ${before}, now ${await unread()}`);
  const filtered = await call(`/messages?filter=unread&search=${encodeURIComponent(MARK)}`, { token });
  check('the "unread" filter finds it and the tab counts are included', filtered.data?.data?.some((m) => m.id === mine?.id) && typeof filtered.data?.counts?.unread === 'number' && filtered.data.counts.all >= filtered.data.counts.unread);
  check('a search by e-mail finds it', (await find('search=messages-test%40example.invalid')).some((m) => m.id === mine?.id));
  check('an unknown filter → 400', (await call('/messages?filter=spam', { token })).status === 400);

  console.log('\n-- Mark as read / unread --');
  const read = await call(`/messages/${mine.id}`, { method: 'PATCH', body: { status: 'read' }, token });
  check('mark as read → 200', read.status === 200 && read.data.data.status === 'read', `got ${read.status}`);
  check('the unread count dropped by one', (await unread()) === before + 1);
  check('it now appears under "read", not under "unread"', (await find(`filter=read&search=${encodeURIComponent(MARK)}`)).some((m) => m.id === mine.id) && !(await find(`filter=unread&search=${encodeURIComponent(MARK)}`)).some((m) => m.id === mine.id && m.name === MARK));
  check('mark as unread again → 200', (await call(`/messages/${mine.id}`, { method: 'PATCH', body: { status: 'new' }, token })).data?.data?.status === 'new');
  check('an unknown status → 400', (await call(`/messages/${mine.id}`, { method: 'PATCH', body: { status: 'maybe' }, token })).status === 400);
  check('the text of a message cannot be edited (nothing editable in that request → 400)', (await call(`/messages/${mine.id}`, { method: 'PATCH', body: { message: 'changed' }, token })).status === 400);

  console.log('\n-- Deleting --');
  const del = await call(`/messages/${mine.id}`, { method: 'DELETE', token });
  check('delete → 200', del.status === 200, `got ${del.status}`);
  check('it is gone', !(await find(`search=${encodeURIComponent(MARK)}`)).some((m) => m.id === mine.id));
  check('deleting it again → 404', (await call(`/messages/${mine.id}`, { method: 'DELETE', token })).status === 404);
  check('a malformed id → 404', (await call('/messages/not-an-id', { method: 'DELETE', token })).status === 404);
} catch (err) {
  console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  for (const id of ids) await call(`/messages/${id}`, { method: 'DELETE', token }).catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
