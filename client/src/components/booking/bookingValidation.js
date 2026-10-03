const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d][\d\s().-]{6,}$/;

export const validateDetails = ({ name, email, phone }) => {
  const e = {};
  if (name.trim().length < 2) e.name = 'Please enter your full name.';
  if (!EMAIL.test(email.trim())) e.email = 'Enter a valid email address.';
  if (!PHONE.test(phone.trim())) e.phone = 'Enter a valid phone number.';
  return e;
};

export const validatePreferences = ({ shootType, location, people, packageId }) => {
  const e = {};
  if (!shootType) e.shootType = 'Choose a type of shoot.';
  if (!location) e.location = 'Choose where the shoot should take place.';
  if (!(people >= 1)) e.people = 'At least 1 person.';
  if (!packageId) e.packageId = 'Choose a package, or "Not sure yet".';
  return e;
};

export const validateDateTime = ({ date, time }) => {
  const e = {};
  if (!date) e.date = 'Pick a date.';
  else if (!time) e.time = 'Pick a time.';
  return e;
};
