/**
 * npm run test:settings
 * Pure frontend logic of the Settings feature: formatting (currency, date, time) and the Settings screen helpers.
 * No browser, no network. (The screens themselves are checked by `npm run build` and the mocked-API browser check.)
 */
import assert from 'node:assert/strict';
import { formatDateKey, formatDateTime, formatMoney, formatTimeKey, DEFAULT_FORMAT } from '../src/utils/siteFormat.js';
import * as U from '../src/utils/settingsUtils.js';
import * as S from '../src/utils/siteSettings.js';
import * as V from '../src/utils/validation.js';
import { buildHead, canonicalFor } from '../src/utils/seoHead.js';

let failed = 0; let count = 0;
const test = (name, fn) => { count += 1; try { fn(); console.log(`PASS  ${name}`); } catch (e) { failed += 1; console.log(`FAIL  ${name}\n      ${String(e.stack).split('\n').slice(0, 5).join('\n      ')}`); } };

test('money: rupees use Indian grouping; other currencies work; junk is empty', () => {
  assert.equal(formatMoney(1200).replace(/\s/g, ' '), '₹1,200');
  assert.equal(formatMoney(150000).replace(/\s/g, ' '), '₹1,50,000');
  assert.equal(formatMoney(1500, 'USD'), '$1,500');
  assert.equal(formatMoney(1500, 'EUR'), '€1,500');
  for (const bad of [null, undefined, '', 'abc', NaN]) assert.equal(formatMoney(bad), '');
  assert.ok(formatMoney(5, 'ZZZ').includes('5')); // an unknown currency code never throws
});
test('dates: the four formats, and invalid dates are empty', () => {
  assert.equal(formatDateKey('2026-11-05'), '5 Nov 2026');
  assert.equal(formatDateKey('2026-11-05', 'DD/MM/YYYY'), '05/11/2026');
  assert.equal(formatDateKey('2026-11-05', 'MM/DD/YYYY'), '11/05/2026');
  assert.equal(formatDateKey('2026-11-05', 'YYYY-MM-DD'), '2026-11-05');
  assert.equal(formatDateKey('2026-11-05', 'nonsense'), '5 Nov 2026');
  for (const bad of ['', null, '2026-02-30', '2026-13-01', 'x', '5 Nov 2026']) assert.equal(formatDateKey(bad), '');
  assert.equal(formatDateKey('2024-02-29'), '29 Feb 2024');
});
test('times: 12-hour and 24-hour, midnight and noon, invalid is empty', () => {
  assert.equal(formatTimeKey('15:30'), '3:30 pm'); assert.equal(formatTimeKey('07:00'), '7:00 am');
  assert.equal(formatTimeKey('12:00'), '12:00 pm'); assert.equal(formatTimeKey('00:00'), '12:00 am');
  assert.equal(formatTimeKey('15:30', '24h'), '15:30'); assert.equal(formatTimeKey('7:05', '24h'), '07:05');
  for (const bad of ['', null, '25:00', '10:60', 'noon']) assert.equal(formatTimeKey(bad), '');
  assert.equal(formatDateTime('2026-11-05', '10:00', { ...DEFAULT_FORMAT, timeFormat: '24h' }), '5 Nov 2026 at 10:00');
  assert.equal(formatDateTime('2026-11-05', ''), '5 Nov 2026');
});
test('sections: nine, in order, and unknown keys fall back to the first', () => {
  assert.deepEqual(U.SECTIONS.map((s) => s.key), ['general', 'business', 'booking', 'services', 'availability', 'notifications', 'website', 'seo', 'account']);
  assert.equal(U.sectionKeyOf('seo'), 'seo'); assert.equal(U.sectionKeyOf('hack'), 'general'); assert.equal(U.sectionKeyOf(undefined), 'general');
});
test('isEqual ignores key order; setIn copies and never mutates; unsafe keys are refused', () => {
  assert.ok(U.isEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!U.isEqual({ a: 1 }, { a: 2 })); assert.ok(!U.isEqual({ a: [1, 2] }, { a: [2, 1] }));
  const orig = { social: { instagram: 'a', facebook: 'b' } };
  const next = U.setIn(orig, 'social.instagram', 'z');
  assert.equal(next.social.instagram, 'z'); assert.equal(orig.social.instagram, 'a'); assert.equal(next.social.facebook, 'b');
  assert.deepEqual(U.setIn({}, 'a.b.c', 1), { a: { b: { c: 1 } } });
  U.setIn({}, '__proto__.polluted', 1); assert.equal({}.polluted, undefined);
});
test('errors: server field errors are kept; clearing one field clears its children', () => {
  const e = U.errorsFrom({ message: 'Validation failed', errors: { 'social.instagram': 'Must start with https://', email: 'Bad' } });
  assert.equal(e.fields['social.instagram'], 'Must start with https://'); assert.match(e.message, /highlighted fields/);
  assert.equal(U.errorsFrom({ message: 'Server down' }).message, 'Server down');
  assert.deepEqual(U.withoutError({ 'weekly.monday': 'x', 'weekly.tuesday': 'y', weekly: 'z' }, 'weekly.monday'), { 'weekly.tuesday': 'y', weekly: 'z' });
  assert.deepEqual(U.withoutError({ 'social.instagram': 'x', 'social.facebook': 'y' }, 'social'), {});
});
test('periods: valid, overlapping, reversed, out of range, too many', () => {
  const P = (...a) => a.map(([start, end]) => ({ start, end }));
  assert.equal(U.periodsProblem(P(['09:00', '12:00'], ['14:00', '18:00'])), '');
  assert.equal(U.periodsProblem(P(['09:00', '12:00'], ['12:00', '15:00'])), ''); // touching is fine
  assert.match(U.periodsProblem(P(['09:00', '13:00'], ['12:00', '15:00'])), /overlap/);
  assert.match(U.periodsProblem(P(['12:00', '09:00'])), /end after/);
  assert.match(U.periodsProblem(P(['06:00', '09:00'])), /between/); assert.match(U.periodsProblem(P(['09:30', '12:00'])), /whole hours/);
  assert.match(U.periodsProblem(Array.from({ length: 5 }, () => ({ start: '09:00', end: '10:00' }))), /at most 4/);
  assert.equal(U.periodsProblem([]), '');
});
test('next period starts after the last one and stays inside the day', () => {
  assert.deepEqual(U.nextPeriod([]), { start: '09:00', end: '12:00' });
  assert.deepEqual(U.nextPeriod([{ start: '09:00', end: '12:00' }]), { start: '13:00', end: '16:00' });
  assert.deepEqual(U.nextPeriod([{ start: '09:00', end: '21:00' }]), { start: '21:00', end: '22:00' });
});
test('copying a day copies its hours to the chosen days only (deep copy)', () => {
  const weekly = { monday: { enabled: true, periods: [{ start: '10:00', end: '14:00' }] }, tuesday: { enabled: false, periods: [] }, wednesday: { enabled: true, periods: [{ start: '07:00', end: '22:00' }] } };
  const next = U.copyDay(weekly, 'monday', ['tuesday', 'monday', 'nonsense']);
  assert.deepEqual(next.tuesday, weekly.monday); assert.notEqual(next.tuesday.periods[0], weekly.monday.periods[0]);
  assert.deepEqual(next.wednesday, weekly.wednesday); assert.equal(next.nonsense, undefined);
  assert.equal(U.describeDay(weekly.monday), '10:00 – 14:00'); assert.equal(U.describeDay(weekly.tuesday), 'Closed');
});
test('images: type and size are checked before uploading', () => {
  const ok = { type: 'image/png', size: 1000 };
  assert.equal(U.imageProblem(ok), '');
  assert.match(U.imageProblem({ type: 'image/gif', size: 10 }), /JPG, PNG or WebP/);
  assert.match(U.imageProblem({ type: 'image/png', size: 6 * 1024 * 1024 }), /larger than 5 MB/);
  assert.match(U.imageProblem(null), /Choose/);
});
test('timezone helpers always include the current value', () => {
  assert.ok(U.timezoneOptions('Mars/Base').includes('Mars/Base')); assert.ok(U.timezoneOptions('Asia/Kolkata').includes('Asia/Kolkata'));
  assert.match(U.timezoneLabel('Asia/Kolkata', new Date('2026-11-05T00:00:00Z')), /Asia\/Kolkata \(UTC\+5:30\)/);
  assert.equal(U.timezoneLabel('Nope/Zone'), 'Nope/Zone');
  assert.equal(U.countryDigits('+91'), '91');
});

test('site settings: a missing or wrong-typed answer falls back to the defaults', () => {
  assert.deepEqual(S.mergeSite(undefined), S.DEFAULT_SITE); assert.deepEqual(S.mergeSite(null), S.DEFAULT_SITE); assert.deepEqual(S.mergeSite('x'), S.DEFAULT_SITE);
  const m = S.mergeSite({ business: { email: 'a@b.co', social: { youtube: 'https://youtube.com/x' } }, booking: { enabled: 'no', minAdvanceDays: 3 }, extra: 1 });
  assert.equal(m.business.email, 'a@b.co'); assert.equal(m.business.social.youtube, 'https://youtube.com/x');
  assert.equal(m.business.social.instagram, S.DEFAULT_SITE.business.social.instagram);
  assert.equal(m.booking.enabled, true); assert.equal(m.booking.minAdvanceDays, 3); assert.equal(m.extra, undefined);
});
test('brand: the logo splits "Name Photography" into name and tagline; other names are shown whole', () => {
  assert.deepEqual(S.brandParts({ websiteName: 'Pratik Shelke Photography', photographerName: 'Pratik Shelke' }), { name: 'Pratik Shelke', tagline: 'Photography' });
  assert.deepEqual(S.brandParts({ websiteName: 'Lumen Studio', photographerName: 'Pratik Shelke' }), { name: 'Lumen Studio', tagline: '' });
  assert.deepEqual(S.brandParts({ websiteName: '', photographerName: 'Pratik' }), { name: 'Pratik', tagline: '' });
});
test('WhatsApp links: country code handling, junk gives nothing', () => {
  assert.equal(S.whatsappHref('+91 84467 41308'), 'https://wa.me/918446741308');
  assert.equal(S.whatsappHref('84467 41308', '91'), 'https://wa.me/918446741308');
  assert.equal(S.whatsappHref('084467 41308', '91'), 'https://wa.me/918446741308');
  assert.equal(S.whatsappHref('0091 84467 41308'), 'https://wa.me/918446741308');
  assert.equal(S.whatsappHref('+44 7700 900123'), 'https://wa.me/447700900123');
  for (const bad of ['', null, 'abc', '+1', '+9999999999999999999']) assert.equal(S.whatsappHref(bad), '');
  assert.equal(S.phoneHref('+91 84467 41308'), 'tel:+918446741308'); assert.equal(S.phoneHref(''), ''); assert.equal(S.mailHref(''), '');
});
test('social links: only the filled-in ones, WhatsApp comes from the number', () => {
  const l = S.socialLinks(S.DEFAULT_SITE.business, S.DEFAULT_SITE.general);
  assert.deepEqual(l.map((x) => x.key), ['instagram', 'whatsapp']);
  const all = S.socialLinks({ ...S.DEFAULT_SITE.business, social: { instagram: 'https://i', facebook: 'https://f', youtube: 'https://y' } }, S.DEFAULT_SITE.general);
  assert.deepEqual(all.map((x) => x.key), ['instagram', 'whatsapp', 'facebook', 'youtube']);
  assert.deepEqual(S.socialLinks({ whatsappNumber: '', primaryPhone: '', social: {} }, {}), []);
});
test('address: lines from what is filled in; maps link prefers the saved one', () => {
  assert.deepEqual(S.addressLines({ address: '12 MG Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' }), ['12 MG Road', 'Pune, Maharashtra 411001', 'India']);
  assert.deepEqual(S.addressLines({ city: 'Pune' }), ['Pune']); assert.deepEqual(S.addressLines({}), []); assert.ok(!S.hasAddress(S.DEFAULT_SITE.business));
  assert.equal(S.mapsLink({ mapsUrl: 'https://maps.app.goo.gl/abc', city: 'Pune' }), 'https://maps.app.goo.gl/abc');
  assert.match(S.mapsLink({ city: 'Pune & Co' }), /query=Pune%20%26%20Co$/); assert.equal(S.mapsLink({}), '');
});
test('visibility: Portfolio and Contact leave the menu; featured work needs the portfolio; CTA text falls back', () => {
  const links = [{ to: '/' }, { to: '/portfolio' }, { to: '/contact' }, { to: '/about' }];
  assert.equal(S.visibleNav(links, S.DEFAULT_SITE.website).length, 4);
  assert.deepEqual(S.visibleNav(links, { portfolio: { enabled: false }, contact: { enabled: true } }).map((l) => l.to), ['/', '/contact', '/about']);
  assert.deepEqual(S.visibleNav(links, { portfolio: { enabled: false }, contact: { enabled: false } }).map((l) => l.to), ['/', '/about']);
  assert.ok(Object.values(S.homeBlocks(S.DEFAULT_SITE.website)).every(Boolean));
  assert.equal(S.homeBlocks({ home: { featuredWork: true }, portfolio: { enabled: false } }).featuredWork, false);
  assert.equal(S.homeBlocks({ home: { testimonials: false }, portfolio: { enabled: true } }).testimonials, false);
  assert.equal(S.ctaText(S.DEFAULT_SITE.website), 'Book a shoot'); assert.equal(S.ctaText({ contact: { ctaText: '  Plan my shoot ' } }), 'Plan my shoot');
});
test('booking window follows the business timezone and the saved min/max days', () => {
  const now = new Date('2026-11-04T20:00:00Z'); // 01:30 on the 5th in India, still the 4th in London
  assert.equal(S.todayIn('Asia/Kolkata', now), '2026-11-05'); assert.equal(S.todayIn('Europe/London', now), '2026-11-04');
  assert.deepEqual(S.bookingWindow({ minAdvanceDays: 1, maxAdvanceDays: 30 }, 'Asia/Kolkata', now), { earliest: '2026-11-06', latest: '2026-12-05' });
  assert.equal(S.bookingWindow({ minAdvanceDays: 0, maxAdvanceDays: 5 }, 'Asia/Kolkata', now).earliest, '2026-11-05');
  assert.equal(S.addDaysTo('2026-12-31', 1), '2027-01-01'); assert.equal(S.addDaysTo('2024-02-28', 2), '2024-03-01');
});

// ---------------------------------------------------------------- booking rules in the form's validation
test('validation: optional phone/email/location may be empty, but a typed value must still be valid', () => {
  const rules = { emailRequired: false, phoneRequired: false, locationRequired: false };
  assert.deepEqual(V.validateDetails({ name: 'Asha Rao', email: '', phone: '' }, rules), {});
  assert.ok(V.validateDetails({ name: 'Asha Rao', email: 'nope', phone: '' }, rules).email);
  assert.ok(V.validateDetails({ name: 'Asha Rao', email: '', phone: '12' }, rules).phone);
  assert.ok(V.validateDetails({ name: 'Asha Rao', email: '', phone: '' }).email && V.validateDetails({ name: 'Asha Rao', email: '', phone: '' }).phone); // no rules = everything required, as before
  const prefs = { shootType: 'wedding', location: '', people: 2, styles: [], requests: '', packageId: 'custom' };
  assert.equal(V.validatePreferences(prefs, { rules }).location, undefined);
  assert.ok(V.validatePreferences(prefs, {}).location);
  assert.ok(V.validatePreferences({ ...prefs, location: 'moon' }, { rules, locations: ['studio'] }).location);
});
test('validation: the saved notice period decides which dates can be picked', () => {
  const base = { today: '2026-11-05', minAdvanceDays: 3, maxAdvanceDays: 30 };
  assert.ok(V.validateDateTime({ date: '2026-11-07', time: '10:00' }, base).date); // 2 days ahead, needs 3
  assert.deepEqual(V.validateDateTime({ date: '2026-11-08', time: '10:00' }, base), {});
  assert.ok(V.validateDateTime({ date: '2026-12-06', time: '10:00' }, base).date); // 31 days ahead
  assert.deepEqual(V.validateDateTime({ date: '2026-11-05', time: '10:00' }, { ...base, minAdvanceDays: 0 }), {}); // same-day allowed
  assert.ok(V.validateDateTime({ date: '2026-11-05', time: '10:00' }, { ...base, minAdvanceDays: 1 }).date);
  assert.ok(V.validateDateTime({ date: '2026-02-30', time: '10:00' }, base).date);
});
test('validation: validateBooking passes the rules through every step', () => {
  const values = { name: 'Asha Rao', email: '', phone: '', shootType: 'wedding', location: '', people: 2, styles: [], requests: '', packageId: 'custom', date: '2026-11-20', time: '10:00' };
  const rules = { emailRequired: false, phoneRequired: false, locationRequired: false, minAdvanceDays: 1, maxAdvanceDays: 100, today: '2026-11-05' };
  assert.equal(V.validateBooking(values, { rules }).isValid, true);
  assert.equal(V.validateBooking(values, {}).isValid, false);
});

// ---------------------------------------------------------------- page head (SEO)
test('seo: the saved defaults are used, and the page keeps its own values when it sets them', () => {
  const settings = { general: { websiteName: 'Pratik Shelke Photography', favicon: { url: 'https://img/f.png' } }, seo: { title: 'Pratik – Photographer', description: 'Weddings in Pune', keywords: 'wedding, pune', ogImage: { url: 'https://img/og.jpg' }, shareTitle: '', shareDescription: 'Share text', canonicalUrl: 'https://pratik.example/' } };
  const h = buildHead(settings, {}, '/services');
  assert.equal(h.title, 'Pratik – Photographer'); assert.equal(h.description, 'Weddings in Pune'); assert.equal(h.canonical, 'https://pratik.example/services');
  assert.equal(h.og.title, 'Pratik – Photographer'); assert.equal(h.og.description, 'Share text'); assert.equal(h.og.image, 'https://img/og.jpg'); assert.equal(h.twitter.card, 'summary_large_image'); assert.equal(h.favicon, 'https://img/f.png');
  const own = buildHead(settings, { title: 'Wedding photography', description: 'Own text' }, '/');
  assert.equal(own.title, 'Wedding photography'); assert.equal(own.description, 'Own text'); assert.equal(own.og.title, 'Wedding photography'); assert.equal(own.og.description, 'Own text'); assert.equal(own.canonical, 'https://pratik.example');
});
test('seo: nothing saved → the website name, and no empty tags', () => {
  const h = buildHead({ general: { websiteName: 'My Studio' }, seo: {} }, {}, '/');
  assert.equal(h.title, 'My Studio'); assert.equal(h.description, ''); assert.equal(h.canonical, ''); assert.equal(h.og.image, ''); assert.equal(h.twitter.card, 'summary');
  assert.equal(buildHead(undefined, undefined, '/').title, '');
});
test('seo: canonical address needs a real http(s) base and drops trailing slashes', () => {
  assert.equal(canonicalFor('pratik.example', '/a'), ''); assert.equal(canonicalFor('javascript:alert(1)', '/a'), '');
  assert.equal(canonicalFor('https://x.com///', '/portfolio/'), 'https://x.com/portfolio'); assert.equal(canonicalFor('http://x.com', '/'), 'http://x.com');
});

console.log(`\n${count - failed} of ${count} passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed ? 1 : 0);
