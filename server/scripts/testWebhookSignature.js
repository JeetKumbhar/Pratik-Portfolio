/**
 * npm run test:webhook
 *
 * Sends SIGNED requests to the WhatsApp webhook of a RUNNING server and checks the answers:
 *   valid signature        → 200
 *   wrong secret           → 401
 *   missing signature      → 401
 *   body changed after signing → 401
 *   malformed header       → 401
 * and, when WHATSAPP_WEBHOOK_VERIFY_TOKEN is set, the Meta handshake (right token → 200 + challenge, wrong → 403).
 *
 * It uses WHATSAPP_APP_SECRET from your .env and never prints it. The "valid" request is a delivery report for a
 * message id that does not exist, so the server accepts it and changes nothing.
 *
 * Local:   start the server (npm run dev), then   npm run test:webhook
 * Render:  WEBHOOK_TEST_URL=https://your-service.onrender.com npm run test:webhook
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';

const base = (process.env.WEBHOOK_TEST_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
const url = `${base}/api/webhooks/whatsapp`;
const secret = process.env.WHATSAPP_APP_SECRET;
const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

if (!secret) {
  console.error('WHATSAPP_APP_SECRET is not set in server/.env, so valid signatures cannot be created.');
  process.exit(1);
}

const sign = (body, key = secret) => `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: '0',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        statuses: [{ id: 'wamid.TEST_NOT_A_REAL_MESSAGE', status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }],
      },
    }],
  }],
});

let failures = 0;
async function check(label, expected, request) {
  let got;
  try {
    got = (await request()).status;
  } catch (err) {
    console.log(`FAIL  ${label}: could not reach ${base} (${err.cause?.code || err.message})`);
    failures += 1;
    return;
  }
  const ok = got === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: expected ${expected}, got ${got}`);
}

const post = (headers, body = payload) => () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

console.log(`Testing ${url}\n`);
await check('valid signature', 200, post({ 'X-Hub-Signature-256': sign(payload) }));
await check('wrong secret', 401, post({ 'X-Hub-Signature-256': sign(payload, `${secret}-wrong`) }));
await check('missing signature header', 401, post({}));
await check('body changed after signing', 401, post({ 'X-Hub-Signature-256': sign(payload) }, payload.replace('delivered', 'read')));
await check('malformed signature header', 401, post({ 'X-Hub-Signature-256': 'sha256=not-hex' }));

if (verifyToken) {
  const handshake = (token) => () => fetch(`${url}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=12345`);
  await check('handshake with the right verify token', 200, handshake(verifyToken));
  await check('handshake with a wrong verify token', 403, handshake(`${verifyToken}-wrong`));
} else {
  console.log('SKIP  handshake checks (WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set)');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
