/**
 * What the PUBLIC website knows from Admin → Settings (GET /api/settings/public), and the small pure helpers that turn it into
 * links, names and visibility switches. No React, no network.
 *
 * DEFAULT_SITE mirrors the server's defaults (server/utils/settingsSchema.js buildDefaults), so the site looks exactly as it
 * did before Settings existed while the settings load, and if they can never be loaded.
 */
export const DEFAULT_SITE = {
  general: {
    websiteName: 'Pratik Shelke Photography', photographerName: 'Pratik Shelke', logo: { url: '' }, favicon: { url: '' },
    currency: 'INR', countryCode: '91', timezone: 'Asia/Kolkata', dateFormat: 'D MMM YYYY', timeFormat: '12h',
  },
  business: {
    businessName: 'Pratik Shelke Photography', primaryPhone: '+91 84467 41308', whatsappNumber: '+91 84467 41308', email: 'pratik1238737@gmail.com',
    address: '', city: '', state: '', country: '', postalCode: '', mapsUrl: '',
    social: { instagram: 'https://www.instagram.com/pratikshelke_photography', facebook: '', youtube: '' },
  },
  booking: {
    enabled: true, disabledMessage: 'Online bookings are temporarily closed. Please contact us directly and we will help you.',
    allowSameDay: false, minAdvanceDays: 1, maxAdvanceDays: 730, customDurationHours: 2,
    phoneRequired: true, emailRequired: true, locationRequired: true, allowNotes: true, confirmationMessage: '',
  },
  website: {
    home: { featuredWork: true, services: true, aboutPreview: true, testimonials: true, contactCta: true },
    portfolio: { enabled: true },
    contact: { enabled: true, ctaText: '' },
  },
  seo: { title: 'Pratik Shelke - Photography', description: '', keywords: '', ogImage: { url: '' }, shareTitle: '', shareDescription: '', canonicalUrl: '' },
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Saved values laid over the defaults, key by key; a value of the wrong kind is ignored. Never throws. */
export function mergeSite(fetched, defaults = DEFAULT_SITE) {
  if (!isObject(defaults)) return fetched !== undefined && fetched !== null && typeof fetched === typeof defaults ? fetched : defaults;
  const out = {};
  for (const key of Object.keys(defaults)) out[key] = mergeSite(isObject(fetched) ? fetched[key] : undefined, defaults[key]);
  return out;
}

// ---------------------------------------------------------------- names
/**
 * "Pratik Shelke Photography" with photographer "Pratik Shelke" → logo "Pratik Shelke" over "Photography".
 * A website name that does not start with the photographer's name is shown whole.
 */
export function brandParts(general) {
  const site = (general?.websiteName || '').trim();
  const person = (general?.photographerName || '').trim();
  if (person && site.toLowerCase().startsWith(`${person.toLowerCase()} `)) return { name: site.slice(0, person.length), tagline: site.slice(person.length).trim() };
  return { name: site || person, tagline: '' };
}

// ---------------------------------------------------------------- contact links
export const phoneHref = (phone) => { const n = String(phone ?? '').replace(/[^\d+]/g, ''); return n ? `tel:${n}` : ''; };
export const mailHref = (email) => (email ? `mailto:${email}` : '');

/** The number written the way wa.me wants it: digits only, with the country code. A local number gets the saved country code. */
export function whatsappDigits(number, countryCode = '91') {
  let digits = String(number ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!String(number).trim().startsWith('+')) {
    if (digits.startsWith('0')) digits = `${countryCode}${digits.replace(/^0+/, '')}`;
    else if (digits.length <= 10) digits = `${countryCode}${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}
export const whatsappHref = (number, countryCode) => { const d = whatsappDigits(number, countryCode); return d ? `https://wa.me/${d}` : ''; };

/** The social links the photographer has filled in, in a fixed order. Empty ones are left out so there are no dead icons. */
export function socialLinks(business, general) {
  const wa = whatsappHref(business?.whatsappNumber || business?.primaryPhone, general?.countryCode);
  return [
    { key: 'instagram', label: 'Instagram', href: business?.social?.instagram },
    { key: 'whatsapp', label: 'WhatsApp', href: wa },
    { key: 'facebook', label: 'Facebook', href: business?.social?.facebook },
    { key: 'youtube', label: 'YouTube', href: business?.social?.youtube },
  ].filter((l) => l.href);
}

/** ['Mountain View Studio', 'Pune, Maharashtra 411001', 'India'] from whatever is filled in. [] when nothing is. */
export function addressLines(business) {
  const b = business ?? {};
  const cityLine = [[b.city, b.state].filter(Boolean).join(', '), b.postalCode].filter(Boolean).join(' ');
  return [b.address, cityLine, b.country].filter(Boolean);
}
export const hasAddress = (business) => addressLines(business).length > 0;

/** Where "Open in Google Maps" goes: the saved Maps link, else a search for the written address, else nothing. */
export function mapsLink(business) {
  if (business?.mapsUrl) return business.mapsUrl;
  const lines = addressLines(business);
  return lines.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.join(', '))}` : '';
}

// ---------------------------------------------------------------- what is switched on
export const DEFAULT_CTA = 'Book a shoot';
export const ctaText = (website) => (website?.contact?.ctaText || '').trim() || DEFAULT_CTA;

/** The menu: Portfolio and Contact disappear when switched off. Booking is the button, so it is not in this list. */
export function visibleNav(links, website) {
  return links.filter((l) => !((l.to === '/portfolio' && website?.portfolio?.enabled === false) || (l.to === '/contact' && website?.contact?.enabled === false)));
}

/** Home page blocks. Featured work needs the portfolio too: it would be an empty gap (and dead links) otherwise. */
export function homeBlocks(website) {
  const h = website?.home ?? {};
  return {
    aboutPreview: h.aboutPreview !== false,
    featuredWork: h.featuredWork !== false && website?.portfolio?.enabled !== false,
    services: h.services !== false,
    testimonials: h.testimonials !== false,
    contactCta: h.contactCta !== false,
  };
}

// ---------------------------------------------------------------- the booking form's rules
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Today in the business timezone as 'YYYY-MM-DD' (the same day the server counts from) */
export function todayIn(timezone, now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { return keyOf(now); }
}
export const addDaysTo = (key, n) => { const [y, m, d] = key.split('-').map(Number); return keyOf(new Date(Date.UTC(y, m - 1, d) + n * DAY)); };
/** The first and last date a customer may pick: { earliest, latest } as 'YYYY-MM-DD' */
export function bookingWindow(booking, timezone, now = new Date()) {
  const today = todayIn(timezone, now);
  return { earliest: addDaysTo(today, booking?.minAdvanceDays ?? 1), latest: addDaysTo(today, booking?.maxAdvanceDays ?? 730) };
}
