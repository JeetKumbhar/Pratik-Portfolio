/**
 * Single source of truth for allowed values on the server.
 * These MUST match the lists in the frontend (components/booking/bookingData.js,
 * portfolioData.js, contactData.js). Change both together.
 */
export const SHOOT_TYPES = ['wedding', 'pre-wedding', 'portrait', 'baby-shoot', 'events', 'commercial', 'custom'];
export const LOCATIONS = ['studio', 'outdoor', 'client', 'undecided'];
export const STYLES = ['Natural', 'Moody', 'Bright & Airy', 'Cinematic', 'Dark & Dramatic', 'Warm & Cozy', 'Minimal', 'Editorial'];
export const MAX_STYLES = 3;

export const PORTFOLIO_CATEGORIES = ['wedding', 'portrait', 'events', 'commercial', 'family', 'pre-wedding', 'landscape', 'baby-shoot'];

export const MESSAGE_SUBJECTS = [...SHOOT_TYPES, 'general'];
export const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived'];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
/** A booking in one of these statuses occupies its time slot. */
export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed'];

export const BOOKING_RULES = { openHour: 7, closeHour: 21, maxAdvanceDays: 730 };

/**
 * Photography services are records in the database now (models/Service.js, managed in Admin → Settings). These six are only the
 * starting set, created once on first start. `slug` is the stable id stored on bookings (the same values SHOOT_TYPES always had).
 */
export const DEFAULT_SERVICES = [
  { slug: 'wedding', name: 'Weddings', description: 'Timeless wedding photography that captures every emotion and beautiful moment.' },
  { slug: 'pre-wedding', name: 'Pre-weddings', description: 'Beautiful pre-wedding shoots capturing the chemistry, love and story of couples.' },
  { slug: 'portrait', name: 'Portrait', description: 'Professional portraits for individuals, professionals and personal branding.' },
  { slug: 'baby-shoot', name: 'Baby-Shoots', description: 'Heartwarming baby photography capturing precious little moments.' },
  { slug: 'events', name: 'Events', description: 'Corporate events, parties and special occasions covered with care and creativity.' },
  { slug: 'commercial', name: 'Commercial', description: 'High-quality imagery for brands, products and marketing campaigns.' },
];
/** What a service / shoot-type id looks like (lowercase words joined by hyphens). Used instead of a fixed list, because the admin can add services. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 40;

/** Admin → Settings groups (one object each inside the single Setting document) */
export const SETTINGS_GROUPS = ['general', 'business', 'booking', 'availability', 'notifications', 'website', 'seo'];
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Why the photographer is unavailable on a day (or on some hours of a day) */
export const BLOCKED_DATE_TYPES = ['offline_booking', 'editing', 'vacation', 'personal', 'public_holiday', 'fully_booked', 'other'];
export const BLOCKED_DATE_LABELS = {
  offline_booking: 'Offline booking', // a job taken by phone / in person, not through the website
  editing: 'Editing',
  vacation: 'Vacation',
  personal: 'Personal',
  public_holiday: 'Public holiday',
  fully_booked: 'Fully booked',
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

/** WhatsApp notifications: the five events, and the life of one notification */
export const NOTIFICATION_EVENTS = [
  'booking_received_customer',
  'new_booking_admin',
  'booking_confirmed_customer',
  'booking_cancelled_customer',
  'new_message_admin',
];
// pending → sent (accepted by WhatsApp) → delivered (reached the phone) → read.  failed / skipped are the other endings.
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped'];

/** WhatsApp inbox (conversations with customers and the messages in them) */
export const WA_MESSAGE_TYPES = ['text', 'image', 'audio', 'video', 'document', 'location', 'sticker', 'contacts', 'interactive', 'unknown'];
export const WA_DIRECTIONS = ['incoming', 'outgoing'];
export const WA_CONVERSATION_STATUSES = ['open', 'closed'];
// received → counted (this message was added to the unread count, exactly once) → processed (conversation summary updated)
export const WA_PROCESSING_STATUSES = ['received', 'counted', 'processed'];
export const WA_DELIVERY_STATUSES = [
  'sent',
  'delivered',
  'read',
  'failed'
];

/** Clients (the admin CRM). One client per phone number. */
export const CLIENT_SOURCES = ['booking', 'whatsapp', 'manual']; // how the client first appeared
/** Where a client's CURRENT name came from, lowest to highest. A lower source never overwrites a higher one. */
export const CLIENT_NAME_SOURCES = ['placeholder', 'whatsapp', 'booking', 'manual'];
export const CLIENT_FILTERS = ['all', 'new', 'repeat', 'upcoming', 'none'];
export const CLIENT_SORTS = ['recent', 'oldest', 'lastBooking', 'mostBookings'];
export const CLIENT_BOOKING_FILTERS = ['all', 'upcoming', 'completed', 'cancelled'];
export const CLIENT_NOTE_MAX_LENGTH = 2000;
