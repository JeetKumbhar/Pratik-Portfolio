/** node scripts/testClientUtils.mjs: tests src/utils/clientUtils.js (no browser, no server) */
import assert from 'node:assert/strict';
import { BOOKING_FILTERS, CLIENT_FILTERS, CLIENT_SORTS, conversationPath, dateTime, directionLabel, initials, oneOf, shortDate, sourceLabel, typeLabel } from '../src/utils/clientUtils.js';

let failed = 0;
const test = (name, fn) => { try { fn(); console.log(`PASS  ${name}`); } catch (e) { failed += 1; console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, 5).join('\n      ')}`); } };

test('initials: first and last word, a phone number is not a name', () => {
  assert.equal(initials('Priya Sharma'), 'PS');
  assert.equal(initials('priya'), 'P');
  assert.equal(initials('Anil Kumar Patil'), 'AP');
  assert.equal(initials('  Åsa  Öberg '), 'ÅÖ');
  assert.equal(initials('+91 98765 43210'), '#');
  assert.equal(initials(''), '#');
  assert.equal(initials(null), '#');
});
test('dates: empty or invalid input gives an empty string, never "Invalid Date"', () => {
  assert.equal(shortDate(null), '');
  assert.equal(shortDate('not a date'), '');
  assert.equal(dateTime(undefined), '');
  assert.match(shortDate('2026-11-05T10:00:00.000Z'), /2026/);
  assert.match(dateTime('2026-11-05T10:00:00.000Z'), /Nov/);
});
test('conversation link goes to the existing WhatsApp inbox and encodes the id', () => {
  assert.equal(conversationPath('64b7f0c2a1b2c3d4e5f60718'), '/admin/messages?source=whatsapp&chat=64b7f0c2a1b2c3d4e5f60718');
  assert.equal(conversationPath('a&b'), '/admin/messages?source=whatsapp&chat=a%26b');
});
test('URL parameters: only allowed values get through', () => {
  assert.equal(oneOf('repeat', CLIENT_FILTERS, 'all'), 'repeat');
  assert.equal(oneOf('<script>', CLIENT_FILTERS, 'all'), 'all');
  assert.equal(oneOf(null, CLIENT_SORTS, 'recent'), 'recent');
  assert.equal(oneOf('mostBookings', CLIENT_SORTS, 'recent'), 'mostBookings');
});
test('filter and sort values match what the API accepts', () => {
  assert.deepEqual(CLIENT_FILTERS.map((f) => f.value), ['all', 'new', 'repeat', 'upcoming']);
  assert.deepEqual(CLIENT_SORTS.map((f) => f.value), ['recent', 'oldest', 'lastBooking', 'mostBookings']);
  assert.deepEqual(BOOKING_FILTERS.map((f) => f.value), ['all', 'upcoming', 'completed', 'cancelled']);
});
test('labels', () => {
  assert.equal(typeLabel('repeat'), 'Repeat');
  assert.equal(typeLabel('new'), 'New');
  assert.equal(sourceLabel('whatsapp'), 'WhatsApp');
  assert.equal(sourceLabel('x'), 'Unknown');
  assert.equal(directionLabel('incoming'), 'Customer wrote');
  assert.equal(directionLabel('outgoing'), 'You replied');
  assert.equal(directionLabel(null), '');
});

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
