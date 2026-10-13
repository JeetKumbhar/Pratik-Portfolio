/** Form helpers for the package editor. Pure functions, no React. */
export const MAX_FEATURES = 15;
export const MAX_FEATURE_LENGTH = 100;

/** The editor shows features as one line each; the API wants a list. */
export const featuresToText = (features = []) => features.join('\n');
export const textToFeatures = (text = '') => text.split('\n').map((line) => line.trim()).filter(Boolean);

/** "2 hours" → 2 · "Up to 6 hours" → 6 · "90 minutes" → 2 · "45 min" → 1 · "Full day" → undefined (you choose) */
export function guessHours(duration = '') {
  const match = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i.exec(duration);
  if (!match) return undefined;
  const amount = parseFloat(match[1]);
  const hours = Math.ceil(/^m/i.test(match[2]) ? amount / 60 : amount);
  return hours >= 1 && hours <= 12 ? hours : undefined;
}

const isWhole = (value) => /^\d+$/.test(String(value).trim());

/** → { field: 'message' }; empty object = fine to send. The server checks everything again. */
export function validatePackageForm(form) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Give the package a name.';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const price = String(form.price).trim();
  if (price === '' || Number.isNaN(Number(price))) errors.price = 'Enter a price (numbers only).';
  else if (Number(price) < 0) errors.price = 'The price cannot be negative.';
  else if (Number(price) > 1000000) errors.price = 'That price is too high.';

  const duration = form.duration.trim();
  if (!duration) errors.duration = 'Describe how long it lasts, e.g. "2 hours".';
  else if (duration.length > 40) errors.duration = 'Keep it under 40 characters.';

  const hours = Number(form.durationHours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 12) errors.durationHours = 'Choose 1 to 12 hours.';

  if (!form.category) errors.category = 'Choose a category.';
  if (form.description.trim().length > 200) errors.description = 'Keep the description under 200 characters.';

  const features = textToFeatures(form.featuresText);
  if (features.length > MAX_FEATURES) errors.featuresText = `At most ${MAX_FEATURES} lines.`;
  else if (features.some((f) => f.length > MAX_FEATURE_LENGTH)) errors.featuresText = `Each line can be up to ${MAX_FEATURE_LENGTH} characters.`;

  if (String(form.sortOrder).trim() !== '' && !isWhole(form.sortOrder)) errors.sortOrder = 'Use a whole number (1 shows first), or leave empty.';
  return errors;
}

/** The form's text values → what the API expects */
export function toPayload(form) {
  const payload = {
    name: form.name.trim(),
    price: Number(form.price),
    duration: form.duration.trim(),
    durationHours: Number(form.durationHours),
    category: form.category,
    description: form.description.trim(),
    features: textToFeatures(form.featuresText),
    popular: form.popular,
    active: form.active,
  };
  if (String(form.sortOrder).trim() !== '') payload.sortOrder = Number(form.sortOrder);
  return payload;
}
