/**
 * Tests the WhatsApp notification system against the RUNNING server.
 *   1) npm run dev                      (terminal 1)
 *   2) npm run test:notifications       (terminal 2)
 *
 * It works with or without WhatsApp credentials:
 *   - NOT configured: it proves bookings and messages still work and nothing is sent.
 *   - configured: it also proves each event is logged once, duplicates are blocked, delivery reports move the status
 *     forward only, and STOP replies are honoured.
 * With real credentials it WILL send a few real WhatsApp messages to PHOTOGRAPHER_WHATSAPP_NUMBER (new booking x2, new message).
 * Customer messages go only to the reserved fictional number +1 555 010 0199, so no real person is messaged.
 * Creates 2 bookings + 1 message (counts towards the public limits) and removes everything it made.
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { Notification, WhatsAppOptOut } from '../models/index.js';
import { configStatus } from '../services/whatsappService.js';

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const { ADMIN_EMAIL, ADMIN_PASSWORD, WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN } = process.env;
const cfg = configStatus();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failed = 0;
const check = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${!pass && detail ? `   (${detail})` : ''}`);
  if (!pass) failed += 1;
};
const note = (text) => console.log(`      (${text})`);

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}
/** POSTs a webhook payload the way Meta does (raw JSON + signature). `secret` can be wrong on purpose. */
async function webhook(payload, { secret = WHATSAPP_APP_SECRET, sign = true } = {}) {
  const raw = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (sign) headers['X-Hub-Signature-256'] = `sha256=${createHmac('sha256', secret ?? 'x').update(raw).digest('hex')}`;
  const res = await fetch(`${BASE}/api/webhooks/whatsapp`, { method: 'POST', headers, body: raw });
  return res.status;
}
const statusPayload = (id, status) => ({ entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
const textPayload = (from, body) => ({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ from, type: 'text', text: { body } }] } }] }] });

try { await call('/health'); } catch { console.error(`Cannot reach ${BASE}. Start the server first (npm run dev).`); process.exit(1); }
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) { console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env'); process.exit(1); }
const login = await call('/auth/login', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
const token = login.data?.token;
if (!token) { console.error('Admin login failed. Check ADMIN_EMAIL / ADMIN_PASSWORD (the seeded admin).'); process.exit(1); }
await connectDB();

console.log(`\nWhatsApp is ${cfg.configured ? 'CONFIGURED: real messages will be sent to your number' : 'NOT configured: this checks that nothing breaks without it'}.`);

const d = new Date(); d.setDate(d.getDate() + 410);
const DAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const FAKE_CUSTOMER_PHONE = '+1 555 010 0199'; // reserved for fiction: WhatsApp cannot deliver to it, and no real person owns it
const bookingIds = []; const bookingRefs = []; let messageId = null; const refIds = [];
const booking = (time, optIn) => call('/bookings', { method: 'POST', body: { name: 'WA Test', email: 'wa-test@example.invalid', phone: FAKE_CUSTOMER_PHONE, shootType: 'portrait', location: 'studio', people: 1, packageId: 'essential', date: DAY, time, whatsappOptIn: optIn } });
const rows = async (refId) => Notification.find({ refId }).lean();
const rowFor = async (refId, event) => (await rows(refId)).filter((r) => r.event === event);
const patch = (ref, body) => call(`/bookings/${ref}`, { method: 'PATCH', body, token });

try {
  console.log('\n-- The webhook is locked down --');
  const hs = async (qs) => (await fetch(`${BASE}/api/webhooks/whatsapp?${qs}`)).status;
  check('handshake with a wrong verify token → 403', (await hs('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')) === 403);
  check('handshake with no token at all → 403', (await hs('hub.mode=subscribe&hub.challenge=1')) === 403);
  if (WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    const ok = await fetch(`${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(WHATSAPP_WEBHOOK_VERIFY_TOKEN)}&hub.challenge=424242`);
    check('handshake with the right token echoes the challenge', ok.status === 200 && (await ok.text()) === '424242');
  } else note('WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set: the correct-token handshake was not tested');
  check('an UNSIGNED delivery report is refused → 401 (or 503 when no app secret is configured)', [401, 503].includes(await webhook(statusPayload('wamid.x', 'delivered'), { sign: false })));
  check('a report signed with the WRONG secret is refused', [401, 503].includes(await webhook(statusPayload('wamid.x', 'delivered'), { secret: 'not-the-secret' })));

  console.log('\n-- Only an admin can see or retry notifications --');
  check('list notifications without a token → 401', (await call('/notifications')).status === 401);
  check('retry without a token → 401', (await call('/notifications/000000000000000000000000/retry', { method: 'POST' })).status === 401);
  const list = await call('/notifications', { token });
  check('the admin list works and reports whether WhatsApp is configured', list.status === 200 && typeof list.data?.config?.configured === 'boolean', `got ${list.status}`);
  check('the setup status says only WHICH settings are missing, never their values', list.status === 200 && JSON.stringify(list.data.config).indexOf(process.env.WHATSAPP_ACCESS_TOKEN || '\u0000') === -1);
  check('an unknown status filter → 400', (await call('/notifications?status=bogus', { token })).status === 400);
  check(`retrying a notification that does not exist → ${cfg.configured ? '404' : '503 (WhatsApp not configured)'}`, (await call('/notifications/000000000000000000000000/retry', { method: 'POST', token })).status === (cfg.configured ? 404 : 503));

  console.log('\n-- A booking always succeeds, WhatsApp or not --');
  const A = await booking('10:00', true);
  const B = await booking('12:00', false);
  check('booking WITH WhatsApp opt-in → 201', A.status === 201, `got ${A.status}: ${A.data?.message ?? ''}`);
  check('booking WITHOUT opt-in → 201', B.status === 201, `got ${B.status}: ${B.data?.message ?? ''}`);
  if (A.status !== 201 || B.status !== 201) throw new Error('setup: could not create the test bookings');
  const [idA, idB] = [A.data.data.id, B.data.data.id];
  const [refA, refB] = [A.data.data.reference, B.data.data.reference];
  bookingIds.push(idA, idB); bookingRefs.push(refA, refB); refIds.push(idA, idB);
  const storedA = (await call(`/bookings/${refA}`, { token })).data?.data;
  const storedB = (await call(`/bookings/${refB}`, { token })).data?.data;
  check('the opt-in is saved with the booking (and the date it was given)', storedA?.whatsappOptIn === true && Boolean(storedA.whatsappOptInAt) && storedB?.whatsappOptIn === false);
  check('opt-in cannot be changed from the admin screen (the edit is ignored)', (await patch(refB, { whatsappOptIn: true })).status === 400);
  await sleep(2500);

  if (cfg.configured) {
    console.log('\n-- Booking notifications (WhatsApp configured) --');
    const adminRowA = await rowFor(idA, 'new_booking_admin');
    const customerRowA = await rowFor(idA, 'booking_received_customer');
    if (cfg.photographerNumberSet) check('the photographer is notified once', adminRowA.length === 1 && ['sent', 'failed'].includes(adminRowA[0].status), JSON.stringify(adminRowA.map((r) => r.status)));
    else note('PHOTOGRAPHER_WHATSAPP_NUMBER is not set: the photographer notification was skipped');
    check('the opted-in customer gets an acknowledgement attempt, logged once', customerRowA.length === 1 && ['sent', 'failed'].includes(customerRowA[0].status));
    check('a customer who did NOT opt in gets nothing', (await rowFor(idB, 'booking_received_customer')).length === 0);
    check('the log never stores the customer phone number or message text', !JSON.stringify(await rows(idA)).match(/555 ?010 ?0199|5550100199/));
    check('"sent" is the most it can be at this point (only a webhook can say "delivered")', (await rows(idA)).every((r) => ['sent', 'failed', 'skipped'].includes(r.status)));

    console.log('\n-- Confirming, cancelling, and not sending twice --');
    await patch(refA, { status: 'confirmed' }); await sleep(1500);
    check('confirming sends ONE confirmation', (await rowFor(idA, 'booking_confirmed_customer')).length === 1);
    await patch(refA, { status: 'confirmed' }); await sleep(800);
    check('saving the same status again sends nothing new', (await rowFor(idA, 'booking_confirmed_customer')).length === 1);
    await patch(refA, { status: 'cancelled' }); await sleep(1500);
    check('cancelling sends ONE cancellation', (await rowFor(idA, 'booking_cancelled_customer')).length === 1);
    await patch(refA, { status: 'pending' }); await patch(refA, { status: 'confirmed' }); await sleep(1500);
    check('re-confirming after a reopen does NOT send a second confirmation (duplicate blocked)', (await rowFor(idA, 'booking_confirmed_customer')).length === 1);
    await patch(refB, { status: 'confirmed' }); await sleep(1200);
    check('confirming a booking whose customer did not opt in sends no customer message', (await rowFor(idB, 'booking_confirmed_customer')).length === 0);

    console.log('\n-- Retrying --');
    const failedRows = (await rows(idA)).filter((r) => r.status === 'failed');
    if (failedRows.length) {
      const again = await call(`/notifications/${failedRows[0]._id}/retry`, { method: 'POST', token });
      check('retrying a failed notification → 200 and the attempt is counted', again.status === 200 && again.data?.data?.attempts === failedRows[0].attempts + 1, `got ${again.status}`);
    } else note('nothing failed, so there was nothing to retry (the retry logic is covered by the offline tests)');
    const okRow = (await rows(idA)).find((r) => r.status === 'sent');
    if (okRow) check('a notification that was sent cannot be "retried" → 409', (await call(`/notifications/${okRow._id}/retry`, { method: 'POST', token })).status === 409);

    if (WHATSAPP_APP_SECRET) {
      console.log('\n-- Delivery reports from WhatsApp --');
      const sentRow = (await rows(idA)).find((r) => r.waMessageId);
      if (sentRow) {
        const id = sentRow.waMessageId;
        const statusNow = async () => (await Notification.findById(sentRow._id).lean()).status;
        check('a signed "delivered" report is accepted', (await webhook(statusPayload(id, 'delivered'))) === 200 && (await statusNow()) === 'delivered');
        await webhook(statusPayload(id, 'sent'));
        check('a late "sent" report does not move it backwards', (await statusNow()) === 'delivered');
        await webhook(statusPayload(id, 'read'));
        check('"read" moves it forward', (await statusNow()) === 'read');
        await webhook(statusPayload(id, 'failed'));
        check('a late "failed" does not overwrite "read"', (await statusNow()) === 'read');
      } else note('no message was accepted by WhatsApp (see the "failed" reasons in Admin > Notifications), so delivery reports could not be simulated');
    }
  } else {
    console.log('\n-- WhatsApp is not configured: nothing is sent and nothing breaks --');
    check('no notification rows were created for the bookings', (await rows(idA)).length === 0 && (await rows(idB)).length === 0);
    await patch(refA, { status: 'confirmed' }); await sleep(800);
    check('confirming a booking works and creates no rows', (await rows(idA)).length === 0);
  }

  console.log('\n-- Contact message --');
  const sent = await call('/messages', { method: 'POST', body: { name: 'WA Test Sender', email: 'wa-test@example.invalid', subject: 'general', message: 'This is an automated WhatsApp notification test.' } });
  check('a contact message is saved and answered 201', sent.status === 201, `got ${sent.status}`);
  const stored = ((await call('/messages?search=WA%20Test%20Sender&limit=5', { token })).data?.data ?? [])[0];
  if (stored) { messageId = stored.id; refIds.push(stored.id); }
  check('the message is stored', Boolean(stored));
  await sleep(2000);
  if (cfg.configured && cfg.photographerNumberSet && stored) {
    const mrows = await rowFor(stored.id, 'new_message_admin');
    check('the photographer is notified once about the message', mrows.length === 1 && ['sent', 'failed'].includes(mrows[0].status));
  } else if (stored) check('no notification rows without WhatsApp + your number', (await rows(stored.id)).length === 0);

  if (WHATSAPP_APP_SECRET) {
    console.log('\n-- STOP and START replies --');
    const phone = '15550100777';
    await WhatsAppOptOut.deleteOne({ phone });
    check('a signed "STOP" reply is accepted', (await webhook(textPayload(phone, 'STOP'))) === 200);
    check('...and the number is now on the opt-out list', Boolean(await WhatsAppOptOut.exists({ phone })));
    await webhook(textPayload(phone, 'please stop by on friday'));
    check('an ordinary sentence containing "stop" changes nothing', Boolean(await WhatsAppOptOut.exists({ phone })));
    check('a signed "START" reply removes it again', (await webhook(textPayload(phone, 'START'))) === 200 && !(await WhatsAppOptOut.exists({ phone })));
  } else note('WHATSAPP_APP_SECRET is not set: the STOP/START and delivery-report tests were skipped');
} catch (err) {
  console.error('\nTest crashed:', err.message);
  failed += 1;
} finally {
  for (const ref of bookingRefs) await call(`/bookings/${ref}`, { method: 'DELETE', token }).catch(() => {});
  if (messageId) await call(`/messages/${messageId}`, { method: 'DELETE', token }).catch(() => {});
  if (refIds.length) await Notification.deleteMany({ refId: { $in: refIds.map((id) => new mongoose.Types.ObjectId(id)) } }).catch(() => {});
  await WhatsAppOptOut.deleteOne({ phone: '15550100777' }).catch(() => {});
  await mongoose.connection.close().catch(() => {});
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
