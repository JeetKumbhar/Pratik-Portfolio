/**
 * Central frontend validation.
 *
 * Every validator returns an object { fieldName: 'message' }.
 * An empty object means the data is valid.
 *
 * Used by: PersonalDetails, ShootPreferences, DateTimePicker (each step),
 *          BookingReview (final check before submit), ContactForm.
 * The backend must repeat these checks: frontend validation is for UX, not security.
 */

// ---------------------------------------------------------------- rules
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  messageMin: 10,
  messageMax: 500,
  requestsMax: 500,
  peopleMin: 1,
  peopleMax: 50,
  stylesMax: 3,
};
export const MESSAGE_MAX = LIMITS.messageMax;

export const BOOKING_RULES = {
  openHour: 7, // first bookable slot 7:00 AM
  closeHour: 21, // last bookable slot 9:00 PM
  maxAdvanceDays: 730, // can't book more than ~2 years ahead
};

// ---------------------------------------------------------------- primitives
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

export const isEmail = (v) => {
  const s = String(v ?? '').trim();
  return s.length <= 254 && EMAIL_RE.test(s) && !s.includes('..');
};

/** Digits, spaces, + ( ) . - allowed; 7 to 15 digits in total (E.164 max is 15). */
export const isPhone = (v) => {
  const s = String(v ?? '').trim();
  if (!PHONE_CHARS_RE.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
};

/** 'YYYY-MM-DD' that is a real calendar date (rejects 2026-02-31). */
export const isDateKey = (v) => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const toDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };

export const isFutureDate = (key) => toDate(key) > startOfToday();

export const isWithinAdvance = (key) => {
  const limit = startOfToday();
  limit.setDate(limit.getDate() + BOOKING_RULES.maxAdvanceDays);
  return toDate(key) <= limit;
};

/** 'HH:MM' between opening and closing time. */
export const isBookableTime = (v) => {
  const match = TIME_RE.exec(String(v ?? ''));
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= BOOKING_RULES.openHour * 60 && minutes <= BOOKING_RULES.closeHour * 60;
};

const hasLetter = (s) => /\p{L}/u.test(s);

// ---------------------------------------------------------------- validators
export function validateName(name) {
  const s = String(name ?? '').trim();
  if (!s) return 'Please enter your full name.';
  if (s.length < LIMITS.nameMin || !hasLetter(s)) return 'Please enter your full name.';
  if (s.length > LIMITS.nameMax) return `Name must be ${LIMITS.nameMax} characters or fewer.`;
  return '';
}

export function validateEmail(email) {
  if (isBlank(email)) return 'Email address is required.';
  if (!isEmail(email)) return 'Enter a valid email address (like you@example.com).';
  return '';
}

export function validatePhone(phone, { required = true } = {}) {
  if (isBlank(phone)) return required ? 'Phone number is required.' : '';
  if (!isPhone(phone)) return 'Enter a valid phone number (7 to 15 digits, e.g. +1 123 456 7890).';
  return '';
}

/** Step 1 */
export function validateDetails({ name, email, phone }) {
  const errors = {};
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const phoneError = validatePhone(phone);
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (phoneError) errors.phone = phoneError;
  return errors;
}

/**
 * Step 2
 * options (all optional; used by the final check where the real lists are known):
 *   shootTypes: ['wedding', ...]   locations: ['studio', ...]   packageIds: ['essential', ..., 'custom']
 */
export function validatePreferences(values, options = {}) {
  const { shootType, location, people, styles = [], requests = '', packageId } = values;
  const { shootTypes, locations, packageIds } = options;
  const errors = {};

  if (isBlank(shootType)) errors.shootType = 'Choose a type of shoot.';
  else if (shootTypes && !shootTypes.includes(shootType)) errors.shootType = 'Choose a valid type of shoot.';

  if (isBlank(location)) errors.location = 'Choose where the shoot should take place.';
  else if (locations && !locations.includes(location)) errors.location = 'Choose a valid location option.';

  if (!Number.isInteger(people) || people < LIMITS.peopleMin || people > LIMITS.peopleMax) {
    errors.people = `Number of people must be between ${LIMITS.peopleMin} and ${LIMITS.peopleMax}.`;
  }

  if (styles.length > LIMITS.stylesMax) errors.styles = `Pick up to ${LIMITS.stylesMax} styles.`;
  if (String(requests).length > LIMITS.requestsMax) errors.requests = `Keep special requests under ${LIMITS.requestsMax} characters.`;

  if (isBlank(packageId)) errors.packageId = 'Choose a package, or "Not sure yet".';
  else if (packageIds && packageIds.length && !packageIds.includes(packageId)) {
    errors.packageId = 'That package is no longer available. Please choose again.';
  }

  return errors;
}

/** Step 3 */
export function validateDateTime({ date, time }) {
  const errors = {};

  if (isBlank(date)) errors.date = 'Pick a date.';
  else if (!isDateKey(date)) errors.date = 'Pick a valid date.';
  else if (!isFutureDate(date)) errors.date = 'Pick a date after today.';
  else if (!isWithinAdvance(date)) errors.date = 'That date is too far ahead to book yet. Pick an earlier one.';

  if (!errors.date) {
    if (isBlank(time)) errors.time = 'Pick a time.';
    else if (!isBookableTime(time)) errors.time = 'Pick a time between 7:00 AM and 9:00 PM.';
  }
  return errors;
}

/**
 * Whole booking, step by step. Used right before submitting and when a saved draft is restored.
 * Returns { isValid, errors: { 1: {...}, 2: {...}, 3: {...} }, firstInvalidStep: number | null }
 */
export function validateBooking(values, options = {}) {
  const errors = {
    1: validateDetails(values),
    2: validatePreferences(values, options),
    3: validateDateTime(values),
  };
  const firstInvalidStep = [1, 2, 3].find((step) => Object.keys(errors[step]).length > 0) ?? null;
  return { isValid: firstInvalidStep === null, errors, firstInvalidStep };
}

/** Contact form: phone is optional there. */
export function validateContact({ name, email, phone, subject, message }) {
  const errors = {};
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const phoneError = validatePhone(phone, { required: false });
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (phoneError) errors.phone = phoneError;
  if (isBlank(subject)) errors.subject = 'Choose what this is about.';

  const text = String(message ?? '').trim();
  if (text.length < LIMITS.messageMin) errors.message = `Please write at least ${LIMITS.messageMin} characters.`;
  else if (text.length > LIMITS.messageMax) errors.message = `Message must be ${LIMITS.messageMax} characters or fewer.`;

  return errors;
}
