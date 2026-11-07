import { Booking, Package } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { isDateKey } from '../utils/validators.js';
import { BOOKING_STATUSES, BOOKING_STATUS_FLOW, ACTIVE_BOOKING_STATUSES, SLUG_MAX, SLUG_RE } from '../config/constants.js';
import { SLOT_TIMES, isBookableDate, isSlotFree } from '../utils/availability.js';
import { sendBookingReceived, sendStatusEmail } from '../utils/bookingEmails.js';
import { notifyBookingCreated, notifyBookingStatusChanged } from '../utils/notificationHelper.js';
import { computeBookingStats } from '../utils/bookingStats.js';
import { safeLinkBooking } from '../utils/clients.js';
import { getSettings } from '../utils/settings.js';
import { findService } from '../utils/services.js';

// ---------------------------------------------------------------- helpers
const str = (v) => (typeof v === 'string' ? v : undefined);
const num = (v) => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) ? n : undefined; };
const strArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Not sure yet" bookings last as long as Admin → Settings → Booking says (default 2 hours) */
const customPackage = (settings) => ({ slug: 'custom', name: 'Not sure yet', price: null, duration: 'To be discussed', durationHours: settings.booking.customDurationHours });

/** A 400 with a message under one field, like Mongoose validation errors */
const fieldError = (field, message) => Object.assign(httpError(400, 'Validation failed'), { fieldErrors: { [field]: message } });

/** The package snapshot always comes from the database. A price sent by the browser is ignored. */
async function resolvePackage(slug, settings) {
  if (!slug) throw httpError(400, 'Please choose a package.');
  if (slug === 'custom') return customPackage(settings);
  const pkg = await Package.findOne({ slug: slug.toLowerCase(), active: true });
  if (!pkg) throw httpError(400, 'That package is not available. Please choose another.');
  return { packageId: pkg._id, slug: pkg.slug, name: pkg.name, price: pkg.price, duration: pkg.duration, durationHours: pkg.durationHours };
}

// accepts the frontend's names too: { package: { id } } or { packageId }
const packageSlugFrom = (b) => str(b.package?.id) ?? str(b.package?.slug) ?? str(b.packageId) ?? str(b.package);

async function findBooking(id, { withNotes = false } = {}) {
  const query = /^[a-f\d]{24}$/i.test(id) ? Booking.findById(id) : Booking.findOne({ bookingId: String(id).toUpperCase() });
  if (withNotes) query.select('+adminNotes');
  const booking = await query;
  if (!booking) throw httpError(404, 'Booking not found');
  return booking;
}

// ---------------------------------------------------------------- POST /api/bookings  (PUBLIC)
export const createBooking = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const settings = await getSettings();
  const rules = settings.booking;

  // Admin → Settings → Booking: online bookings can be switched off (the website shows the message; this is the server-side guard)
  if (!rules.enabled) throw httpError(403, rules.disabledMessage || 'Online bookings are currently closed.');

  // Whitelist: status, adminNotes, bookingId, slotKey can never be set by the public
  const booking = new Booking({
    name: str(b.name),
    email: str(b.email),
    phone: str(b.phone),
    shootType: str(b.shootType),
    // not asked for → "not sure yet", which is an existing option, so downstream code never meets a missing location
    location: str(b.location) || (rules.locationRequired ? undefined : 'undecided'),
    locationDetails: str(b.locationDetails),
    numberOfPeople: num(b.numberOfPeople ?? b.people),
    styles: strArray(b.styles),
    specialRequest: rules.allowNotes ? str(b.specialRequest ?? b.requests) : '',
    budget: str(b.budget),
    // Only the customer can opt in (at booking). It cannot be changed from the admin screen.
    whatsappOptIn: b.whatsappOptIn === true,
    whatsappOptInAt: b.whatsappOptIn === true ? new Date() : undefined,
    date: str(b.date),
    time: str(b.time),
    package: await resolvePackage(packageSlugFrom(b), settings),
  });
  booking.$locals = { optional: { email: !rules.emailRequired, phone: !rules.phoneRequired, location: !rules.locationRequired } };

  await booking.validate(); // field-by-field errors (400) before anything else

  // Only ACTIVE services can be booked. The booking keeps the service's name as it is today (renaming it later changes nothing here).
  const service = await findService(booking.shootType);
  if (!service) throw fieldError('shootType', 'That service is not available. Please choose another.');
  booking.shootTypeName = service.name;

  const window = { minAdvanceDays: rules.minAdvanceDays, maxAdvanceDays: rules.maxAdvanceDays };
  if (!isBookableDate(booking.date, window)) {
    throw httpError(400, rules.allowSameDay ? 'Please choose today or a later date within the booking window.' : 'Please choose a date after today, within the booking window.');
  }
  if (!SLOT_TIMES.includes(booking.time)) throw httpError(400, 'Please choose one of the available time slots.');
  // Free of other bookings and blocked dates, inside the working hours for that day, and with the buffer around other shoots
  if (!(await isSlotFree(booking.date, booking.time, { durationHours: booking.package.durationHours, settings }))) {
    throw httpError(409, 'That time slot is no longer available. Please choose another.');
  }

  await booking.save(); // the unique slotKey index is the final guard against a simultaneous double-booking (409)

  // CRM: find or create this customer's client (one per phone number) and attach the booking. Done only AFTER the booking is saved,
  // so a failed booking never leaves a stray client. It never throws: if it cannot finish, the booking stays saved and unlinked
  // (`npm run backfill:clients` repairs it) instead of the customer seeing an error for a booking that was made.
  await safeLinkBooking(booking);

  sendBookingReceived(booking); // fire and forget: an email problem never fails the booking
  notifyBookingCreated(booking); // WhatsApp: the photographer, then (if they opted in) the customer. Runs after the save and never fails the booking.

  res.status(201).json({ success: true, data: booking });
});

// ---------------------------------------------------------------- GET /api/bookings  (ADMIN)
// ?status= &shootType= &date= &from= &to= &search= &sort=-createdAt|createdAt|date|-date &page= &limit=
const SORTS = { '-createdAt': { createdAt: -1 }, createdAt: { createdAt: 1 }, date: { date: 1, time: 1 }, '-date': { date: -1, time: -1 } };

export const getBookings = asyncHandler(async (req, res) => {
  const q = (name) => {
    const v = req.query[name];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw httpError(400, `Invalid ${name}`);
    return v.trim();
  };

  const filter = {};
  const status = q('status');
  if (status) {
    if (!BOOKING_STATUSES.includes(status)) throw httpError(400, `status must be one of: ${BOOKING_STATUSES.join(', ')}`);
    filter.status = status;
  }
  const shootType = q('shootType');
  if (shootType) {
    if (shootType.length > SLUG_MAX || !SLUG_RE.test(shootType)) throw httpError(400, 'Invalid shootType');
    filter.shootType = shootType;
  }

  const date = q('date');
  const from = q('from');
  const to = q('to');
  [['date', date], ['from', from], ['to', to]].forEach(([name, v]) => {
    if (v && !isDateKey(v)) throw httpError(400, `${name} must be YYYY-MM-DD`);
  });
  if (date) filter.date = date;
  else if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };

  const search = q('search');
  if (search) {
    if (search.length > 50) throw httpError(400, 'Search is too long');
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { bookingId: rx }];
  }

  const sortKey = q('sort') || '-createdAt';
  if (!SORTS[sortKey]) throw httpError(400, `sort must be one of: ${Object.keys(SORTS).join(', ')}`);

  const page = q('page') === undefined ? 1 : Number(q('page'));
  const limit = q('limit') === undefined ? 20 : Number(q('limit'));
  if (!Number.isInteger(page) || page < 1) throw httpError(400, 'page must be 1 or more');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw httpError(400, 'limit must be 1 to 100');

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter).sort(SORTS[sortKey]).skip((page - 1) * limit).limit(limit),
  ]);

  res.json({ success: true, total, page, pages: Math.max(1, Math.ceil(total / limit)), count: bookings.length, data: bookings });
});

// ---------------------------------------------------------------- GET /api/bookings/:id  (ADMIN)
// :id is the database id OR the reference (AM-K3X9QA)
export const getBooking = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await findBooking(req.params.id, { withNotes: true }) });
});

// ---------------------------------------------------------------- PATCH /api/bookings/:id  (ADMIN)
const EDITABLE = [
  'status', 'adminNotes', 'name', 'email', 'phone', 'shootType', 'location', 'locationDetails',
  'numberOfPeople', 'styles', 'specialRequest', 'budget', 'date', 'time',
];

export const updateBooking = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const booking = await findBooking(req.params.id, { withNotes: true });
  const before = { status: booking.status, date: booking.date, time: booking.time, hours: booking.package?.durationHours, shootType: booking.shootType };

  let touched = false;
  EDITABLE.forEach((key) => {
    if (key in body) { booking[key] = body[key]; touched = true; }
  });
  if ('package' in body || 'packageId' in body) {
    booking.package = await resolvePackage(packageSlugFrom(body), await getSettings());
    touched = true;
  }
  if ('shootType' in body && booking.shootType !== before.shootType) {
    // the admin may pick any existing service (even one hidden from customers); the booking keeps that service's name
    const service = await findService(String(body.shootType), { activeOnly: false });
    if (!service) throw fieldError('shootType', 'That service does not exist.');
    booking.shootType = service.slug;
    booking.shootTypeName = service.name;
  }
  if ('durationHours' in body) {
    booking.set('package.durationHours', body.durationHours); // e.g. extend a custom-quote shoot to 4 hours
    touched = true;
  }
  if (!touched) throw httpError(400, 'Nothing to update. Editable fields: status, adminNotes, date, time, package, and the customer/shoot details.');

  // Status changes must follow the flow (see BOOKING_STATUS_FLOW): a completed booking is final, a pending one cannot jump to completed, ...
  if (booking.status !== before.status) {
    const allowed = BOOKING_STATUS_FLOW[before.status] ?? [];
    if (!allowed.includes(booking.status)) {
      throw httpError(400, `A ${before.status} booking cannot be changed to ${booking.status}.${allowed.length ? ` Allowed: ${allowed.join(', ')}.` : ' It is final.'}`);
    }
  }

  await booking.validate();

  // Only look for conflicts when the booking will hold a slot AND the slot or status changed
  const slotChanged = booking.date !== before.date || booking.time !== before.time;
  const reactivated = !ACTIVE_BOOKING_STATUSES.includes(before.status) && ACTIVE_BOOKING_STATUSES.includes(booking.status);
  const hoursChanged = booking.package.durationHours !== before.hours;
  if (ACTIVE_BOOKING_STATUSES.includes(booking.status) && (slotChanged || reactivated || hoursChanged)) {
    if (!SLOT_TIMES.includes(booking.time)) throw httpError(400, 'Time must be one of the hourly slots.');
    const free = await isSlotFree(booking.date, booking.time, { excludeBookingId: booking._id, enforceDateRules: false, durationHours: booking.package.durationHours });
    if (!free) throw httpError(409, 'That time slot is already booked or blocked.');
  }

  await booking.save(); // save() (not findByIdAndUpdate) so the slot lock is recalculated

  if (booking.status !== before.status) {
    sendStatusEmail(booking); // confirmed / cancelled only
    notifyBookingStatusChanged(booking); // WhatsApp to the customer (confirmed / cancelled), if they opted in
  }

  res.json({ success: true, data: booking });
});

// ---------------------------------------------------------------- DELETE /api/bookings/:id  (ADMIN)
// Permanent. To keep a record and free the slot, PATCH status to "cancelled" instead.
export const deleteBooking = asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);
  await booking.deleteOne();
  res.json({ success: true, message: `Booking ${booking.bookingId} deleted` });
});

// ---------------------------------------------------------------- GET /api/bookings/stats  (ADMIN)
// Dashboard numbers (totals, upcoming, pending, revenue, next shoots), calculated by MongoDB
export const getBookingStats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await computeBookingStats() });
});
