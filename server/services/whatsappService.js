/**
 * Talks to the official WhatsApp Business Platform (Cloud API). Nothing here touches the database.
 * The access token only ever lives in the server's environment: it is never sent to the browser, never logged,
 * and is scrubbed out of every error message before it leaves this file.
 *
 * .env:  WHATSAPP_ACCESS_TOKEN  WHATSAPP_PHONE_NUMBER_ID  WHATSAPP_API_VERSION  (+ WHATSAPP_BUSINESS_ACCOUNT_ID, used by the setup scripts)
 *        PHOTOGRAPHER_WHATSAPP_NUMBER  WHATSAPP_TEMPLATE_LANGUAGE (default "en")  WHATSAPP_DEFAULT_COUNTRY_CODE (optional)
 */
const env = () => ({
  token: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  version: process.env.WHATSAPP_API_VERSION,
  language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
  defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE,
});

const VERSION_RE = /^v\d+\.\d+$/;

export const isConfigured = () => {
  const c = env();
  return Boolean(c.token && c.phoneNumberId && VERSION_RE.test(c.version ?? ''));
};

// ---------------------------------------------------------------- phone numbers
const validE164 = (digits) => (/^[1-9]\d{7,14}$/.test(digits) ? digits : null);

/**
 * A number someone typed in a form → WhatsApp's format (country code + number, digits only), or null when it cannot be trusted.
 *   "+1 (123) 456-7890" → "11234567890"          "0044 7911 123456" → "447911123456"
 * Without a "+" (or 00) we cannot know the country, so we refuse to guess, UNLESS WHATSAPP_DEFAULT_COUNTRY_CODE is set and the
 * number looks national (7-10 digits). Messaging the wrong stranger would be worse than not messaging at all.
 */
export function normalizePhone(input, defaultCountryCode = env().defaultCountryCode) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return validE164(digits);
  if (digits.startsWith('00')) return validE164(digits.slice(2));

  const cc = String(defaultCountryCode ?? '').replace(/\D/g, '');
  if (!cc) return null;
  const national = digits.replace(/^0+/, '');
  if (national.length < 7 || national.length > 10) return null; // longer numbers without "+" are ambiguous
  return validE164(cc + national);
}

/** The photographer's own number from .env: digits with the country code ("919876543210"), a leading + is fine. */
export function normalizeInternational(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  return validE164(String(input).replace(/\D/g, '').replace(/^00/, ''));
}

/** What is set up and what is missing (names only, never values): for the admin screen and the setup scripts */
export function configStatus() {
  const c = env();
  const missing = [];
  if (!c.token) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!c.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!VERSION_RE.test(c.version ?? '')) missing.push('WHATSAPP_API_VERSION (like v25.0)');
  const photographerNumberSet = Boolean(normalizeInternational(process.env.PHOTOGRAPHER_WHATSAPP_NUMBER));
  if (!photographerNumberSet) missing.push('PHOTOGRAPHER_WHATSAPP_NUMBER (with country code)');
  return {
    configured: isConfigured(),
    photographerNumberSet,
    webhook: { appSecretSet: Boolean(process.env.WHATSAPP_APP_SECRET), verifyTokenSet: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) },
    missing,
  };
}

// ---------------------------------------------------------------- errors
export class WhatsAppError extends Error {
  /** `safeMessage` is fine to store and show to the admin: it never contains the token */
  constructor(safeMessage, { code = 'unknown', httpStatus, retryable = false } = {}) {
    super(safeMessage);
    this.name = 'WhatsAppError';
    this.safeMessage = safeMessage;
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

const KNOWN_ERRORS = {
  190: 'The access token is invalid or has expired. Create a new permanent token (System User) in Meta Business Settings.',
  131030: 'That number is not on the allowed recipient list. While your app is in test mode, add it under WhatsApp > API Setup.',
  131026: 'WhatsApp could not deliver to that number (it may not use WhatsApp, or it blocked business messages).',
  131042: 'WhatsApp payment problem: add a payment method in WhatsApp Manager.',
  131047: 'More than 24 hours since the customer last wrote: only approved templates can be sent.',
  130429: 'WhatsApp rate limit reached. It will work again shortly.',
  132000: 'The number of template parameters does not match the approved template.',
  132001: 'The template does not exist (or is not approved) for that language. Check its name and language in WhatsApp Manager.',
  132005: 'The translated template text is too long.',
  132012: 'A template parameter has the wrong format.',
  132015: 'The template is paused because of poor quality feedback.',
  132016: 'The template is disabled.',
  132018: 'A template parameter contains line breaks, tabs or too many spaces.',
};

function explain(code, message, token) {
  if (KNOWN_ERRORS[code]) return KNOWN_ERRORS[code];
  let text = String(message ?? 'WhatsApp rejected the message.');
  if (token) text = text.split(token).join('[hidden]'); // the token must never end up in a log or the database
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

// ---------------------------------------------------------------- sending
/**
 * Sends ONE approved template message. Resolves { messageId } when WhatsApp ACCEPTS it.
 * Accepted is not delivered: delivery is reported later by the webhook.
 * Throws WhatsAppError (with `retryable`) otherwise.
 */
export async function sendTemplate({ to, template, language, params = [] }) {
  const c = env();
  if (!isConfigured()) throw new WhatsAppError('WhatsApp is not configured on the server.', { code: 'not_configured' });

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: language || c.language },
      components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : [],
    },
  };

  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new WhatsAppError('Could not reach WhatsApp (network problem or timeout).', { code: 'network', retryable: true });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new WhatsAppError(explain(e.code, e.message, c.token), {
      code: e.code ?? res.status,
      httpStatus: res.status,
      retryable: res.status >= 500 || res.status === 429 || e.code === 130429,
    });
  }

  const messageId = data?.messages?.[0]?.id;
  if (!messageId) throw new WhatsAppError('WhatsApp accepted the request but returned no message id.', { code: 'no_message_id', httpStatus: res.status });
  return { messageId };
}

/** For the setup check: is the token valid and which number does it control? */
export async function getPhoneNumberInfo() {
  const c = env();
  if (!isConfigured()) throw new WhatsAppError('WhatsApp is not configured on the server.', { code: 'not_configured' });
  let res;
  try {
    res = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new WhatsAppError('Could not reach WhatsApp (network problem or timeout).', { code: 'network', retryable: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new WhatsAppError(explain(data?.error?.code, data?.error?.message, c.token), { code: data?.error?.code ?? res.status, httpStatus: res.status });
  return data;
}
