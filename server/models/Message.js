import mongoose from 'mongoose';
import { MESSAGE_STATUSES, SLUG_MAX, SLUG_RE } from '../config/constants.js';
import { isEmail, isPhone } from '../utils/validators.js';

/**
 * Contact-form messages (POST /api/messages).
 * Fields: name, email, phone, message, status, createdAt (+ subject, the optional topic from the form).
 * status: new → read → replied → archived  (admin changes it; new messages always start as 'new').
 */
const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String, required: [true, 'Email is required'], trim: true, lowercase: true,
      validate: { validator: isEmail, message: 'Enter a valid email address' },
    },
    phone: {
      type: String, trim: true, default: '',
      validate: { validator: (v) => !v || isPhone(v), message: 'Enter a valid phone number' },
    },
    subject: {
      type: String,
      trim: true,
      validate: { validator: (v) => v === 'general' || (v.length <= SLUG_MAX && SLUG_RE.test(v)), message: 'Invalid subject' }, // 'general' or a service id
      default: 'general', // optional: the contact form's "What's this about?" topic
    },
    message: {
      type: String, required: [true, 'Message is required'], trim: true,
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [1000, 'Message must be 1000 characters or fewer'],
    },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'new' },
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

messageSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
