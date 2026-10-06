import mongoose from 'mongoose';
import { PACKAGE_CATEGORIES, MAX_DURATION_HOURS } from '../config/constants.js';
import { parseDurationHours } from '../utils/duration.js';

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Pricing packages. Everything the website shows about a package comes from here,
 * so the admin can add, edit, hide or reorder packages WITHOUT any frontend code change.
 *
 * Fields: name, price, duration, features, category, description, active
 *         (+ slug, popular, sortOrder).
 *
 * - `category`  which shoot type the package is for ('wedding', 'portrait', ...) or 'general' for all of them.
 * - `active`    false = hidden from the public site (and from new bookings), but kept for old bookings.
 * - `slug`      the stable id used in links (/booking?package=standard). Generated from the name once,
 *               then locked (immutable) so renaming a package never breaks existing links or bookings.
 * - `durationHours`  whole hours the shoot lasts. The booking calendar blocks this many hours in a row.
 *               Read from `duration` ("Up to 6 hours" gives 6) when not set; otherwise the admin enters it.
 * - `popular`   shows the "Most popular" badge.
 * - `sortOrder` lower shows first.
 *
 * JSON shape for the frontend: { id (= slug), name, tagline (= description), price, duration, features,
 *   popular, category, active, ... }  so the existing pricing cards work unchanged.
 */
const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Package name is required'], trim: true, maxlength: [60, 'Name must be 60 characters or fewer'], unique: true },
    slug: { type: String, unique: true, lowercase: true, trim: true, immutable: true },
    category: {
      type: String,
      enum: { values: PACKAGE_CATEGORIES, message: 'Invalid category' },
      default: 'general',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      max: [1000000, 'Price is too high'],
    },
    duration: { type: String, required: [true, 'Duration is required'], trim: true, maxlength: [40, 'Duration must be 40 characters or fewer'] }, // "2 hours"
    durationHours: {
      type: Number,
      required: [true, 'Duration in whole hours is required (the calendar blocks this many hours)'],
      min: [1, 'At least 1 hour'],
      max: [MAX_DURATION_HOURS, `At most ${MAX_DURATION_HOURS} hours`],
      validate: { validator: Number.isInteger, message: 'Duration must be a whole number of hours' },
    },
    features: {
      type: [{ type: String, trim: true, maxlength: [100, 'A feature must be 100 characters or fewer'] }],
      default: [],
      validate: { validator: (arr) => arr.length <= 15, message: 'A package can have at most 15 features' },
    },
    description: { type: String, trim: true, maxlength: [200, 'Description must be 200 characters or fewer'], default: '' },
    active: { type: Boolean, default: true },

    popular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret.slug; // the frontend identifies packages by slug
        ret.tagline = ret.description; // the pricing card calls the short description "tagline"
        delete ret.__v;
        return ret;
      },
    },
  }
);

packageSchema.pre('validate', function prepare() {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  if (this.durationHours == null && this.duration) this.durationHours = parseDurationHours(this.duration);
});

export default mongoose.model('Package', packageSchema);
