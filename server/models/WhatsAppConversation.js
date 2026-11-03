import mongoose from 'mongoose';
import { WA_DIRECTIONS, WA_CONVERSATION_STATUSES } from '../config/constants.js';

/**
 * One WhatsApp conversation per customer phone number. The messages themselves live in WhatsAppMessage.
 *
 *   phone     digits with country code ("919876543210"): the same format as WhatsAppOptOut. UNIQUE: one conversation per number.
 *   name      the customer's WhatsApp profile name (updated whenever WhatsApp sends a newer valid one)
 *   contactId WhatsApp's own id for the customer ("wa_id"), when WhatsApp supplies it
 *   unreadCount  incoming messages the admin has not read yet (kept up to date by utils/whatsappInbox.js)
 */
const conversationSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, match: /^[1-9]\d{7,14}$/ },
    name: { type: String, trim: true, maxlength: 100, default: '' },
    contactId: { type: String, trim: true, maxlength: 30, default: '' },
    lastMessagePreview: { type: String, maxlength: 120, default: '' }, // a short one-line preview, never the full message
    lastMessageAt: { type: Date },
    lastMessageDirection: { type: String, enum: WA_DIRECTIONS },
    unreadCount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: WA_CONVERSATION_STATUSES, default: 'open' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
  }
);

// the future inbox list: open conversations, most recent first
conversationSchema.index({ status: 1, lastMessageAt: -1 });

export default mongoose.model('WhatsAppConversation', conversationSchema);
