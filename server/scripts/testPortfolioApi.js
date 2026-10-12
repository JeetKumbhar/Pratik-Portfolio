/**
 * Tests the portfolio-management API against the RUNNING server.
 *   1) npm run dev                   (terminal 1)
 *   2) npm run test:portfolio        (terminal 2)
 * Adds ONE temporary photo (a pasted path, so nothing is uploaded or billed), edits it, deletes it. Works with or without Cloudinary keys.
 * The real upload (browser → Cloudinary) can only be tested in the admin screen: see the steps in the guide.
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

const PHOTO = { title: 'API test photo', category: 'wedding', description: 'temporary', image: { url: '/images/portfolio/gallery/wedding-01.jpg' } };
let id = null;

try {
  console.log('\n-- The public gallery --');
  const pub = await call('/portfolio');
  check('GET /portfolio works without a token and returns a list', pub.status === 200 && Array.isArray(pub.data?.data), `got ${pub.status}`);
  check('an invalid category filter → 400', (await call('/portfolio?category=astronomy')).status === 400);

  console.log('\n-- Only an admin can manage photos --');
  for (const [label, path, method, body] of [
    ['list all photos', '/portfolio/admin', 'GET'],
    ['get an upload signature', '/portfolio/upload-signature', 'GET'],
    ['add a photo', '/portfolio', 'POST', PHOTO],
    ['edit a photo', '/portfolio/000000000000000000000000', 'PATCH', { title: 'x' }],
    ['delete a photo', '/portfolio/000000000000000000000000', 'DELETE'],
  ]) {
    check(`${label} without a token → 401`, (await call(path, { method, body })).status === 401);
  }

  console.log('\n-- Upload permission (Cloudinary) --');
  const sig = await call('/portfolio/upload-signature', { token });
  if (sig.status === 200) {
    const d = sig.data.data;
    check('signature has cloud name, api key, folder, a 40-char signature', Boolean(d.cloudName && d.apiKey && d.folder) && /^[a-f0-9]{40}$/.test(d.signature));
    check('the API secret is never sent to the browser', !JSON.stringify(sig.data).includes(process.env.CLOUDINARY_API_SECRET ?? '\u0000'));
    check('only jpg / jpeg / png / webp are allowed', d.allowedFormats === 'jpg,jpeg,png,webp');
  } else {
    check('Cloudinary not configured → a clear 503 (add the keys to enable uploads)', sig.status === 503 && /Cloudinary/.test(sig.data?.message ?? ''), `got ${sig.status}`);
    console.log('      (that is fine for this test: photos can still be added by pasting a URL)');
  }

  console.log('\n-- Adding a photo --');
  const refuse = async (label, body) => check(label, (await call('/portfolio', { method: 'POST', body, token })).status === 400);
  await refuse('no title → 400', { ...PHOTO, title: '' });
  await refuse('an unknown category → 400', { ...PHOTO, category: 'astronomy' });
  await refuse('no image → 400', { title: 'x', category: 'wedding' });
  await refuse('a javascript: image URL → 400', { ...PHOTO, image: { url: 'javascript:alert(1)' } });
  await refuse('a protocol-relative image URL → 400', { ...PHOTO, image: { url: '//evil.example/a.jpg' } });
  await refuse('an "uploaded" image that is not from our storage → 400', { ...PHOTO, image: { url: 'https://res.cloudinary.com/someone-else/image/upload/v1/x/y.jpg', publicId: 'x/y' } });

  const created = await call('/portfolio', { method: 'POST', body: PHOTO, token });
  check('a valid photo → 201', created.status === 201 && Boolean(created.data?.data?.id), `got ${created.status}: ${created.data?.message ?? ''}`);
  id = created.data?.data?.id;
  const made = created.data?.data ?? {};
  check('it is published by default, with src, ratio and alt filled in', made.isPublished === true && made.src === PHOTO.image.url && made.ratio === 1 && made.alt === 'API test photo');
  check('the storage id is never exposed', !('publicId' in (made.image ?? {})));

  const listed = async (query = '') => ((await call(`/portfolio${query}`)).data?.data ?? []).some((p) => p.id === id);
  check('it shows in the public gallery', await listed());
  check('and in the admin list', ((await call('/portfolio/admin', { token })).data?.data ?? []).some((p) => p.id === id));

  console.log('\n-- Editing --');
  const renamed = await call(`/portfolio/${id}`, { method: 'PATCH', body: { title: 'Renamed photo' }, token });
  check('change the title → 200', renamed.status === 200 && renamed.data.data.title === 'Renamed photo');
  check('the alt text follows the title', renamed.data.data.alt === 'Renamed photo');
  const moved = await call(`/portfolio/${id}`, { method: 'PATCH', body: { category: 'portrait' }, token });
  check('change the category → 200', moved.status === 200 && moved.data.data.category === 'portrait');
  check('it now appears under Portrait and no longer under Wedding', (await listed('?category=portrait')) && !(await listed('?category=wedding')));
  check('an unknown category → 400', (await call(`/portfolio/${id}`, { method: 'PATCH', body: { category: 'astronomy' }, token })).status === 400);
  check('an empty edit → 400', (await call(`/portfolio/${id}`, { method: 'PATCH', body: {}, token })).status === 400);
  check('the image itself cannot be swapped (nothing editable in that request → 400)', (await call(`/portfolio/${id}`, { method: 'PATCH', body: { image: { url: '/x.jpg' } }, token })).status === 400);
  await call(`/portfolio/${id}`, { method: 'PATCH', body: { isPublished: false }, token });
  check('a draft disappears from the public gallery…', !(await listed()));
  check('…but stays in the admin list', ((await call('/portfolio/admin', { token })).data?.data ?? []).some((p) => p.id === id && p.isPublished === false));

  console.log('\n-- Deleting --');
  const del = await call(`/portfolio/${id}`, { method: 'DELETE', token });
  check('delete → 200 (nothing was stored, so storageDeleted is null)', del.status === 200 && del.data.storageDeleted === null, `got ${del.status}: ${JSON.stringify(del.data)}`);
  check('it is gone from the admin list', !((await call('/portfolio/admin', { token })).data?.data ?? []).some((p) => p.id === id));
  check('deleting it again → 404', (await call(`/portfolio/${id}`, { method: 'DELETE', token })).status === 404);
  check('a malformed id → 404', (await call('/portfolio/not-an-id', { method: 'DELETE', token })).status === 404);
  id = null;
} catch (err) {
  console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  if (id) await call(`/portfolio/${id}`, { method: 'DELETE', token }).catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
