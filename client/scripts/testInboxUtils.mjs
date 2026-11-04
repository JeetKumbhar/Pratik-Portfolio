/** node scripts/testInboxUtils.mjs: tests src/utils/whatsappInbox.js (no browser, no server) */
import assert from 'node:assert/strict';
import { charCount, dayKey, dayLabel, displayName, formatPhone, groupByDay, isValidRequestId, listTime, newRequestId, typeLabel, windowLeft } from '../src/utils/whatsappInbox.js';

let failed = 0;
const test = (name, fn) => { try { fn(); console.log(`PASS  ${name}`); } catch (e) { failed += 1; console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, 5).join('\n      ')}`); } };
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString(); // local time, so the tests do not depend on the machine's time zone
const NOW = new Date(2026, 10, 4, 15, 0);

test('names: profile name first, then +number', () => {
  assert.equal(displayName({ name: 'Priya Patil', phone: '919876543210' }), 'Priya Patil');
  assert.equal(displayName({ name: '', phone: '919876543210' }), '+919876543210');
  assert.equal(displayName(null), 'Unknown');
  assert.equal(formatPhone('919876543210'), '+919876543210');
});
test('day labels: Today, Yesterday, then a date', () => {
  assert.equal(dayLabel(at(2026, 11, 4, 9), NOW), 'Today');
  assert.equal(dayLabel(at(2026, 11, 3, 23, 59), NOW), 'Yesterday');
  assert.match(dayLabel(at(2026, 10, 30), NOW), /30 Oct 2026/);
  assert.equal(dayKey(at(2026, 1, 5)), '2026-01-05');
});
test('list time: a clock time today, "Yesterday", else a short date; empty when unknown', () => {
  assert.match(listTime(at(2026, 11, 4, 9, 5), NOW), /9:05/);
  assert.equal(listTime(at(2026, 11, 3), NOW), 'Yesterday');
  assert.match(listTime(at(2026, 10, 30), NOW), /30 Oct/);
  assert.equal(listTime(null, NOW), '');
});
test('messages are grouped by calendar day, in order', () => {
  const g = groupByDay([{ id: 1, waTimestamp: at(2026, 11, 3, 23, 0) }, { id: 2, waTimestamp: at(2026, 11, 4, 8, 0) }, { id: 3, waTimestamp: at(2026, 11, 4, 9, 0) }], NOW);
  assert.deepEqual(g.map((x) => [x.label, x.messages.map((m) => m.id)]), [['Yesterday', [1]], ['Today', [2, 3]]]);
  assert.deepEqual(groupByDay([], NOW), []);
});
test('reply window countdown: hours and minutes, honours the 1-minute safety, empty when closed', () => {
  const expires = (minutesFromNow) => new Date(+NOW + minutesFromNow * 60000).toISOString();
  assert.equal(windowLeft(expires(5 * 60 + 21), NOW), '5 h 20 min left');
  assert.equal(windowLeft(expires(43), NOW), '42 min left');
  assert.equal(windowLeft(expires(1.5), NOW), '');
  assert.equal(windowLeft(expires(-10), NOW), '');
  assert.equal(windowLeft(null, NOW), '');
});
test('request ids are always acceptable to the server (8-64 letters, digits, - _)', () => {
  for (let i = 0; i < 50; i += 1) assert.ok(isValidRequestId(newRequestId()));
  const original = globalThis.crypto; Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try { for (let i = 0; i < 50; i += 1) assert.ok(isValidRequestId(newRequestId()), 'fallback id'); } finally { Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true }); }
  assert.notEqual(newRequestId(), newRequestId());
  assert.equal(isValidRequestId('short'), false);
  assert.equal(isValidRequestId('has spaces in it!'), false);
});
test('character count counts emoji and Devanagari as one each, like the server', () => {
  assert.equal(charCount('🙏'.repeat(3)), 3);
  assert.equal(charCount('नमस्कार'), 7);
  assert.equal(charCount('👨‍👩‍👧'), 5); // a family emoji is 5 code points, and the server counts code points too
});
test('media labels', () => {
  assert.equal(typeLabel('image'), 'Photo');
  assert.equal(typeLabel('whatever'), 'Unsupported message');
});
console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
