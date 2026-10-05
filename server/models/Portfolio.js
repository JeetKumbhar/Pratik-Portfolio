import mongoose from 'mongoose';
import { PORTFOLIO_CATEGORIES } from '../config/constants.js';

// An http(s) URL (e.g. Cloudinary) or a site path (e.g. /images/portfolio/gallery/wedding-01.jpg).
// Rejects javascript:, data: and protocol-relative (//host) values.
const isImageRef = (v) => /^(https?:\/\/\S+|\/(?!\/)\S*)$/i.test(v);

/**
 * One photo in the portfolio gallery.
 *
 * Fields: image, title, category, description, createdAt
 *         (+ alt, ratio, featured, isPublished, sortOrder for the website and the Admin panel).
 *
 * - `image.url`      what the website displays. A local path works today; a Cloudinary URL after uploads exist.
 * - `image.publicId` the storage id the admin API needs to DELETE the file later. Never sent to the public.
 * - `image.width/height` (set on upload) are used to compute `ratio`, which the masonry grid needs to
 *   reserve space before the photo loads. Without them, set `ratio` by hand (default 1 = square).
 *
 * JSON shape for the frontend: { id, title, category, description, alt, ratio, src, image:{url,width,height}, ... }
 * so the existing Portfolio page (which reads `src`) works unchanged.
 */
const portfolioSchema = new mongoose.Schema(
  {
    image: {
      url: {
        type: String,
        required: [true, 'Image is required'],
        trim: true,
        validate: { validator: isImageRef, message: 'Image must be an http(s) URL or a /path' },
      },
      publicId: { type: String, trim: true },
      width: { type: Number, min: 1 },
      height: { type: Number, min: 1 },
    },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: [100, 'Title must be 100 characters or fewer'] },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: PORTFOLIO_CATEGORIES, message: 'Invalid category' },
    },
    description: { type: String, trim: true, maxlength: [500, 'Description must be 500 characters or fewer'], default: '' },

    alt: { type: String, trim: true, maxlength: 200 }, // accessibility text; defaults to the title
    ratio: { type: Number, default: 1, min: [0.3, 'Ratio too narrow'], max: [3, 'Ratio too wide'] }, // width / height
    featured: { type: Boolean, default: false }, // show in "Featured Work" on the Home page
    isPublished: { type: Boolean, default: true }, // false = draft, hidden from the public site
    sortOrder: { type: Number, default: 0 }, // lower shows first
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.src = ret.image?.url; // what the frontend reads
        if (ret.image) delete ret.image.publicId;
        delete ret.__v;
        return ret;
      },
    },
  }
);

portfolioSchema.pre('validate', function prepare() {
  if (!this.alt && this.title) this.alt = this.title;

  const width = this.image?.width;
  const height = this.image?.height;
  if (width && height) {
    // Very wide/tall panoramas are clamped; the ratio only reserves layout space
    this.ratio = Math.min(3, Math.max(0.3, Math.round((width / height) * 1000) / 1000));
  }
});

// Public gallery query: published, by category, in order
portfolioSchema.index({ isPublished: 1, category: 1, sortOrder: 1, createdAt: -1 });

export default mongoose.model('Portfolio', portfolioSchema);
