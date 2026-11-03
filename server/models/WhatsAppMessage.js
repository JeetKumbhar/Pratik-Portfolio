import mongoose from 'mongoose';
import { WA_DIRECTIONS, WA_MESSAGE_TYPES, WA_PROCESSING_STATUSES } from '../config/constants.js';

/**
 * One WhatsApp message in a conversation.
 *
 *   waMessageId   WhatsApp's id for the message. UNIQUE: this is what stops Meta's repeated deliveries creating duplicates.
 *   type          what kind of message it is. Anything outside the list is stored as 'unknown' and WhatsApp's own word for it is kept in rawType.
 *   text          ONLY for type 'text', stored exactly as sent (no trimming), so line breaks, emoji, Marathi and Hindi survive.
 *                 Other types have no text: we never pretend an image contains words.
 *   processingStatus  received → counted → processed (see utils/whatsappInbox.js)
 *   readAt        when the admin read it; empty = unread
 * Nothing else from the webhook is kept: no raw payload, and media is not downloaded.
 */
const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', required: true },
    waMessageId: { type: String, required: true, unique: true, maxlength: 200 },
    phone: { type: String, required: true, match: /^[1-9]\d{7,14}$/ },
    direction: { type: String, enum: WA_DIRECTIONS, default: 'incoming' },
    type: { type: String, required: true, enum: WA_MESSAGE_TYPES },
    rawType: { type: String, maxlength: 40 },
    text: { type: String, maxlength: 4096, default: null },
    waTimestamp: { type: Date, required: true },
    processingStatus: { type: String, enum: WA_PROCESSING_STATUSES, default: 'received' },
    readAt: { type: Date },
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

// a conversation's thread, oldest to newest
messageSchema.index({ conversationId: 1, waTimestamp: 1 });
// counting a conversation's unread incoming messages
messageSchema.index({ conversationId: 1, direction: 1, readAt: 1 });

export default mongoose.model('WhatsAppMessage', messageSchema);
