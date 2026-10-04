import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { isEmail } from '../utils/validators.js';

/**
 * Admin users only (customers don't need accounts in V1).
 * Passwords are hashed automatically on save and never returned in queries or JSON.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be 80 characters or fewer'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: { validator: isEmail, message: 'Enter a valid email address' },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // not returned unless you ask: .select('+password')
    },
    role: {
      type: String,
      enum: { values: ['admin'], message: 'Invalid role' },
      default: 'admin',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Hash only when the password is new or changed
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/** Needs the doc loaded with .select('+password') */
userSchema.methods.matchPassword = function matchPassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model('User', userSchema);
