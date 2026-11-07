/**
 * Two admin settings that plain synchronous helpers need (the default country code for phone numbers, and the business timezone).
 * The settings store (utils/settings.js) fills this in every time settings are loaded or saved. Before that happens (or in a test
 * with no database) the helpers fall back to the .env values they always used, so nothing here is required to be set.
 */
const state = { countryCode: null, timezone: null };

export const getRuntimeConfig = () => ({ ...state });

export function setRuntimeConfig({ countryCode, timezone } = {}) {
  if (typeof countryCode === 'string' && /^[1-9]\d{0,2}$/.test(countryCode)) state.countryCode = countryCode;
  if (typeof timezone === 'string' && timezone) state.timezone = timezone;
}

/** For tests */
export const resetRuntimeConfig = () => { state.countryCode = null; state.timezone = null; };
