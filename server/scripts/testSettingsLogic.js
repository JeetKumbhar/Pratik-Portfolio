/**
 * npm run test:settings-logic
 *
 * The pure part of the Settings system: defaults, merging, validation, working hours, availability rules, public fields.
 * No database, no network, no server. Runs in under a second.
 */
import assert from 'node:assert/strict';

process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
process.env.CLOUDINARY_API_KEY = 'k';
process.env.CLOUDINARY_API_SECRET = 's';
delete process.env.CLOUDINARY_FOLDER;

const { buildDefaults, mergeStored, normalizeGroup, toPublic, scrubPublic, isNotificationEnabled, NOTIFICATION_EVENT_KEYS } = await import('../utils/settingsSchema.js');
const { openHoursFor, periodsToHours, weekdayOf, wholeHour } = await import('../utils/schedule.js');
const { computeSlots, isBookableDate, buildMonth, buildAdminMonth, SLOT_TIMES } = await import('../utils/availability.js');
const { createSettingsStore } = await import('../utils/settings.js');
const { getRuntimeConfig, resetRuntimeConfig, setRuntimeConfig } = await import('../utils/runtimeConfig.js');
const { SETTINGS_GROUPS } = await import('../config/constants.js');

let failed = 0;
let count = 0;
const test = (name, fn) => {
  count += 1;
  return Promise.resolve().then(fn).then(() => console.log(`PASS  ${name}`), (err) => { failed += 1; console.log(`FAIL  ${name}\n      ${String(err.stack ?? err.message).split('\n').slice(0, 7).join('\n      ')}`); });
};
const fieldErrors = (fn) => { try { fn(); } catch (e) { assert.equal(e.statusCode, 400); return e.fieldErrors; } assert.fail('expected a 400'); };
const IMG = (name) => ({ url: `https://res.cloudinary.com/democloud/image/upload/v1/alex-morgan/portfolio/branding/${name}.png`, publicId: `alex-morgan/portfolio/branding/${name}` });
const day = (n) => `2026-11-${String(n).padStart(2, '0')}`; // 2026-11-02 is a Monday

console.log('\n--- defaults and merging ---');
await test('[1] defaults exist for every group and match how the site behaved before Settings', () => {
  const d = buildDefaults({});
  assert.deepEqual(Object.keys(d).sort(), [...SETTINGS_GROUPS].sort());
  assert.equal(d.general.currency, 'INR'); assert.equal(d.general.countryCode, '91'); assert.equal(d.general.timezone, 'Asia/Kolkata');
  assert.equal(d.booking.enabled, true); assert.equal(d.booking.minAdvanceDays, 1); assert.equal(d.booking.allowSameDay, false);
  assert.equal(d.booking.bufferHours, 0);
  assert.equal(Object.keys(d.availability.weekly).length, 7);
  assert.ok(Object.values(d.availability.weekly).every((x) => x.enabled && x.periods.length === 1 && x.periods[0].start === '07:00' && x.periods[0].end === '22:00'));
  assert.ok(NOTIFICATION_EVENT_KEYS.every((k) => d.notifications.events[k] === true));
  assert.ok(Object.values(d.website.home).every(Boolean)); assert.equal(d.website.portfolio.enabled, true); assert.equal(d.website.contact.enabled, true);
});
await test('[2] the timezone default honours BUSINESS_TIMEZONE', () => assert.equal(buildDefaults({ BUSINESS_TIMEZONE: 'Europe/London' }).general.timezone, 'Europe/London'));
await test('[3] a missing, null or empty document gives complete defaults and never throws', () => {
  for (const doc of [null, undefined, {}, { general: null }, { booking: 5 }, { availability: { weekly: 'x' } }]) {
    const m = mergeStored(doc, {});
    assert.deepEqual(m, mergeStored(null, {}));
    assert.equal(m.booking.enabled, true);
  }
});
await test('[4] a half-saved document keeps what was saved and fills in the rest; wrong-typed stored values fall back', () => {
  const m = mergeStored({ business: { businessName: 'Studio X', social: { facebook: 'https://facebook.com/x' } }, booking: { enabled: 'nope', bufferHours: 2 }, junk: 1 }, {});
  assert.equal(m.business.businessName, 'Studio X');
  assert.equal(m.business.social.facebook, 'https://facebook.com/x');
  assert.equal(m.business.social.instagram, buildDefaults({}).business.social.instagram);
  assert.equal(m.booking.enabled, true); // 'nope' is not a boolean
  assert.equal(m.booking.bufferHours, 2);
  assert.equal('junk' in m, false);
});

console.log('\n--- validation: general and business ---');
const G = () => buildDefaults({}).general;
const B = () => buildDefaults({}).business;
await test('[5] general: valid changes are accepted and cleaned', () => {
  const out = normalizeGroup('general', { websiteName: '  My   Studio ', countryCode: '+44', timezone: 'Europe/London', currency: 'GBP', timeFormat: '24h', dateFormat: 'DD/MM/YYYY', logo: IMG('logo') }, G());
  assert.equal(out.websiteName, 'My Studio'); assert.equal(out.countryCode, '44'); assert.equal(out.timezone, 'Europe/London');
  assert.equal(out.currency, 'GBP'); assert.equal(out.timeFormat, '24h'); assert.deepEqual(out.logo, IMG('logo'));
  assert.equal(out.photographerName, 'Pratik Shelke'); // untouched fields stay
});
await test('[6] general: bad values each get their own message', () => {
  const e = fieldErrors(() => normalizeGroup('general', { websiteName: '', photographerName: 5, currency: 'XXX', countryCode: '0', timezone: 'Mars/Base', dateFormat: 'nope', timeFormat: '30h', logo: { url: 'https://evil.example/x.png', publicId: 'x' }, favicon: 'x' }, G()));
  assert.deepEqual(Object.keys(e).sort(), ['countryCode', 'currency', 'dateFormat', 'favicon', 'logo', 'photographerName', 'timeFormat', 'timezone', 'websiteName']);
});
await test('[7] general: an unchanged logo is accepted; a foreign or path-traversing image is not', () => {
  const cur = { ...G(), logo: IMG('a') };
  assert.deepEqual(normalizeGroup('general', { logo: IMG('a') }, cur).logo, IMG('a'));
  assert.deepEqual(normalizeGroup('general', { logo: null }, cur).logo, { url: '', publicId: '' }); // removing it is allowed
  assert.ok(fieldErrors(() => normalizeGroup('general', { logo: { url: IMG('a').url, publicId: 'alex-morgan/portfolio/../../secret' } }, G())).logo);
  assert.ok(fieldErrors(() => normalizeGroup('general', { favicon: { url: 'https://res.cloudinary.com/othercloud/image/upload/alex-morgan/portfolio/x.png', publicId: 'alex-morgan/portfolio/x' } }, G())).favicon);
});
await test('[8] business: contact details, address and social links validate', () => {
  const out = normalizeGroup('business', { primaryPhone: '+91 98765 43210', email: ' Hello@Studio.com ', city: 'Pune', postalCode: '411001', mapsUrl: 'https://maps.app.goo.gl/abc', social: { instagram: 'https://instagram.com/studio', youtube: 'https://www.youtube.com/@studio' } }, B());
  assert.equal(out.email, 'hello@studio.com'); assert.equal(out.city, 'Pune');
  assert.equal(out.social.instagram, 'https://instagram.com/studio');
  assert.equal(out.social.facebook, ''); // untouched
});
await test('[9] business: bad phone, email, urls (http, other host, script, credentials) are rejected', () => {
  const e = fieldErrors(() => normalizeGroup('business', {
    primaryPhone: 'abc', whatsappNumber: '123', email: 'nope', mapsUrl: 'https://evil.example/map', postalCode: '!!',
    social: { instagram: 'http://instagram.com/x', facebook: 'https://notfacebook.com/x', youtube: 'javascript:alert(1)' },
  }, B()));
  assert.deepEqual(Object.keys(e).sort(), ['email', 'mapsUrl', 'postalCode', 'primaryPhone', 'social.facebook', 'social.instagram', 'social.youtube', 'whatsappNumber']);
  assert.ok(fieldErrors(() => normalizeGroup('business', { social: { instagram: 'https://user:pw@instagram.com/x' } }, B()))['social.instagram']);
  assert.ok(fieldErrors(() => normalizeGroup('business', { social: { instagram: 'https://evilinstagram.com/x' } }, B()))['social.instagram']); // suffix trick
});
await test('[10] optional fields can be cleared with an empty string', () => {
  const cur = { ...B(), mapsUrl: 'https://maps.app.goo.gl/abc' };
  assert.equal(normalizeGroup('business', { mapsUrl: '', social: { instagram: '' } }, cur).mapsUrl, '');
  assert.equal(normalizeGroup('business', { social: { instagram: '' } }, cur).social.instagram, '');
});
await test('[11] non-object bodies, unknown groups and unknown keys', () => {
  for (const bad of [null, 'x', 5, [1]]) assert.throws(() => normalizeGroup('general', bad, G()), { statusCode: 400 });
  assert.throws(() => normalizeGroup('nonsense', {}, {}), { statusCode: 404 });
  const out = normalizeGroup('general', { isAdmin: true, __proto__: { x: 1 }, websiteName: 'OK name' }, G());
  assert.equal(out.isAdmin, undefined); assert.equal(out.websiteName, 'OK name');
  assert.equal({}.x, undefined); // no prototype pollution
});

console.log('\n--- validation: booking ---');
const K = () => buildDefaults({}).booking;
await test('[12] booking: values are accepted; strings of digits are read as numbers', () => {
  const out = normalizeGroup('booking', { enabled: false, disabledMessage: 'Closed for now', minAdvanceDays: '3', maxAdvanceDays: 90, bufferHours: 1, customDurationHours: 4, emailRequired: false, allowNotes: false, confirmationMessage: 'Thanks!\nSee you' }, K());
  assert.equal(out.enabled, false); assert.equal(out.minAdvanceDays, 3); assert.equal(out.maxAdvanceDays, 90); assert.equal(out.emailRequired, false);
  assert.equal(out.confirmationMessage, 'Thanks!\nSee you');
});
await test('[13] booking: out-of-range numbers, wrong types and min > max are rejected', () => {
  const e = fieldErrors(() => normalizeGroup('booking', { enabled: 'yes', bufferHours: 99, customDurationHours: 0, maxAdvanceDays: 99999, minAdvanceDays: -1, phoneRequired: 1 }, K()));
  assert.deepEqual(Object.keys(e).sort(), ['bufferHours', 'customDurationHours', 'enabled', 'maxAdvanceDays', 'minAdvanceDays', 'phoneRequired']);
  assert.ok(fieldErrors(() => normalizeGroup('booking', { minAdvanceDays: 10, maxAdvanceDays: 5 }, K())).maxAdvanceDays);
  assert.ok(fieldErrors(() => normalizeGroup('booking', { bufferHours: 1.5 }, K())).bufferHours);
});
await test('[14] booking: same-day and the minimum advance period stay consistent', () => {
  assert.equal(normalizeGroup('booking', { allowSameDay: true }, { ...K(), minAdvanceDays: 3 }).minAdvanceDays, 0);
  assert.equal(normalizeGroup('booking', { allowSameDay: false }, { ...K(), allowSameDay: true, minAdvanceDays: 0 }).minAdvanceDays, 1);
  assert.equal(normalizeGroup('booking', { minAdvanceDays: 0 }, K()).minAdvanceDays, 1); // not same-day, so at least tomorrow
});

console.log('\n--- validation: availability ---');
const A = () => buildDefaults({}).availability;
await test('[15] weekly hours: multiple periods are sorted and kept; a day can be switched off', () => {
  const out = normalizeGroup('availability', { weekly: { monday: { enabled: true, periods: [{ start: '14:00', end: '18:00' }, { start: '09:00', end: '12:00' }] }, sunday: { enabled: false, periods: [] } } }, A());
  assert.deepEqual(out.weekly.monday.periods, [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }]);
  assert.equal(out.weekly.sunday.enabled, false);
  assert.equal(out.weekly.tuesday.enabled, true); // untouched
});
await test('[16] weekly hours: bad times, overlaps, out-of-range, empty working day are rejected', () => {
  const bad = (p, enabled = true) => fieldErrors(() => normalizeGroup('availability', { weekly: { monday: { enabled, periods: p } } }, A()))['weekly.monday'];
  assert.ok(bad([{ start: '09:30', end: '12:00' }]));
  assert.ok(bad([{ start: '12:00', end: '09:00' }]));
  assert.ok(bad([{ start: '09:00', end: '13:00' }, { start: '12:00', end: '15:00' }]));
  assert.ok(bad([{ start: '05:00', end: '09:00' }]));
  assert.ok(bad([{ start: '20:00', end: '23:00' }]));
  assert.ok(bad([]));
  assert.ok(bad('x'));
  assert.ok(bad([1, 2, 3, 4, 5].map((i) => ({ start: `0${i + 3}:00`, end: `0${i + 3}:00` }))));
  assert.ok(fieldErrors(() => normalizeGroup('availability', { weekly: { funday: { enabled: true, periods: [] } } }, A()))['weekly.funday']);
  assert.equal(normalizeGroup('availability', { weekly: { monday: { enabled: false, periods: [] } } }, A()).weekly.monday.enabled, false);
});
await test('[17] special working days: stored sorted with ids; duplicates, bad dates and missing hours are rejected', () => {
  const out = normalizeGroup('availability', { specialDays: [{ date: '2026-12-25', periods: [{ start: '10:00', end: '14:00' }], reason: ' Christmas shoot ' }, { date: '2026-12-01', periods: [{ start: '09:00', end: '12:00' }] }] }, A());
  assert.deepEqual(out.specialDays.map((s) => s.date), ['2026-12-01', '2026-12-25']);
  assert.ok(out.specialDays.every((s) => /^[a-f0-9]{12}$/.test(s.id)));
  assert.equal(out.specialDays[1].reason, 'Christmas shoot');
  const e = fieldErrors(() => normalizeGroup('availability', { specialDays: [{ date: '2026-13-40', periods: [] }, { date: '2026-12-01', periods: [{ start: '09:00', end: '12:00' }] }, { date: '2026-12-01', periods: [{ start: '09:00', end: '12:00' }] }, { date: '2026-12-02', periods: [] }] }, A()));
  assert.ok(e['specialDays.0.date']); assert.ok(e['specialDays.2.date']); assert.ok(e['specialDays.3.periods']);
  assert.ok(fieldErrors(() => normalizeGroup('availability', { specialDays: 'x' }, A())).specialDays);
});
await test('[18] a forged id on a special day is replaced, not trusted', () => {
  const out = normalizeGroup('availability', { specialDays: [{ id: '../../x', date: '2026-12-01', periods: [{ start: '09:00', end: '12:00' }] }] }, A());
  assert.match(out.specialDays[0].id, /^[a-f0-9]{12}$/);
});

console.log('\n--- validation: notifications, website, seo ---');
await test('[19] notifications: known events toggle; unknown events and non-booleans are rejected', () => {
  const cur = buildDefaults({}).notifications;
  const out = normalizeGroup('notifications', { events: { booking_cancelled_customer: false } }, cur);
  assert.equal(out.events.booking_cancelled_customer, false); assert.equal(out.events.new_booking_admin, true);
  const e = fieldErrors(() => normalizeGroup('notifications', { events: { made_up: true, new_booking_admin: 'off' } }, cur));
  assert.ok(e['events.made_up']); assert.ok(e['events.new_booking_admin']);
  assert.equal(isNotificationEnabled({ notifications: out }, 'booking_cancelled_customer'), false);
  assert.equal(isNotificationEnabled(null, 'booking_cancelled_customer'), true); // no settings → behave as before
});
await test('[20] website: section toggles, portfolio, contact; unknown keys rejected', () => {
  const cur = buildDefaults({}).website;
  const out = normalizeGroup('website', { home: { testimonials: false }, portfolio: { enabled: false }, contact: { ctaText: 'Book now' } }, cur);
  assert.equal(out.home.testimonials, false); assert.equal(out.home.services, true); assert.equal(out.portfolio.enabled, false); assert.equal(out.contact.ctaText, 'Book now');
  assert.ok(fieldErrors(() => normalizeGroup('website', { home: { hero: false } }, cur))['home.hero']);
  assert.ok(fieldErrors(() => normalizeGroup('website', { portfolio: { enabled: 'no' } }, cur))['portfolio.enabled']);
});
await test('[21] seo: lengths, canonical url (https, trailing slash trimmed), og image ownership', () => {
  const cur = buildDefaults({}).seo;
  const out = normalizeGroup('seo', { title: 'Wedding photographer in Pune', description: 'Stories told in light.', canonicalUrl: 'https://pratikshelke.com/', ogImage: IMG('og') }, cur);
  assert.equal(out.canonicalUrl, 'https://pratikshelke.com'); assert.deepEqual(out.ogImage, IMG('og'));
  const e = fieldErrors(() => normalizeGroup('seo', { title: 'x'.repeat(71), description: 'y'.repeat(201), canonicalUrl: 'http://x.com', ogImage: { url: 'https://evil.example/a.png', publicId: 'a' } }, cur));
  assert.deepEqual(Object.keys(e).sort(), ['canonicalUrl', 'description', 'ogImage', 'title']);
});

console.log('\n--- public view ---');
await test('[22] the public view exposes only safe fields: no notifications, no schedule, no Cloudinary ids', () => {
  const s = mergeStored({ general: { logo: IMG('l') }, seo: { ogImage: IMG('o') } }, {});
  const pub = scrubPublic(toPublic(s));
  assert.deepEqual(Object.keys(pub).sort(), ['booking', 'business', 'general', 'seo', 'website']);
  const text = JSON.stringify(pub);
  assert.ok(!text.includes('publicId')); assert.ok(!text.includes('alex-morgan/portfolio/branding/l"'));
  assert.ok(!('notifications' in pub)); assert.ok(!('availability' in pub)); assert.ok(!('bufferHours' in pub.booking));
  assert.equal(pub.general.logo.url, IMG('l').url);
});

console.log('\n--- working hours ---');
await test('[23] weekday of a date, whole hours, periods → hours', () => {
  assert.equal(weekdayOf('2026-11-02'), 'monday'); assert.equal(weekdayOf('2026-11-08'), 'sunday'); assert.equal(weekdayOf('2024-02-29'), 'thursday');
  assert.equal(wholeHour('09:00'), 9); assert.equal(wholeHour('09:30'), null); assert.equal(wholeHour('x'), null);
  assert.deepEqual([...periodsToHours([{ start: '09:00', end: '11:00' }, { start: '14:00', end: '15:00' }])], ['09:00', '10:00', '14:00']);
});
await test('[24] a special working day overrides a day that is normally off; weekly off days are empty', () => {
  const av = normalizeGroup('availability', { weekly: { sunday: { enabled: false, periods: [] } }, specialDays: [{ date: '2026-11-08', periods: [{ start: '10:00', end: '12:00' }] }] }, A());
  assert.deepEqual([...openHoursFor('2026-11-08', av)], ['10:00', '11:00']);
  assert.equal(openHoursFor('2026-11-15', av).size, 0); // another Sunday
  assert.equal(openHoursFor('2026-11-09', av).size, 15); // a Monday: 07:00…21:00
});

console.log('\n--- availability rules ---');
const settings = (patch = {}) => { const s = mergeStored(null, {}); return { ...s, booking: { ...s.booking, ...patch.booking }, availability: { ...s.availability, ...patch.availability } }; };
const slotsFor = (date, o, ctx) => computeSlots(date, ctx ?? {}, o);
const free = (slots) => slots.filter((s) => s.available).map((s) => s.time);
const NOW = new Date('2026-11-04T06:30:00Z'); // 12:00 in Asia/Kolkata (UTC+5:30), a Wednesday
await test('[25] default settings reproduce the original availability: tomorrow on, all hours 07-21', () => {
  const s = settings();
  const slots = computeSlots('2026-11-06', {}, { now: NOW, ...optionsFromS(s, '2026-11-06') });
  assert.equal(free(slots).length, SLOT_TIMES.length);
  assert.equal(free(computeSlots('2026-11-04', {}, { now: NOW, ...optionsFromS(s, '2026-11-04') })).length, 0); // today is closed
});
function optionsFromS(s, date) { return { rules: { minAdvanceDays: s.booking.minAdvanceDays, maxAdvanceDays: s.booking.maxAdvanceDays, today: '2026-11-04' }, openHours: openHoursFor(date, s.availability), bufferHours: s.booking.bufferHours, bookingEnabled: s.booking.enabled }; }
await test('[26] working hours limit the slots; multi-hour shoots must fit inside a period', () => {
  const s = settings({ availability: normalizeGroup('availability', { weekly: { friday: { enabled: true, periods: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '16:00' }] } } }, A()) });
  const opts = (d) => ({ now: NOW, ...optionsFromS(s, d) });
  assert.deepEqual(free(computeSlots('2026-11-06', {}, opts('2026-11-06'))), ['09:00', '10:00', '11:00', '14:00', '15:00']);
  assert.deepEqual(free(computeSlots('2026-11-06', {}, { ...opts('2026-11-06'), durationHours: 2 })), ['09:00', '10:00', '14:00']); // 11:00-13:00 would cross the lunch break
});
await test('[27] a day switched off has no slots; the admin calendar labels it day_off', () => {
  const s = settings({ availability: normalizeGroup('availability', { weekly: { saturday: { enabled: false, periods: [] } } }, A()) });
  assert.equal(free(computeSlots('2026-11-07', {}, { now: NOW, ...optionsFromS(s, '2026-11-07') })).length, 0);
  const month = buildAdminMonth(2026, 10, [], [], 1, {}, { settings: s });
  assert.equal(month.find((d) => d.date === '2026-11-07').label, 'day_off');
  assert.equal(month.find((d) => d.date === '2026-11-09').label, 'available');
});
await test('[28] existing blocks and bookings are respected on top of working hours (no double booking)', () => {
  const s = settings();
  const o = { now: NOW, ...optionsFromS(s, '2026-11-06') };
  assert.ok(!free(computeSlots('2026-11-06', { bookedTimes: ['10:00', '11:00'] }, o)).includes('10:00'));
  assert.equal(free(computeSlots('2026-11-06', { blocks: [{ blockedTimes: [] }] }, o)).length, 0); // all-day block
  assert.ok(!free(computeSlots('2026-11-06', { blocks: [{ blockedTimes: ['12:00'] }] }, o)).includes('12:00'));
  assert.ok(!free(computeSlots('2026-11-06', { bookedTimes: ['10:00'] }, { ...o, durationHours: 2 })).includes('09:00')); // 09-11 would overlap 10:00
});
await test('[29] special working days open a normally closed day; blocks still win over them', () => {
  const s = settings({ availability: normalizeGroup('availability', { weekly: { sunday: { enabled: false, periods: [] } }, specialDays: [{ date: '2026-11-08', periods: [{ start: '10:00', end: '13:00' }] }] }, A()) });
  const o = { now: NOW, ...optionsFromS(s, '2026-11-08') };
  assert.deepEqual(free(computeSlots('2026-11-08', {}, o)), ['10:00', '11:00', '12:00']);
  assert.deepEqual(free(computeSlots('2026-11-08', { blocks: [{ blockedTimes: ['11:00'] }] }, o)), ['10:00', '12:00']);
  assert.equal(free(computeSlots('2026-11-08', { blocks: [{ type: 'public_holiday', blockedTimes: [] }] }, o)).length, 0);
});
await test('[30] booking window: same-day allows today (future hours only), min/max advance and the disabled switch', () => {
  setRuntimeConfig({ countryCode: '91', timezone: 'Asia/Kolkata' }); // what loading the settings does in production
  const same = settings({ booking: { allowSameDay: true, minAdvanceDays: 0 } });
  const today = free(computeSlots('2026-11-04', {}, { now: NOW, ...optionsFromS(same, '2026-11-04') }));
  assert.ok(today.length > 0 && today.every((t) => Number(t.slice(0, 2)) > 12)); // it is 12:00 in India; only later hours
  const window = settings({ booking: { minAdvanceDays: 3, maxAdvanceDays: 10 } });
  const f = (d) => free(computeSlots(d, {}, { now: NOW, ...optionsFromS(window, d) })).length > 0;
  assert.equal(f('2026-11-06'), false); assert.equal(f('2026-11-07'), true); assert.equal(f('2026-11-14'), true); assert.equal(f('2026-11-15'), false);
  const off = settings({ booking: { enabled: false } });
  assert.equal(free(computeSlots('2026-11-10', {}, { now: NOW, ...optionsFromS(off, '2026-11-10') })).length, 0);
  assert.equal(isBookableDate('2026-11-05', { today: '2026-11-04', minAdvanceDays: 1 }), true);
  assert.equal(isBookableDate('2026-11-04', { today: '2026-11-04', minAdvanceDays: 1 }), false);
  assert.equal(isBookableDate('2026-02-30', { today: '2026-11-04' }), false);
  resetRuntimeConfig();
});
await test('[31] buffer: other bookings keep the buffer away on both sides; blocks do not add a buffer', () => {
  const s = settings({ booking: { bufferHours: 1 } });
  const o = { now: NOW, ...optionsFromS(s, '2026-11-06') };
  const f = free(computeSlots('2026-11-06', { bookedTimes: ['10:00', '11:00'] }, o));
  assert.ok(!f.includes('09:00') && !f.includes('12:00') && f.includes('08:00') && f.includes('13:00'));
  const withBlock = free(computeSlots('2026-11-06', { blocks: [{ blockedTimes: ['10:00'] }] }, o));
  assert.ok(withBlock.includes('09:00') && withBlock.includes('11:00'));
});
await test('[32] the admin picking a time ignores the customer rules (window, hours, buffer) but not bookings or blocks', () => {
  const s = settings({ booking: { minAdvanceDays: 5, bufferHours: 2 }, availability: normalizeGroup('availability', { weekly: { friday: { enabled: false, periods: [] } } }, A()) });
  const o = { enforceDateRules: false, now: NOW, ...optionsFromS(s, '2026-11-06'), openHours: undefined };
  const f = free(computeSlots('2026-11-06', { bookedTimes: ['10:00'], blocks: [{ blockedTimes: ['12:00'] }] }, o));
  assert.ok(f.includes('09:00') && f.includes('11:00')); assert.ok(!f.includes('10:00') && !f.includes('12:00'));
});
await test('[33] the monthly view reflects the settings (a day off is unavailable)', () => {
  const s = settings({ availability: normalizeGroup('availability', { weekly: { monday: { enabled: false, periods: [] } } }, A()) });
  const m = buildMonth(2026, 11, [], [], 1, { settings: s }); // December 2026: Mondays are off
  assert.equal(m['2026-12-07'], 'unavailable');
});

console.log('\n--- the settings store (fake model, no database) ---');
function fakeModel() {
  const state = { doc: null, writes: [], reads: 0, failNextRead: false, racing: false };
  return {
    state,
    model: {
      findOne: () => ({ lean: async () => { state.reads += 1; if (state.failNextRead) { state.failNextRead = false; throw new Error('db down'); } return state.doc ? structuredClone(state.doc) : null; } }),
      findOneAndUpdate: async (filter, update) => {
        if (state.racing) { state.racing = false; throw Object.assign(new Error('E11000'), { code: 11000 }); }
        state.writes.push(update);
        state.doc = { ...(state.doc ?? { key: 'site' }), ...update.$set };
        return state.doc;
      },
    },
  };
}
await test('[34] the store works with no document at all, and caches for the ttl', async () => {
  const f = fakeModel(); let t = 0;
  const store = createSettingsStore(async () => f.model, { ttlMs: 1000, now: () => t });
  const a = await store.getSettings(); assert.equal(a.booking.enabled, true);
  await store.getSettings(); assert.equal(f.state.reads, 1);
  t = 1500; await store.getSettings(); assert.equal(f.state.reads, 2);
});
await test('[35] saving writes ONLY that group (so two admins on different sections never clash) and refreshes the cache', async () => {
  const f = fakeModel();
  const store = createSettingsStore(async () => f.model, { ttlMs: 60000 });
  await store.getSettings();
  const { settings, previous } = await store.updateGroup('booking', { bufferHours: 2 }, { adminId: 'a1' });
  assert.deepEqual(Object.keys(f.state.writes[0].$set).sort(), ['booking', 'updatedBy']);
  assert.equal(settings.booking.bufferHours, 2); assert.equal(previous.bufferHours, 0);
  assert.equal((await store.getSettings()).booking.bufferHours, 2);
});
await test('[36] an invalid save writes nothing', async () => {
  const f = fakeModel(); const store = createSettingsStore(async () => f.model);
  await assert.rejects(store.updateGroup('booking', { bufferHours: 99 }), { statusCode: 400 });
  await assert.rejects(store.updateGroup('nope', {}), { statusCode: 404 });
  assert.equal(f.state.writes.length, 0);
});
await test('[37] two first-ever saves racing to create the document both succeed', async () => {
  const f = fakeModel(); f.state.racing = true;
  const store = createSettingsStore(async () => f.model);
  const r = await store.updateGroup('general', { websiteName: 'Race Studio' });
  assert.equal(r.settings.general.websiteName, 'Race Studio');
});
await test('[38] if the database fails after a good read, the last good settings are served; with no cache the error surfaces', async () => {
  const f = fakeModel(); let t = 0;
  const store = createSettingsStore(async () => f.model, { ttlMs: 10, now: () => t });
  await store.getSettings(); t = 100; f.state.failNextRead = true;
  assert.equal((await store.getSettings()).booking.enabled, true);
  const g = fakeModel(); g.state.failNextRead = true;
  await assert.rejects(createSettingsStore(async () => g.model).getSettings(), /db down/);
});
await test('[39] loading settings publishes the timezone and country code for the rest of the server', async () => {
  resetRuntimeConfig();
  const f = fakeModel(); f.state.doc = { key: 'site', general: { countryCode: '44', timezone: 'Europe/London' } };
  await createSettingsStore(async () => f.model).getSettings();
  assert.deepEqual(getRuntimeConfig(), { countryCode: '44', timezone: 'Europe/London' });
  resetRuntimeConfig();
});
await test('[40] isEventEnabled reads the saved toggle and defaults to enabled', async () => {
  const f = fakeModel(); f.state.doc = { key: 'site', notifications: { events: { booking_confirmed_customer: false } } };
  const store = createSettingsStore(async () => f.model);
  assert.equal(await store.isEventEnabled('booking_confirmed_customer'), false);
  assert.equal(await store.isEventEnabled('new_booking_admin'), true);
});

console.log('\n--- fixes from the independent review ---');
const { isOwnImage, isOwnBrandingImage } = await import('../utils/imageStorage.js');
await test('[R1] image check is strict: no "..", "#", "?", other host/account, or non-branding folder', () => {
  const good = IMG('ok');
  assert.equal(isOwnImage(good), true); assert.equal(isOwnBrandingImage(good), true);
  const pid = good.publicId; const base = 'https://res.cloudinary.com/democloud/image/upload/';
  for (const url of [
    `https://res.cloudinary.com/democloud/image/upload/../../evil/image/upload/x.jpg#${pid}`,
    `${base}v1/${pid}.png#frag`, `${base}v1/${pid}.png?x=1`,
    `${base}v1/%2e%2e/${pid}.png`, `https://res.cloudinary.com/otheraccount/image/upload/v1/${pid}.png`,
    `http://res.cloudinary.com/democloud/image/upload/v1/${pid}.png`, `https://res.cloudinary.com:444/democloud/image/upload/v1/${pid}.png`,
    `https://user:pw@res.cloudinary.com/democloud/image/upload/v1/${pid}.png`, `https://res.cloudinary.com.evil.example/democloud/image/upload/v1/${pid}.png`,
  ]) assert.equal(isOwnImage({ url, publicId: pid }), false, url);
  const portfolio = { url: `${base}v1/alex-morgan/portfolio/photo1.png`, publicId: 'alex-morgan/portfolio/photo1' };
  assert.equal(isOwnImage(portfolio), true); assert.equal(isOwnBrandingImage(portfolio), false); // portfolio photos cannot be adopted as a logo or cover
  assert.equal(isOwnImage({ url: good.url, publicId: 'alex-morgan/portfolio/branding//x' }), false);
});
await test('[R2] a read that started before a save never refills the cache with the old values', async () => {
  const f = fakeModel();
  f.state.doc = { key: 'site', booking: { enabled: true } };
  const store = createSettingsStore(async () => f.model, { ttlMs: 60000 });
  let release; const gate = new Promise((r) => { release = r; });
  const realFind = f.model.findOne;
  f.model.findOne = () => ({ lean: async () => { const snapshot = f.state.doc ? structuredClone(f.state.doc) : null; await gate; f.state.reads += 1; return snapshot; } });
  const slowRead = store.getSettings();                       // starts reading the OLD document…
  f.model.findOne = realFind;
  await store.updateGroup('booking', { enabled: false });      // …a save finishes meanwhile
  release(); await slowRead;
  assert.equal((await store.getSettings()).booking.enabled, false); // the next read sees the save, not the stale copy
});
await test('[R3] the country code must be a code, not text with digits in it', () => {
  const cur = buildDefaults().general;
  assert.ok(fieldErrors(() => normalizeGroup('general', { countryCode: 'abc91xyz' }, cur)).countryCode);
  assert.equal(normalizeGroup('general', { countryCode: '+44' }, cur).countryCode, '44');
});
await test('[R4] Google Maps links: only maps hosts, not any google.com subdomain', () => {
  const cur = buildDefaults().business;
  assert.ok(fieldErrors(() => normalizeGroup('business', { mapsUrl: 'https://sites.google.com/view/anything' }, cur)).mapsUrl);
  assert.equal(normalizeGroup('business', { mapsUrl: 'https://maps.app.goo.gl/abc123' }, cur).mapsUrl, 'https://maps.app.goo.gl/abc123');
  assert.equal(normalizeGroup('business', { mapsUrl: 'https://www.google.com/maps/place/Pune' }, cur).mapsUrl, 'https://www.google.com/maps/place/Pune');
});

console.log(`\n${count - failed} of ${count} passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed ? 1 : 0);
