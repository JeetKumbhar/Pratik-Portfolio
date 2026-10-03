const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d][\d\s().-]{6,}$/;

export const MESSAGE_MAX = 500;

/** Returns an object of { field: 'error message' }. Empty object = valid. */
export function validateContact({ name, email, phone, subject, message }) {
  const errors = {};
  if (name.trim().length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (phone.trim() && !PHONE.test(phone.trim())) errors.phone = 'Enter a valid phone number.';
  if (!subject) errors.subject = 'Choose what this is about.';
  if (message.trim().length < 10) errors.message = 'Please write at least a short sentence (10+ characters).';
  return errors;
}
