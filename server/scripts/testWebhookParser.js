/**
 * npm run test:webhook-parser
 *
 * Tests utils/whatsappWebhook.js on its own: no database, no server, no network, no .env needed.
 * Covers incoming customer messages (Phase 1) AND that delivery reports and STOP / START still work.
 */
import assert from 'node:assert/strict';
import { parseWebhook, applyStatus } from '../utils/whatsappWebhook.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); } catch (err) { failed += 1; console.log(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 6).join('\n      ')}`); }
}

/** A webhook body shaped like the ones Meta sends */
const hook = (value) => ({ object: 'whatsapp_business_account', entry: [{ id: '0', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] });
const textMsg = (over = {}) => ({ from: '919876543210', id: 'wamid.AAA', timestamp: '1793000000', type: 'text', text: { body: 'Hello Pratik' }, ...over });
const contact = (name = 'Sarah Jones', wa_id = '919876543210') => ({ profile: { name }, wa_id });

console.log('--- incoming customer messages ---');

test('text message: phone, name, message id, timestamp, type and text are all extracted', () => {
  const { incoming } = parseWebhook(hook({ contacts: [contact()], messages: [textMsg()] }));
  assert.equal(incoming.length, 1);
  assert.deepEqual(incoming[0], { id: 'wamid.AAA', from: '919876543210', name: 'Sarah Jones', contactId: '919876543210', type: 'text', text: 'Hello Pratik', at: new Date(1793000000 * 1000) });
});

test('contactId is WhatsApp\'s wa_id of the matched contact, and null when there is no matching contact', () => {
  assert.equal(parseWebhook(hook({ contacts: [contact()], messages: [textMsg()] })).incoming[0].contactId, '919876543210');
  assert.equal(parseWebhook(hook({ messages: [textMsg()] })).incoming[0].contactId, null);
  assert.equal(parseWebhook(hook({ contacts: [contact('Someone Else', '911111111111')], messages: [textMsg()] })).incoming[0].contactId, null);
});

test('emoji, non-English text and line breaks are kept exactly', () => {
  const body = 'नमस्कार 🙏\nफोटोग्राफी बुक करायची आहे\n\n📸';
  assert.equal(parseWebhook(hook({ messages: [textMsg({ text: { body } })] })).incoming[0].text, body);
});

test('sender name is null when WhatsApp sends no contacts', () => {
  assert.equal(parseWebhook(hook({ messages: [textMsg()] })).incoming[0].name, null);
});

test('sender name is matched by number, not taken from the wrong contact', () => {
  const { incoming } = parseWebhook(hook({ contacts: [contact('Someone Else', '911111111111'), contact('Sarah Jones')], messages: [textMsg()] }));
  assert.equal(incoming[0].name, 'Sarah Jones');
  assert.equal(parseWebhook(hook({ contacts: [contact('Someone Else', '911111111111')], messages: [textMsg()] })).incoming[0].name, null);
});

test('sender name is cleaned: control characters removed, length capped', () => {
  assert.equal(parseWebhook(hook({ contacts: [contact('  Sarah\n\tJones  ')], messages: [textMsg()] })).incoming[0].name, 'Sarah Jones');
  assert.equal(parseWebhook(hook({ contacts: [contact('x'.repeat(500))], messages: [textMsg()] })).incoming[0].name.length, 100);
});

test('non-text message (image): type is reported, text is null', () => {
  const { incoming } = parseWebhook(hook({ messages: [{ from: '919876543210', id: 'wamid.IMG', timestamp: '1793000001', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } }] }));
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].type, 'image');
  assert.equal(incoming[0].text, null);
});

test('several messages in one webhook call, in order', () => {
  const { incoming } = parseWebhook(hook({ messages: [textMsg({ id: 'wamid.1', text: { body: 'one' } }), textMsg({ id: 'wamid.2', text: { body: 'two' } })] }));
  assert.deepEqual(incoming.map((m) => [m.id, m.text]), [['wamid.1', 'one'], ['wamid.2', 'two']]);
});

test('messages from several entries and changes are all collected', () => {
  const a = hook({ messages: [textMsg({ id: 'wamid.1' })] });
  const b = hook({ messages: [textMsg({ id: 'wamid.2', from: '14155550123' })] });
  assert.deepEqual(parseWebhook({ entry: [...a.entry, ...b.entry] }).incoming.map((m) => m.id), ['wamid.1', 'wamid.2']);
});

test('the sender number is reduced to digits (a leading + or spaces do not matter)', () => {
  assert.equal(parseWebhook(hook({ messages: [textMsg({ from: '+91 98765 43210' })] })).incoming[0].from, '919876543210');
});

test('timestamp: missing or garbage → null, never an invalid Date', () => {
  for (const timestamp of [undefined, '', 'abc', '0', '-5']) {
    const [m] = parseWebhook(hook({ messages: [textMsg({ timestamp })] })).incoming;
    assert.equal(m.at, null, `timestamp ${JSON.stringify(timestamp)}`);
  }
});

test('text longer than WhatsApp allows is capped at 4096 characters', () => {
  assert.equal(parseWebhook(hook({ messages: [textMsg({ text: { body: 'a'.repeat(9000) } })] })).incoming[0].text.length, 4096);
});

test('untrustworthy messages are skipped: no id, bad number, no type, wrong shapes', () => {
  const bad = [
    textMsg({ id: undefined }), textMsg({ id: '' }), textMsg({ id: 42 }),
    textMsg({ from: 'abc' }), textMsg({ from: '123' }), textMsg({ from: '0123456789012' }), textMsg({ from: undefined }), textMsg({ from: 919876543210 }),
    textMsg({ type: undefined }), null, 'string', 42, [],
  ];
  assert.deepEqual(parseWebhook(hook({ messages: bad })).incoming, []);
});

test('a text message with no body gives text null instead of crashing', () => {
  assert.equal(parseWebhook(hook({ messages: [textMsg({ text: undefined })] })).incoming[0].text, null);
  assert.equal(parseWebhook(hook({ messages: [textMsg({ text: { body: 123 } })] })).incoming[0].text, null);
});

test('garbage payloads never throw and give empty lists', () => {
  for (const p of [undefined, null, {}, [], 'x', 5, { entry: 'x' }, { entry: [null] }, { entry: [{ changes: 'x' }] }, { entry: [{ changes: [null] }] }, hook({ messages: 'x' }), hook({ contacts: 'x', messages: [textMsg()] })]) {
    const out = parseWebhook(p);
    assert.ok(Array.isArray(out.statuses) && Array.isArray(out.optOuts) && Array.isArray(out.optIns) && Array.isArray(out.incoming));
  }
});

test('changes for other fields (not "messages") are ignored', () => {
  const p = hook({ messages: [textMsg()] });
  p.entry[0].changes[0].field = 'message_template_status_update';
  assert.deepEqual(parseWebhook(p).incoming, []);
});

console.log('\n--- STOP / START still work ---');

test('STOP: recorded as an opt-out, and ALSO listed as an incoming message', () => {
  const out = parseWebhook(hook({ messages: [textMsg({ text: { body: 'STOP' } })] }));
  assert.deepEqual(out.optOuts, ['919876543210']);
  assert.deepEqual(out.optIns, []);
  assert.equal(out.incoming[0].text, 'STOP');
});

test('every STOP word and START word is recognised (case, spaces and trailing . ! ignored)', () => {
  for (const w of ['stop', 'STOP', ' Stop. ', 'stop all', 'Unsubscribe', 'opt out', 'optout']) assert.deepEqual(parseWebhook(hook({ messages: [textMsg({ text: { body: w } })] })).optOuts, ['919876543210'], w);
  for (const w of ['start', 'START!', 'Subscribe', 'opt in', 'optin', 'unstop']) assert.deepEqual(parseWebhook(hook({ messages: [textMsg({ text: { body: w } })] })).optIns, ['919876543210'], w);
});

test('ordinary sentences containing "stop" or "start" are NOT opt-outs', () => {
  for (const w of ['please stop calling me', 'when can we start?', 'stopping by tomorrow', 'Hello']) {
    const out = parseWebhook(hook({ messages: [textMsg({ text: { body: w } })] }));
    assert.deepEqual([out.optOuts, out.optIns], [[], []], w);
    assert.equal(out.incoming.length, 1, w);
  }
});

test('an image is never treated as STOP/START', () => {
  const out = parseWebhook(hook({ messages: [{ from: '919876543210', id: 'wamid.I', type: 'image', text: { body: 'STOP' } }] }));
  assert.deepEqual([out.optOuts, out.optIns], [[], []]);
});

console.log('\n--- delivery reports still work ---');

test('delivered / read / failed reports are parsed, and produce NO incoming messages', () => {
  const out = parseWebhook(hook({ statuses: [
    { id: 'wamid.S1', status: 'delivered', timestamp: '1793000010' },
    { id: 'wamid.S2', status: 'read', timestamp: '1793000020' },
    { id: 'wamid.S3', status: 'failed', timestamp: '1793000030', errors: [{ code: 131026, title: 'Message undeliverable' }] },
  ] }));
  assert.deepEqual(out.statuses, [
    { id: 'wamid.S1', status: 'delivered', at: new Date(1793000010 * 1000), error: '' },
    { id: 'wamid.S2', status: 'read', at: new Date(1793000020 * 1000), error: '' },
    { id: 'wamid.S3', status: 'failed', at: new Date(1793000030 * 1000), error: 'Message undeliverable' },
  ]);
  assert.deepEqual(out.incoming, []);
});

test('a status report and a customer message in the same call are both handled', () => {
  const out = parseWebhook(hook({ statuses: [{ id: 'wamid.S1', status: 'read', timestamp: '1793000020' }], contacts: [contact()], messages: [textMsg()] }));
  assert.equal(out.statuses.length, 1);
  assert.equal(out.incoming.length, 1);
});

test('applyStatus: only moves forward; a late failure never beats a delivery; delivery beats an earlier failure', () => {
  assert.equal(applyStatus('sent', 'delivered'), 'delivered');
  assert.equal(applyStatus('delivered', 'read'), 'read');
  assert.equal(applyStatus('read', 'delivered'), null);
  assert.equal(applyStatus('delivered', 'failed'), null);
  assert.equal(applyStatus('sent', 'failed'), 'failed');
  assert.equal(applyStatus('failed', 'delivered'), 'delivered');
  assert.equal(applyStatus('failed', 'read'), 'read');
});

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
