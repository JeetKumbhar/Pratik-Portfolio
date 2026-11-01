import mongoose from 'mongoose';

/** Numbers that replied STOP. No customer notification is ever sent to a number on this list (START removes it). */
const optOutSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, match: /^[1-9]\d{7,14}$/ }, // digits with country code
    source: { type: String, default: 'whatsapp-stop' },
  },
  { timestamps: true }
);

export default mongoose.model('WhatsAppOptOut', optOutSchema);
