import { httpError } from './httpError.js';
import { isEmail } from './validators.js';
import { formatPhoneDisplay, normalizeClientPhone } from './phone.js';
import { CLIENT_NOTE_MAX_LENGTH as NOTE_MAX_LENGTH } from '../config/constants.js';

/**
 * Checks what the admin sends when creating or editing a client or a note. Only plain text is accepted
 * (an object or array in a field is refused, which also keeps query-operator tricks out), and every problem is
 * reported per field: { errors: { phone: '...' } } with status 400.
 */
const NAME_MIN = 2;
export const NAME_MAX = 80;
export const CITY_MAX = 80;

const CONTROL_RE = /[\u0000-\u001f\u007f]+/g;
const oneLine = (s) => s.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();

const fail = (fieldErrors) => Object.assign(httpError(400, 'Please fix the highlighted fields.'), { fieldErrors });

/**
 * body → { values } with only the fields that were sent (when `partial`) or all of them (when creating).
 * values: { name, phone, normalizedPhone, email, city, notes }. Throws a 400 with per-field messages.
 */
export function parseClientInput(body, { partial = false } = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const values = {};
  const sent = (key) => Object.hasOwn(b, key) && b[key] !== undefined;

  if (sent('name') || !partial) {
    if (typeof b.name !== 'string' || !oneLine(b.name)) errors.name = 'Name is required.';
    else {
      const name = oneLine(b.name);
      if (name.length < NAME_MIN) errors.name = `Name must be at least ${NAME_MIN} characters.`;
      else if (name.length > NAME_MAX) errors.name = `Name must be ${NAME_MAX} characters or fewer.`;
      else values.name = name;
    }
  }

  if (sent('phone') || !partial) {
    if ((typeof b.phone !== 'string' && typeof b.phone !== 'number') || !String(b.phone).trim()) {
      errors.phone = 'Phone number is required.';
    } else {
      const parsed = normalizeClientPhone(b.phone);
      if (!parsed) errors.phone = 'Enter a valid phone number with its country code, like +91 98765 43210.';
      else {
        values.normalizedPhone = parsed.phone;
        values.phone = formatPhoneDisplay(parsed.phone);
        values.assumedCountry = parsed.assumedCountry;
      }
    }
  }

  if (sent('email')) {
    if (b.email === null) values.email = '';
    else if (typeof b.email !== 'string') errors.email = 'Email must be text.';
    else if (!b.email.trim()) values.email = '';
    else if (!isEmail(b.email)) errors.email = 'Enter a valid email address.';
    else values.email = b.email.trim().toLowerCase();
  }

  if (sent('city')) {
    if (b.city === null) values.city = '';
    else if (typeof b.city !== 'string') errors.city = 'City must be text.';
    else if (oneLine(b.city).length > CITY_MAX) errors.city = `City must be ${CITY_MAX} characters or fewer.`;
    else values.city = oneLine(b.city);
  }

  if (!partial && sent('notes') && b.notes !== null && b.notes !== '') {
    const notes = parseNoteBody(b.notes, 'notes', errors);
    if (notes) values.notes = notes;
  }

  if (Object.keys(errors).length) throw fail(errors);
  return { values };
}

/** A note's text: keeps line breaks, drops other control characters, 1 to NOTE_MAX_LENGTH characters. */
function parseNoteBody(raw, field, errors) {
  if (typeof raw !== 'string') { errors[field] = 'A note must be text.'; return null; }
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, '').trim();
  if (!text) { errors[field] = 'Write something first.'; return null; }
  if (text.length > NOTE_MAX_LENGTH) { errors[field] = `A note can be at most ${NOTE_MAX_LENGTH} characters.`; return null; }
  return text;
}

/** { body } → the cleaned text, or a 400 */
export function parseNoteInput(body) {
  const errors = {};
  const text = parseNoteBody(body && typeof body === 'object' ? body.body : undefined, 'body', errors);
  if (Object.keys(errors).length) throw fail(errors);
  return text;
}
