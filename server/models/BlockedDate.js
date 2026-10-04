import mongoose from 'mongoose';
import { isDateKey, isTimeKey } from '../utils/validators.js';

/**
 * Days (or specific hours) you are NOT available: holidays, other jobs, travel.
 * blockedTimes empty → the whole day is blocked. e.g. ['09:00','10:00'] → only those slots.
 * The booking calendar uses this together with existing bookings to compute availability.
 */
const blockedDateSchema = new mongoose.Schema(
  {
    date: {
      type: String, // 'YYYY-MM-DD' (same format the frontend sends)
      required: [true, 'Date is required'],
      unique: true,
      validate: { validator: isDateKey, message: 'Date must be a real date in YYYY-MM-DD format' },
    },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    blockedTimes: {
      type: [String],
      default: [],
      validate: { validator: (arr) => arr.every(isTimeKey), message: 'Times must be in HH:MM format' },
    },
  },
  {
    timestamps: true,
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

export default mongoose.model('BlockedDate', blockedDateSchema);
