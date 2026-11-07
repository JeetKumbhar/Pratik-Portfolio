/**
 * Phone numbers for the Clients section. Pure functions: no database, no network.
 *
 * The CRM matches people by ONE canonical key: the number's digits WITH the country code and nothing else
 * ("919876543210"). That is exactly the format WhatsApp uses for a conversation, so a booking form number, a manual
 * entry and a WhatsApp sender all land on the same key when they are the same person.
 *
 *   "+91 98765 43210"   → 919876543210      "098765 43210"      → 919876543210  (leading 0 = national prefix, dropped)
 *   "98765-43210"       → 919876543210      "0091 98765 43210"  → 919876543210
 *   "+91 (0) 98765 43210" → 919876543210    "+91 123456" → null (an Indian number is 91 + 10 digits)
 *   "919876543210"      → 919876543210      "+1 (123) 456-7890" → 11234567890
 *
 * WHEN THE COUNTRY IS A GUESS: a 10-digit number typed without "+" or "00" has no country code, so we assume the
 * business's own country (CLIENT_DEFAULT_COUNTRY_CODE, else WHATSAPP_DEFAULT_COUNTRY_CODE, else 91 = India) and flag the
 * result with assumedCountry: true. A number of 11 to 15 digits without "+" is taken to already contain its country code.
 * A number that is too short to place (7 to 9 digits, no "+") is refused (null): guessing could attach a booking to the
 * wrong person, which is worse than leaving it unlinked.
 */
const E164_RE = /^[1-9]\d{7,14}$/;
const TYPED_RE = /^\+?[\d\s().-]+$/;
const NATIONAL_LENGTH = 10;

/** The country code used when a number is typed without one. Digits only, 1 to 3 long. */
export function defaultCountryCode(env = process.env) {
  const cc = String(env.CLIENT_DEFAULT_COUNTRY_CODE ?? env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91').replace(/\D/g, '');
  return /^[1-9]\d{0,2}$/.test(cc) ? cc : '91';
}

/**
 * Anything a person (or a form) typed → { phone: '919876543210', assumedCountry: boolean }, or null when it cannot be trusted.
 * assumedCountry is true only when WE added the country code.
 */
export function normalizeClientPhone(input, { countryCode = defaultCountryCode() } = {}) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const raw = String(input).trim();
  if (!TYPED_RE.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');

  let phone;
  let assumedCountry = false;
  if (raw.startsWith('+')) {
    phone = digits;
  } else if (digits.startsWith('00')) {
    phone = digits.replace(/^0+/, ''); // international call prefix
  } else {
    const national = digits.replace(/^0+/, ''); // a single leading 0 is the national trunk prefix
    if (national.length === NATIONAL_LENGTH) {
      phone = countryCode + national;
      assumedCountry = true;
    } else if (national.length > NATIONAL_LENGTH) {
      phone = national; // already carries a country code
    } else {
      return null; // 7 to 9 digits without a country code: cannot be placed safely
    }
  }
  // "+91 (0) 98765 43210": a trunk 0 typed after our own country code is not part of the number
  if (phone.startsWith(countryCode)) phone = countryCode + phone.slice(countryCode.length).replace(/^0+/, '');
  // Every number starting with 91 is Indian (91 + 10 digits). Anything else starting with 91 is a typo, and a typo must not become a client.
  if (phone.startsWith('91') && phone.length !== 12) return null;
  return E164_RE.test(phone) ? { phone, assumedCountry } : null;
}

/** Just the key (or null). */
export const toNormalizedPhone = (input, options) => normalizeClientPhone(input, options)?.phone ?? null;

/**
 * WhatsApp's own format (the sender's number, digits with country code) → the key, or null.
 * Never guesses a country: WhatsApp always sends the full number.
 */
export function normalizeWhatsAppPhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const digits = String(input).replace(/\D/g, '').replace(/^00/, '');
  return E164_RE.test(digits) ? digits : null;
}

/** "919876543210" → "+91 98765 43210" (Indian numbers are grouped 5+5, everything else is "+" and the digits). */
export function formatPhoneDisplay(normalized) {
  const d = String(normalized ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

/**
 * The last 10 digits. Two DIFFERENT keys that share this value (for example "+91 98765 43210" and "+1 98765 43210")
 * might be the same person typed with different country codes. The CRM never merges them by itself:
 * the backfill script only REPORTS them so a human can decide.
 */
export const nationalKey = (normalized) => String(normalized ?? '').slice(-NATIONAL_LENGTH);
