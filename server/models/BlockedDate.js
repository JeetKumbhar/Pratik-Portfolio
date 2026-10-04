import mongoose from 'mongoose';
import { BLOCKED_DATE_TYPES } from '../config/constants.js';
import { isDateKey, isBookableTime } from '../utils/validators.js';

/**
 * Time the photographer is NOT available, for reasons other than website bookings.
 *
 * A slot is available only if BOTH are true:
 *   1. no pending/confirmed Booking holds it, and
 *   2. no BlockedDate covers it   (see blocksTime() below).
 *
 * - blockedTimes empty  → the WHOLE day is blocked (editing day, vacation, personal day).
 * - blockedTimes filled → only those hourly slots, e.g. an offline booking: ['14:00', '15:00'].
 * - Several blocks may exist for the same date (e.g. two offline bookings at different times).
 * - A vacation of N days = N documents, one per date (the admin API will create them from a date range).
 *
 * `reason` is a short label ("Wedding for the Patels"); `note` is longer private detail.
 * Customers never see either; they only see the slot as unavailable.
 */
const blockedDateSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD', same format the frontend and Booking use
      required: [true, 'Date is required'],
      validate: { validator: isDateKey, message: 'Date must be a real date in YYYY-MM-DD format' },
    },
    type: {
      type: String,
      required: [true, 'Type is required'],
      enum: { values: BLOCKED_DATE_TYPES, message: 'Invalid type' },
      default: 'other',
    },
    reason: { type: String, trim: true, maxlength: [200, 'Reason must be 200 characters or fewer'], default: '' },
    note: { type: String, trim: true, maxlength: [1000, 'Note must be 1000 characters or fewer'], default: '' },
    blockedTimes: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every(isBookableTime),
        message: 'Times must be HH:MM within opening hours',
      },
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.allDay = ret.blockedTimes.length === 0;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Keep times tidy: no duplicates, sorted
blockedDateSchema.pre('validate', function tidyTimes() {
  if (this.blockedTimes?.length) this.blockedTimes = [...new Set(this.blockedTimes)].sort();
});

blockedDateSchema.virtual('allDay').get(function allDay() {
  return this.blockedTimes.length === 0;
});

/** Does this block cover the given 'HH:MM' slot? */
blockedDateSchema.methods.blocksTime = function blocksTime(time) {
  return this.blockedTimes.length === 0 || this.blockedTimes.includes(time);
};

blockedDateSchema.index({ date: 1 }); // NOT unique: several blocks can share a date

export default mongoose.model('BlockedDate', blockedDateSchema);
