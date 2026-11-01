import mongoose from 'mongoose';
import { NOTIFICATION_EVENTS, NOTIFICATION_STATUSES } from '../config/constants.js';

/**
 * One WhatsApp notification: a log that makes retrying, de-duplication and delivery tracking possible.
 * It deliberately keeps almost no personal data: the customer's phone number and the message text are NOT stored
 * (a retry rebuilds them from the booking / message), only a masked hint like "****7890".
 *
 *   status: pending → sent (WhatsApp ACCEPTED it) → delivered (reached the phone) → read      failed · skipped
 *   "sent" is never shown as "delivered": only WhatsApp's webhook can say that.
 */
const notificationSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, enum: NOTIFICATION_EVENTS },
    // one notification per event per booking/message, ever: this unique key is what stops duplicates
    dedupeKey: { type: String, required: true, unique: true },
    refType: { type: String, required: true, enum: ['booking', 'message'] },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    refLabel: { type: String, trim: true, default: '' }, // "AM-K3X9QA" or "Contact message"
    recipientRole: { type: String, enum: ['customer', 'photographer'], required: true },
    recipientHint: { type: String, default: '' },
    template: { type: String, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'pending' },
    waMessageId: { type: String, index: true, sparse: true }, // WhatsApp's id, used to match delivery reports
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' }, // already scrubbed of tokens
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret.__v;
        delete ret.dedupeKey;
        return ret;
      },
    },
  }
);

notificationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
