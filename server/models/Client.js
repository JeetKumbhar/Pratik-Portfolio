import mongoose from 'mongoose';
import { isEmail } from '../utils/validators.js';
import { CLIENT_SOURCES, CLIENT_NAME_SOURCES } from '../config/constants.js';

/**
 * One person the photographer works with. There is exactly ONE client per phone number.
 *
 *   phone            how the number is shown ("+91 98765 43210"), always derived from normalizedPhone
 *   normalizedPhone  digits with country code ("919876543210"): the same format WhatsApp uses for a conversation.
 *                    UNIQUE: this is the guarantee that the same person never becomes two clients, even when two
 *                    requests (a booking and a WhatsApp message, say) arrive at the same moment.
 *   source           how the client first appeared: 'booking' | 'whatsapp' | 'manual'
 *   nameSource       where the CURRENT name came from: 'placeholder' (the phone number, used when nothing better
 *                    is known) < 'whatsapp' (profile name) < 'booking' (name typed on the form) < 'manual' (admin).
 *                    A name from a lower source never overwrites one from a higher source (see utils/clients.js).
 *
 * What is deliberately NOT stored here (so it can never go out of date):
 *   - booking counts / last booking date: calculated from the bookings (Booking.clientId)
 *   - WhatsApp messages: they stay in WhatsAppConversation / WhatsAppMessage (WhatsAppConversation.clientId)
 *   - private notes: they live in the ClientNote collection
 */
const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: [1, 'Name is required'], maxlength: [100, 'Name must be 100 characters or fewer'] },
    phone: { type: String, required: [true, 'Phone number is required'], trim: true, maxlength: 30 },
    normalizedPhone: {
      type: String, required: [true, 'Phone number is required'], unique: true, match: [/^[1-9]\d{7,14}$/, 'Enter a valid phone number'],
    },
    email: {
      type: String, trim: true, lowercase: true, default: '',
      validate: { validator: (v) => !v || isEmail(v), message: 'Enter a valid email address' },
    },
    city: { type: String, trim: true, maxlength: [80, 'City must be 80 characters or fewer'], default: '' },
    source: { type: String, required: true, enum: { values: CLIENT_SOURCES, message: 'Invalid source' } },
    nameSource: { type: String, enum: { values: CLIENT_NAME_SOURCES, message: 'Invalid name source' }, default: 'manual' },
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

// "Recently added" / "Oldest added" (the list's default sort)
clientSchema.index({ createdAt: -1 });

export default mongoose.model('Client', clientSchema);
