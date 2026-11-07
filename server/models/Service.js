import mongoose from 'mongoose';
import { SLUG_MAX, SLUG_RE } from '../config/constants.js';

/**
 * A photography service (Weddings, Portrait, ...). Managed in Admin → Settings → Photography Services and used by the
 * booking form, the Services page, the home page and the contact form.
 *
 *   slug   the stable id. It is what a Booking stores in `shootType`, so it can NEVER change, even when the service is renamed.
 *   name   the display name (renaming is safe: bookings also keep a copy of the name they were made under, `shootTypeName`).
 *   active only active services can be chosen in NEW bookings. Inactive ones keep working for old bookings.
 */
const serviceSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      lowercase: true,
      trim: true,
      maxlength: SLUG_MAX,
      match: [SLUG_RE, 'Invalid service id'],
    },
    name: { type: String, required: [true, 'Service name is required'], set: (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ') : v), trim: true, minlength: [2, 'Name must be at least 2 characters'], maxlength: [60, 'Name must be 60 characters or fewer'] },
    description: { type: String, trim: true, maxlength: [300, 'Description must be 300 characters or fewer'], default: '' },
    coverImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

serviceSchema.index({ active: 1, sortOrder: 1 });

/** What the public website receives */
serviceSchema.methods.toPublic = function toPublic() {
  return { id: this.slug, slug: this.slug, name: this.name, description: this.description, coverImage: this.coverImage?.url || '', sortOrder: this.sortOrder };
};

serviceSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Service || mongoose.model('Service', serviceSchema);
