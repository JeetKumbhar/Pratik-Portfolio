import mongoose from 'mongoose';
import {
  SHOOT_TYPES, LOCATIONS, STYLES, MAX_STYLES, BOOKING_STATUSES, ACTIVE_BOOKING_STATUSES,
} from '../config/constants.js';
import { isEmail, isPhone, isDateKey, isBookableTime } from '../utils/validators.js';
import { generateBookingId } from '../utils/generateBookingId.js';

/**
 * A booking request from the public form.
 *
 * Fields: bookingId, name, email, phone, shootType, location, date, time, package, budget,
 *         numberOfPeople, specialRequest, status, createdAt (+ styles, locationDetails, adminNotes).
 *
 * - `package` is a SNAPSHOT (name / price / duration at booking time), so changing prices later
 *   never rewrites old bookings. `package.packageId` links back to the Package document.
 *   NOTE: `package` is a reserved word in strict-mode JavaScript, so write `booking.package.name`
 *   (fine) but never `const { package } = booking` (syntax error). Use `const pkg = booking.package`.
 * - `slotKey` ("2099-06-15_14:00") has a unique sparse index: only ONE pending/confirmed booking can
 *   hold a time slot. Cancelled/completed bookings release it. The database itself stops double-booking
 *   even when two people submit at the same moment (the second gets error 11000 → 409 "slot taken").
 *   IMPORTANT: change status with doc.save() (not findByIdAndUpdate) so slotKey is recomputed.
 */
const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, default: generateBookingId, unique: true, immutable: true },

    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: [2, 'Name must be at least 2 characters'], maxlength: 80 },
    email: {
      type: String, required: [true, 'Email is required'], trim: true, lowercase: true,
      validate: { validator: isEmail, message: 'Enter a valid email address' },
    },
    phone: {
      type: String, required: [true, 'Phone number is required'], trim: true,
      validate: { validator: isPhone, message: 'Enter a valid phone number' },
    },

    shootType: { type: String, required: [true, 'Shoot type is required'], enum: { values: SHOOT_TYPES, message: 'Invalid shoot type' } },
    location: { type: String, required: [true, 'Location is required'], enum: { values: LOCATIONS, message: 'Invalid location option' } },
    locationDetails: { type: String, trim: true, maxlength: 200, default: '' }, // "Mountain Lake, Banff"

    numberOfPeople: {
      type: Number, required: [true, 'Number of people is required'], min: [1, 'At least 1 person'], max: [50, 'At most 50 people'],
      validate: { validator: Number.isInteger, message: 'Number of people must be a whole number' },
    },
    styles: {
      type: [{ type: String, enum: { values: STYLES, message: 'Invalid style' } }],
      default: [],
      validate: { validator: (a) => a.length <= MAX_STYLES, message: `Pick up to ${MAX_STYLES} styles` },
    },
    specialRequest: { type: String, trim: true, maxlength: [500, 'Special request must be 500 characters or fewer'], default: '' },

    package: {
      packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
      slug: { type: String, required: [true, 'Package is required'], trim: true }, // 'standard', or 'custom' for "not sure yet"
      name: { type: String, required: [true, 'Package name is required'], trim: true },
      price: { type: Number, min: 0, default: null }, // null → custom quote; this is also the booking's "estimate"
      duration: { type: String, trim: true, default: '' },
    },
    budget: { type: String, trim: true, maxlength: 40, default: '' }, // optional, e.g. "$1,500 - $2,500"

    date: {
      type: String, required: [true, 'Date is required'],
      validate: { validator: isDateKey, message: 'Date must be a real date in YYYY-MM-DD format' },
    },
    time: {
      type: String, required: [true, 'Time is required'],
      validate: { validator: isBookableTime, message: 'Time must be HH:MM within opening hours' },
    },

    status: { type: String, enum: { values: BOOKING_STATUSES, message: 'Invalid status' }, default: 'pending' },
    adminNotes: { type: String, trim: true, maxlength: 1000, default: '', select: false }, // admin-only: query with .select('+adminNotes')

    slotKey: { type: String, unique: true, sparse: true }, // managed automatically, see above
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.reference = ret.bookingId; // what the frontend calls it
        delete ret.slotKey;
        delete ret.__v;
        return ret;
      },
    },
  }
);

bookingSchema.pre('validate', function lockSlot() {
  const active = ACTIVE_BOOKING_STATUSES.includes(this.status);
  this.slotKey = active && this.date && this.time ? `${this.date}_${this.time}` : undefined;
});

bookingSchema.index({ date: 1, time: 1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ email: 1 });

export default mongoose.model('Booking', bookingSchema);
