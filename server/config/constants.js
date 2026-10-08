/**
 * Single source of truth for allowed values on the server.
 * These MUST match the lists in the frontend (components/booking/bookingData.js,
 * portfolioData.js, contactData.js). Change both together.
 */
export const SHOOT_TYPES = ['wedding', 'pre-wedding', 'portrait', 'events', 'commercial', 'custom'];
export const LOCATIONS = ['studio', 'outdoor', 'client', 'undecided'];
export const STYLES = ['Natural', 'Moody', 'Bright & Airy', 'Cinematic', 'Dark & Dramatic', 'Warm & Cozy', 'Minimal', 'Editorial'];
export const MAX_STYLES = 3;

export const PORTFOLIO_CATEGORIES = ['wedding', 'portrait', 'events', 'commercial', 'family', 'pre-wedding', 'landscape'];

export const MESSAGE_SUBJECTS = [...SHOOT_TYPES, 'general'];
export const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived'];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
/** A booking in one of these statuses occupies its time slot. */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed'];

export const BOOKING_RULES = { openHour: 7, closeHour: 21, maxAdvanceDays: 730 };

/** Why the photographer is unavailable on a day (or on some hours of a day) */
export const BLOCKED_DATE_TYPES = ['offline_booking', 'editing', 'vacation', 'personal', 'other'];
export const BLOCKED_DATE_LABELS = {
  offline_booking: 'Offline booking', // a job taken by phone / in person, not through the website
  editing: 'Editing',
  vacation: 'Vacation',
  personal: 'Personal',
  other: 'Other',
};

/** Which kind of shoot a package is for. 'general' = offered for every kind of shoot. */
export const PACKAGE_CATEGORIES = ['general', ...SHOOT_TYPES];

/** Shoot lengths are whole hours; each hour is one calendar slot. */
export const MAX_DURATION_HOURS = 12;
/** "Not sure yet / custom quote" bookings block this many hours until the admin adjusts them. */
export const CUSTOM_DURATION_HOURS = 2;

/**
 * Allowed booking status changes (the API enforces this; the admin screens mirror it in utils/bookingStatus.js).
 *   pending   -> confirmed | cancelled
 *   confirmed -> completed | cancelled
 *   completed -> (final)
 *   cancelled -> pending   ("reopen": only works while the time slot is still free)
 */
export const BOOKING_STATUS_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['pending'],
};
