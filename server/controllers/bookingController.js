import Booking from '../models/Booking.js';
import Package from '../models/Package.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';
import sendEmail from '../utils/sendEmail.js';
import { isSlotBlocked } from '../utils/availability.js';
import { pickBookingInput, pickBookingUpdate, parseListQuery } from '../utils/bookingInput.js';
import { isDateKey, isFutureDate, isWithinAdvance } from '../utils/validators.js';
import { ACTIVE_BOOKING_STATUSES } from '../config/constants.js';

const MAX_PENDING_PER_EMAIL = 3;
const SLOT_UNAVAILABLE = 'That time is not available. Please choose another.';
const CUSTOM_PACKAGE = { slug: 'custom', name: 'Not sure yet', price: null, duration: 'To be discussed' };

// ---------------------------------------------------------------- helpers
/** Mongoose field names → the names the frontend form uses */
const CLIENT_FIELD = { numberOfPeople: 'people', specialRequest: 'requests', 'package.slug': 'packageId', 'package.name': 'packageId' };
const clientErrors = (mongooseErrors) => {
  const out = {};
  for (const [path, e] of Object.entries(mongooseErrors)) {
    const key = CLIENT_FIELD[path] ?? path;
    if (!out[key]) out[key] = e.message;
  }
  return out;
};

async function saveBooking(booking) {
  try {
    await booking.save();
  } catch (err) {
    if (err.name === 'ValidationError') throw httpError(400, 'Validation failed', clientErrors(err.errors));
    throw err; // duplicate slot (E11000) etc. → errorHandler
  }
}

/** The package price/name/duration come from OUR database, never from the browser. */
async function findPackage(slug, { onlyActive = true } = {}) {
  if (slug === 'custom') return { snapshot: { ...CUSTOM_PACKAGE }, category: 'general' };
  const pkg = await Package.findOne({ slug: slug.toLowerCase(), ...(onlyActive && { active: true }) });
  if (!pkg) return null;
  return {
    snapshot: { packageId: pkg._id, slug: pkg.slug, name: pkg.name, price: pkg.price, duration: pkg.duration },
    category: pkg.category,
  };
}

/** Accepts a Mongo _id or a reference like AM-K3X9QA */
async function findBooking(param) {
  let query = null;
  if (/^AM-[A-Z0-9]{6}$/i.test(param)) query = { bookingId: param.toUpperCase() };
  else if (/^[a-f\d]{24}$/i.test(param)) query = { _id: param };
  if (!query) throw httpError(400, 'Invalid booking id.');

  const booking = await Booking.findOne(query).select('+adminNotes');
  if (!booking) throw httpError(404, 'Booking not found.');
  return booking;
}

const send = (mail) => sendEmail(mail).catch((e) => console.error('[email] failed:', e.message)); // never block or fail a request
const when = (b) => `${b.date} at ${b.time}`;
const firstName = (b) => b.name.trim().split(/\s+/)[0];

// ---------------------------------------------------------------- POST /api/bookings  (public)
export const createBooking = asyncHandler(async (req, res) => {
  const { packageSlug, ...fields } = pickBookingInput(req.body);
  const customErrors = {};

  if (fields.date && isDateKey(fields.date)) {
    if (!isFutureDate(fields.date)) customErrors.date = 'Pick a date after today.';
    else if (!isWithinAdvance(fields.date)) customErrors.date = 'That date is too far ahead to book yet.';
  }

  let snapshot;
  if (!packageSlug) {
    customErrors.packageId = 'Choose a package, or "Not sure yet".';
  } else {
    const found = await findPackage(packageSlug);
    if (!found) customErrors.packageId = 'That package is no longer available. Please choose again.';
    else if (found.category !== 'general' && fields.shootType && found.category !== fields.shootType) customErrors.packageId = 'That package is not offered for this type of shoot.';
    else snapshot = found.snapshot;
  }

  // Only whitelisted fields reach the model; status, bookingId, adminNotes are always server-controlled
  const booking = new Booking({ ...fields, package: snapshot });

  let schemaErrors = {};
  try {
    await booking.validate();
  } catch (err) {
    if (err.name !== 'ValidationError') throw err;
    schemaErrors = clientErrors(err.errors);
  }
  const errors = { ...schemaErrors, ...customErrors };
  if (Object.keys(errors).length) throw httpError(400, 'Validation failed', errors);

  if (await isSlotBlocked(booking.date, booking.time)) throw httpError(409, SLOT_UNAVAILABLE);

  const pending = await Booking.countDocuments({ email: booking.email, status: 'pending' });
  if (pending >= MAX_PENDING_PER_EMAIL) {
    throw httpError(429, 'You already have several pending requests. Please wait for a reply, or contact me directly.');
  }

  // The unique slot index makes the database reject a simultaneous double-booking (→ 409 from errorHandler)
  await saveBooking(booking);

  send({
    to: booking.email,
    subject: `Booking request received (${booking.bookingId})`,
    text: `Hi ${firstName(booking)},\n\nThanks for your booking request. I'll review it and get back to you within 24 hours to confirm.\n\nReference: ${booking.bookingId}\nShoot: ${booking.shootType}\nRequested: ${when(booking)}\nPackage: ${booking.package.name}\n\nPlease keep your reference handy if you contact me.`,
  });
  const notify = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
  if (notify) {
    send({ to: notify, subject: `New booking request ${booking.bookingId}`, text: `${booking.name} (${booking.email}, ${booking.phone}) requested a ${booking.shootType} shoot on ${when(booking)}.\nPackage: ${booking.package.name}` });
  }

  res.status(201).json({
    success: true,
    data: {
      reference: booking.bookingId,
      status: booking.status,
      shootType: booking.shootType,
      date: booking.date,
      time: booking.time,
      package: booking.package.name,
    },
  });
});

// ---------------------------------------------------------------- GET /api/bookings  (admin)
export const getBookings = asyncHandler(async (req, res) => {
  const { filter, sort, page, limit } = parseListQuery(req.query);

  const [total, bookings] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(filter).select('+adminNotes').sort(sort).skip((page - 1) * limit).limit(limit),
  ]);

  res.json({ success: true, count: bookings.length, total, page, pages: Math.max(1, Math.ceil(total / limit)), data: bookings });
});

// ---------------------------------------------------------------- GET /api/bookings/:id  (admin)
export const getBooking = asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);
  res.json({ success: true, data: booking });
});

// ---------------------------------------------------------------- PATCH /api/bookings/:id  (admin)
export const updateBooking = asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);
  const { notifyCustomer, packageSlug, ...updates } = pickBookingUpdate(req.body);
  if (!Object.keys(updates).length && !packageSlug) throw httpError(400, 'Nothing to update.');

  const previousStatus = booking.status;

  if (packageSlug) {
    const found = await findPackage(packageSlug, { onlyActive: false });
    if (!found) throw httpError(400, 'Validation failed', { packageId: 'Package not found.' });
    updates.package = found.snapshot;
  }

  booking.set(updates);

  // If the booking now occupies a slot it didn't before (moved, or re-opened), the slot must not be blocked
  const occupies = ACTIVE_BOOKING_STATUSES.includes(booking.status);
  if (occupies && (booking.isModified('date') || booking.isModified('time') || booking.isModified('status'))) {
    if (await isSlotBlocked(booking.date, booking.time)) throw httpError(409, SLOT_UNAVAILABLE);
  }

  // save() (not findByIdAndUpdate) so the slot lock is recalculated; a clash with another booking → 409
  await saveBooking(booking);

  if (notifyCustomer !== false && previousStatus !== booking.status) {
    if (booking.status === 'confirmed') {
      send({ to: booking.email, subject: `Your booking is confirmed (${booking.bookingId})`, text: `Hi ${firstName(booking)},\n\nGreat news: your ${booking.shootType} shoot is confirmed for ${when(booking)}.\nReference: ${booking.bookingId}\n\nI'll be in touch with the details. Looking forward to it!` });
    } else if (booking.status === 'cancelled') {
      send({ to: booking.email, subject: `Your booking was cancelled (${booking.bookingId})`, text: `Hi ${firstName(booking)},\n\nYour booking ${booking.bookingId} (${when(booking)}) has been cancelled. If this is unexpected, please reply to this email.` });
    }
  }

  res.json({ success: true, data: booking });
});

// ---------------------------------------------------------------- DELETE /api/bookings/:id  (admin)
// Deleting erases the record for good. To keep history, PATCH status to "cancelled" instead.
export const deleteBooking = asyncHandler(async (req, res) => {
  const booking = await findBooking(req.params.id);
  await booking.deleteOne();
  res.json({ success: true, message: 'Booking deleted.' });
});
