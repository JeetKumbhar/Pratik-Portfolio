/**
 * npm run test:client-logic
 *
 * The pure parts of the Clients section: phone-number normalization, form/note validation, the month boundary,
 * the list pipeline's shape and the backfill planner. No database, no network, nothing to set up.
 */
import assert from 'node:assert/strict';
import { formatPhoneDisplay, nationalKey, normalizeClientPhone, normalizeWhatsAppPhone, toNormalizedPhone } from '../utils/phone.js';
import { parseClientInput, parseNoteInput } from '../utils/clientInput.js';
import { buildListPipeline, publicSummary, searchCondition, startOfMonth } from '../utils/clientQueries.js';
import { clientFromGroup, planBackfill } from '../utils/clientBackfill.js';

let failed = 0;
let count = 0;
function test(name, fn) {
  count += 1;
  try { fn(); console.log(`PASS  ${name}`); } catch (err) { failed += 1; console.log(`FAIL  ${name}\n      ${String(err.message).split('\n').slice(0, 8).join('\n      ')}`); }
}
const throwsFields = (fn, fields) => {
  try { fn(); } catch (err) {
    assert.equal(err.status ?? err.statusCode, 400);
    assert.deepEqual(Object.keys(err.fieldErrors).sort(), [...fields].sort());
    return;
  }
  assert.fail('expected a 400');
};

console.log('\n--- phone numbers ---');
const KEY = '919876543210';
test('every common way of writing the same Indian number gives one key', () => {
  for (const v of ['+91 98765 43210', '+91-98765-43210', '98765 43210', '9876543210', '09876543210', '09876 543 210', '919876543210', '0091 98765 43210', '+91 (98765) 43210', '+919876543210', ' 98765.43210 ', 919876543210]) {
    assert.equal(toNormalizedPhone(v, { countryCode: '91' }), KEY, `input: ${v}`);
  }
});
test('the country is only flagged as assumed when WE added it', () => {
  assert.deepEqual(normalizeClientPhone('98765 43210', { countryCode: '91' }), { phone: KEY, assumedCountry: true });
  assert.deepEqual(normalizeClientPhone('+91 98765 43210', { countryCode: '91' }), { phone: KEY, assumedCountry: false });
  assert.deepEqual(normalizeClientPhone('919876543210', { countryCode: '91' }), { phone: KEY, assumedCountry: false });
});
test('other countries keep their own code and are never given the default one', () => {
  assert.equal(toNormalizedPhone('+1 (123) 456-7890', { countryCode: '91' }), '11234567890');
  assert.equal(toNormalizedPhone('+44 7911 123456', { countryCode: '91' }), '447911123456');
  assert.equal(toNormalizedPhone('0044 7911 123456', { countryCode: '91' }), '447911123456');
});
test('the default country code is configurable', () => {
  assert.equal(toNormalizedPhone('7911 123456', { countryCode: '44' }), '447911123456');
});
test('numbers that cannot be trusted are refused (null), never guessed', () => {
  for (const v of ['', '   ', 'abc', '98765', '1234567', '12345678', '+91', '+0 123', '+91 98765 4321O', '12-34', null, undefined, {}, [], '++91 98765 43210', '+91 98765 43210 ext 5', '98765 43210 98765 43210']) {
    assert.equal(normalizeClientPhone(v, { countryCode: '91' }), null, `input: ${JSON.stringify(v)}`);
  }
});
test('a number with a "+" can be short (a valid 8 digit international number) but not shorter than E.164 allows', () => {
  assert.equal(toNormalizedPhone('+65 8123 4567'), '6581234567');
  assert.equal(toNormalizedPhone('+1234567'), null);
});
test('a trunk 0 after our own country code is dropped, and a mistyped 91 number is refused', () => {
  assert.equal(toNormalizedPhone('+91 098765 43210'), '919876543210');
  assert.equal(toNormalizedPhone('+91 (0) 98765 43210'), '919876543210');
  assert.equal(toNormalizedPhone('+91 123456'), null);
  assert.equal(toNormalizedPhone('9198765432100'), null); // 13 digits starting with 91
  assert.equal(toNormalizedPhone('+1 (123) 456-7890'), '11234567890'); // other countries unaffected
});
test('a name search containing digits does not also search phone numbers', () => {
  assert.equal(searchCondition('Studio 123').$or.length, 3);
  assert.equal(searchCondition('98765 432').$or.length, 4);
});

test('WhatsApp numbers are taken as-is (digits with country code) and never get a country code added', () => {
  assert.equal(normalizeWhatsAppPhone('919876543210'), KEY);
  assert.equal(normalizeWhatsAppPhone('+91 98765 43210'), KEY);
  assert.equal(normalizeWhatsAppPhone('9876543210'), '9876543210'); // never "fixed" by adding a country code: WhatsApp's number is the truth
  assert.equal(normalizeWhatsAppPhone('12345'), null);
  assert.equal(normalizeWhatsAppPhone(''), null);
  assert.equal(normalizeWhatsAppPhone(undefined), null);
});
test('a booking-form number and a WhatsApp sender for the same person meet at the same key', () => {
  assert.equal(toNormalizedPhone('098765 43210', { countryCode: '91' }), normalizeWhatsAppPhone('919876543210'));
});
test('display format: Indian numbers grouped, others plain', () => {
  assert.equal(formatPhoneDisplay(KEY), '+91 98765 43210');
  assert.equal(formatPhoneDisplay('11234567890'), '+11234567890');
  assert.equal(formatPhoneDisplay(''), '');
});
test('nationalKey is the last 10 digits (used only to REPORT possible duplicates)', () => {
  assert.equal(nationalKey('919876543210'), '9876543210');
  assert.equal(nationalKey('19876543210'), '9876543210');
});

console.log('\n--- client form validation ---');
test('a good form is cleaned: spaces collapsed, email lower-cased, phone normalized and formatted', () => {
  const { values } = parseClientInput({ name: '  Priya   Sharma ', phone: '098765 43210', email: ' Priya@Example.COM ', city: ' Pune ', notes: 'Prefers candid shots' });
  assert.equal(values.name, 'Priya Sharma');
  assert.equal(values.normalizedPhone, KEY);
  assert.equal(values.phone, '+91 98765 43210');
  assert.equal(values.email, 'priya@example.com');
  assert.equal(values.city, 'Pune');
  assert.equal(values.notes, 'Prefers candid shots');
});
test('only name and phone are required', () => {
  const { values } = parseClientInput({ name: 'Ra', phone: '+91 98765 43210' });
  assert.equal(values.email, undefined);
  assert.equal(values.notes, undefined);
});
test('missing and invalid fields are reported per field', () => {
  throwsFields(() => parseClientInput({}), ['name', 'phone']);
  throwsFields(() => parseClientInput({ name: 'A', phone: '+91 98765 43210' }), ['name']);
  throwsFields(() => parseClientInput({ name: 'x'.repeat(81), phone: '+91 98765 43210' }), ['name']);
  throwsFields(() => parseClientInput({ name: 'Priya', phone: '12345' }), ['phone']);
  throwsFields(() => parseClientInput({ name: 'Priya', phone: '+91 98765 43210', email: 'not-an-email' }), ['email']);
  throwsFields(() => parseClientInput({ name: 'Priya', phone: '+91 98765 43210', city: 'x'.repeat(81) }), ['city']);
});
test('blank optional fields are accepted and mean "none"', () => {
  const { values } = parseClientInput({ name: 'Priya', phone: '+91 98765 43210', email: '', city: '', notes: '' });
  assert.equal(values.email, '');
  assert.equal(values.city, '');
  assert.equal(values.notes, undefined);
});
test('objects, arrays and operators are refused instead of being passed on (no query tricks)', () => {
  throwsFields(() => parseClientInput({ name: { $ne: '' }, phone: { $gt: '' } }), ['name', 'phone']);
  throwsFields(() => parseClientInput({ name: ['Priya'], phone: '+91 98765 43210' }), ['name']);
  throwsFields(() => parseClientInput({ name: 'Priya', phone: '+91 98765 43210', email: { $ne: null } }), ['email']);
  throwsFields(() => parseClientInput(null), ['name', 'phone']);
  throwsFields(() => parseClientInput('text'), ['name', 'phone']);
});
test('partial (edit) mode validates only what was sent', () => {
  assert.deepEqual(Object.keys(parseClientInput({ city: 'Mumbai' }, { partial: true }).values), ['city']);
  assert.deepEqual(parseClientInput({ email: null }, { partial: true }).values, { email: '' });
  throwsFields(() => parseClientInput({ email: 'nope' }, { partial: true }), ['email']);
  throwsFields(() => parseClientInput({ name: '' }, { partial: true }), ['name']);
  assert.deepEqual(parseClientInput({}, { partial: true }).values, {});
});
test('control characters are stripped from names', () => {
  assert.equal(parseClientInput({ name: 'Pri\u0000ya\n\tS', phone: '+91 98765 43210' }).values.name, 'Pri ya S');
});

console.log('\n--- notes ---');
test('a note keeps its line breaks, is trimmed, and is limited to 2000 characters', () => {
  assert.equal(parseNoteInput({ body: '  Venue: Pune\r\nFollow up next week  ' }), 'Venue: Pune\nFollow up next week');
  assert.equal(parseNoteInput({ body: 'x'.repeat(2000) }).length, 2000);
  throwsFields(() => parseNoteInput({ body: 'x'.repeat(2001) }), ['body']);
  throwsFields(() => parseNoteInput({ body: '   ' }), ['body']);
  throwsFields(() => parseNoteInput({}), ['body']);
  throwsFields(() => parseNoteInput({ body: { $ne: 1 } }), ['body']);
  throwsFields(() => parseNoteInput(undefined), ['body']);
});

console.log('\n--- "this month" ---');
test('the month starts at midnight in the BUSINESS time zone, not the server\'s', () => {
  // 2026-11-05 01:00 in Kolkata is still 2026-11-04 on a UTC server, but the month is November in both
  assert.equal(startOfMonth(new Date('2026-11-04T19:30:00Z'), 'Asia/Kolkata').toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(startOfMonth(new Date('2026-11-04T19:30:00Z'), 'UTC').toISOString(), '2026-11-01T00:00:00.000Z');
  // 00:30 on 1 Nov in Kolkata is 19:00 on 31 Oct UTC: UTC alone would call that October
  assert.equal(startOfMonth(new Date('2026-10-31T19:00:00Z'), 'Asia/Kolkata').toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(startOfMonth(new Date('2026-10-31T17:00:00Z'), 'Asia/Kolkata').toISOString(), '2026-09-30T18:30:00.000Z');
});
test('daylight saving is handled and a bad time zone falls back to UTC', () => {
  assert.equal(startOfMonth(new Date('2026-03-15T12:00:00Z'), 'America/New_York').toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(startOfMonth(new Date('2026-04-15T12:00:00Z'), 'America/New_York').toISOString(), '2026-04-01T04:00:00.000Z');
  assert.equal(startOfMonth(new Date('2026-11-04T19:30:00Z'), 'Not/AZone').toISOString(), '2026-11-01T00:00:00.000Z');
});

console.log('\n--- list query shape ---');
const stageNames = (pipeline) => pipeline.map((s) => Object.keys(s)[0]);
const rowsStages = (pipeline) => pipeline.at(-1).$facet.rows.map((s) => Object.keys(s)[0]);
test('the default list cuts the page first and only looks up bookings for that page', () => {
  const p = buildListPipeline({ today: '2026-11-05', page: 3, limit: 10 });
  assert.deepEqual(stageNames(p), ['$sort', '$facet']);
  assert.deepEqual(rowsStages(p), ['$skip', '$limit', '$lookup', '$addFields', '$addFields', '$project']);
  assert.equal(p.at(-1).$facet.rows[0].$skip, 20);
  assert.equal(p.at(-1).$facet.rows[1].$limit, 10);
  assert.deepEqual(p.at(-1).$facet.total, [{ $count: 'n' }]);
});
test('filters and sorts that depend on bookings look them up for every matching client first', () => {
  for (const o of [{ filter: 'repeat' }, { filter: 'new' }, { filter: 'upcoming' }, { filter: 'none' }, { sort: 'lastBooking' }, { sort: 'mostBookings' }]) {
    const names = stageNames(buildListPipeline({ today: '2026-11-05', ...o }));
    assert.ok(names.indexOf('$lookup') !== -1 && names.indexOf('$lookup') < names.indexOf('$sort'), JSON.stringify(o));
  }
});
test('search narrows first; names, emails and phone digits are all searched, special characters are escaped', () => {
  const c = searchCondition('  +91 98765 ');
  assert.equal(c.$or.length, 4);
  assert.equal(searchCondition('priya').$or.length, 3); // no digits worth matching
  assert.equal(searchCondition('   '), null);
  assert.equal(searchCondition(undefined), null);
  const rx = searchCondition('a.b+(c)').$or[0].name;
  assert.ok(rx.test('A.B+(C)') && !rx.test('axb+(c)'));
  assert.ok(searchCondition('09876 54').$or.at(-1).normalizedPhone.test('919876543210')); // a leading 0 does not hide the match
});
test('every list ends in a stable tie-break so pages never overlap', () => {
  for (const sort of ['recent', 'oldest', 'lastBooking', 'mostBookings']) {
    const p = buildListPipeline({ today: '2026-11-05', sort });
    const s = p.find((x) => x.$sort).$sort;
    assert.ok('_id' in s, sort);
  }
});
test('the profile summary follows the single repeat rule', () => {
  assert.equal(publicSummary(undefined).type, 'new');
  assert.equal(publicSummary({ total: 1, active: 1, completed: 0 }).type, 'new');
  assert.equal(publicSummary({ total: 1, active: 1, completed: 1 }).type, 'repeat'); // one completed shoot
  assert.equal(publicSummary({ total: 2, active: 2, completed: 0 }).type, 'repeat'); // two bookings
  assert.equal(publicSummary({ total: 3, active: 1, completed: 0, cancelled: 2 }).type, 'new'); // cancelled ones do not count
  assert.equal(publicSummary({ total: 3, active: 1, cancelled: 2 }).cancelledBookings, 2);
});

console.log('\n--- backfill planning ---');
const d = (s) => new Date(s);
const booking = (o) => ({ _id: `b${o.n}`, bookingId: `AM-${o.n}`, name: 'Priya', email: 'p@example.com', status: 'confirmed', createdAt: d('2026-01-01'), ...o });
test('records are grouped by normalized number; already-linked records are left alone', () => {
  const plan = planBackfill({
    bookings: [
      booking({ n: 1, phone: '+91 98765 43210' }), booking({ n: 2, phone: '09876543210' }), booking({ n: 3, phone: '98765 43210', clientId: 'c1' }),
      booking({ n: 4, phone: '+91 91234 56789', name: 'Rahul' }),
    ],
    conversations: [{ _id: 'w1', phone: '919876543210', name: 'Priya', createdAt: d('2025-12-01') }, { _id: 'w2', phone: '919999999999', createdAt: d('2026-02-01'), clientId: 'c9' }],
    clients: [{ _id: 'c1', normalizedPhone: '919876543210' }],
  });
  assert.equal(plan.groups.length, 2);
  const priya = plan.groups.find((g) => g.phone === KEY);
  assert.equal(priya.bookings.length, 2);
  assert.equal(priya.conversations.length, 1);
  assert.equal(priya.existingClientId, 'c1'); // reuses the client that already exists
  assert.equal(plan.report.bookingsAlreadyLinked, 1);
  assert.equal(plan.report.bookingsToLink, 3);
  assert.equal(plan.report.conversationsToLink, 1);
  assert.equal(plan.report.clientsToCreate, 1);
  assert.deepEqual(plan.report.formatVariants.map((f) => f.variants.length), [2]);
});
test('numbers that cannot be placed are reported and left unlinked', () => {
  const plan = planBackfill({ bookings: [booking({ n: 1, phone: '12345678' }), booking({ n: 2, phone: '+91 98765 43210' })] });
  assert.deepEqual(plan.unlinkable.map((u) => u.bookingId), ['AM-1']);
  assert.equal(plan.groups.length, 1);
});
test('different numbers with the same last 10 digits are REPORTED as possible duplicates and never merged', () => {
  const plan = planBackfill({
    bookings: [booking({ n: 1, phone: '+91 98765 43210' }), booking({ n: 2, phone: '+1 98765 43210' }), booking({ n: 3, phone: '+44 7911 123456' })],
    clients: [{ _id: 'c1', normalizedPhone: '919998887776' }],
  });
  assert.equal(plan.groups.length, 3); // three separate clients, nothing merged
  assert.equal(plan.report.possibleDuplicates.length, 1);
  assert.deepEqual(plan.report.possibleDuplicates[0].phones.sort(), ['19876543210', '919876543210']);
});
test('one number with different names becomes ONE client and is reported for information', () => {
  const plan = planBackfill({ bookings: [booking({ n: 1, phone: '+91 98765 43210', name: 'Priya' }), booking({ n: 2, phone: '+91 98765 43210', name: 'priya' }), booking({ n: 3, phone: '+91 98765 43210', name: 'Anita' })] });
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.report.sharedPhoneNames.length, 1);
  assert.equal(plan.report.sharedPhoneNames[0].names.length, 2); // "Priya" and "priya" are the same name
});
test('a client\'s "since" date is the OLDEST booking, so importing old data does not make everyone new this month', () => {
  const plan = planBackfill({
    bookings: [booking({ n: 1, phone: '+91 98765 43210', createdAt: d('2026-03-01'), name: 'Old Name' }), booking({ n: 2, phone: '+91 98765 43210', createdAt: d('2026-09-01'), name: 'New Name', email: 'new@example.com' })],
    conversations: [{ _id: 'w1', phone: KEY, name: 'WA', createdAt: d('2026-02-01') }],
  });
  const input = clientFromGroup(plan.groups[0]);
  assert.equal(input.createdAt.toISOString(), d('2026-03-01').toISOString()); // a WhatsApp conversation does not set it
  assert.equal(input.source, 'booking');
  assert.equal(input.name, 'New Name'); // the newest booking's name and email
  assert.equal(input.nameSource, 'booking');
  assert.equal(input.email, 'new@example.com');
});
test('a WhatsApp conversation alone NEVER creates a client; it only attaches to a client that exists (or will be created for a confirmed booking)', () => {
  const alone = planBackfill({ conversations: [{ _id: 'w1', phone: KEY, createdAt: d('2026-02-01') }] });
  assert.equal(alone.groups.length, 0);
  assert.equal(alone.report.clientsToCreate, 0);
  assert.equal(alone.report.conversationsWithoutClient, 1);
  const known = planBackfill({ conversations: [{ _id: 'w1', phone: KEY, createdAt: d('2026-02-01') }], clients: [{ _id: 'c1', normalizedPhone: KEY }] });
  assert.equal(known.groups.length, 1);
  assert.equal(known.groups[0].existingClientId, 'c1');
  assert.equal(known.report.conversationsToLink, 1);
  assert.equal(known.report.clientsToCreate, 0);
});
test('only CONFIRMED (and completed) bookings are planned; pending and cancelled bookings never get a client', () => {
  const plan = planBackfill({
    bookings: [
      booking({ n: 1, phone: '+91 98765 43210', status: 'pending' }), booking({ n: 2, phone: '+91 91234 56789', status: 'cancelled' }),
      booking({ n: 3, phone: '+91 98111 22233', status: 'confirmed' }), booking({ n: 4, phone: '+91 98222 33344', status: 'completed' }),
    ],
  });
  assert.deepEqual(plan.groups.map((g) => g.phone).sort(), ['919811122233', '919822233344']);
  assert.equal(plan.report.bookingsToLink, 2);
  assert.equal(plan.report.bookingsNotConfirmed, 2);
  assert.equal(plan.report.clientsToCreate, 2);
});
test('a booking that WAS confirmed (confirmedAt) and is cancelled now is still planned; one never confirmed is not', () => {
  const plan = planBackfill({
    bookings: [
      booking({ n: 1, phone: '+91 98765 43210', status: 'cancelled', confirmedAt: d('2026-02-01') }),
      booking({ n: 2, phone: '+91 91234 56789', status: 'cancelled' }),
    ],
    conversations: [], clients: [],
  });
  assert.equal(plan.report.clientsToCreate, 1);
  assert.equal(plan.groups[0].phone, '919876543210');
});
test('clients that exist but have no confirmed booking are KEPT and only reported (nothing is deleted or merged)', () => {
  const plan = planBackfill({
    bookings: [booking({ n: 1, phone: '+91 98765 43210', clientId: 'c1', status: 'confirmed' }), booking({ n: 2, phone: '+91 98111 22233', clientId: 'c2', status: 'pending' })],
    conversations: [],
    clients: [{ _id: 'c1', normalizedPhone: KEY }, { _id: 'c2', normalizedPhone: '919811122233' }, { _id: 'c3', normalizedPhone: '919822233344' }],
  });
  assert.equal(plan.report.clientsWithoutConfirmedBooking, 2); // c2 (pending only) and c3 (no booking at all)
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.report.clientsToCreate, 0);
});
test('running the plan on data that is already fully linked plans nothing', () => {
  const plan = planBackfill({ bookings: [booking({ n: 1, phone: '+91 98765 43210', clientId: 'c1' })], conversations: [{ _id: 'w', phone: KEY, clientId: 'c1' }], clients: [{ _id: 'c1', normalizedPhone: KEY }] });
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.report.clientsToCreate, 0);
});

console.log(failed ? `\n${failed} of ${count} tests FAILED` : `\nAll ${count} tests passed`);
process.exit(failed ? 1 : 0);
