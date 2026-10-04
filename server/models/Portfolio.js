import mongoose from 'mongoose';
import { PORTFOLIO_CATEGORIES } from '../config/constants.js';

/**
 * One photo in the gallery.
 * JSON shape matches the frontend: { id, category, title, alt, src, ratio }  (+ admin extras).
 */
const portfolioSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 100 },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: PORTFOLIO_CATEGORIES, message: 'Invalid category' },
    },
    src: { type: String, required: [true, 'Image URL is required'], trim: true }, // URL or /images/... path
    alt: { type: String, trim: true, maxlength: 200 }, // defaults to the title
    ratio: { type: Number, default: 1, min: [0.3, 'Ratio too narrow'], max: [3, 'Ratio too wide'] }, // width / height
    featured: { type: Boolean, default: false }, // show on the Home page
    isPublished: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    imagePublicId: { type: String, select: false }, // for deleting from Cloudinary later
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

portfolioSchema.pre('validate', function defaultAlt() {
  if (!this.alt && this.title) this.alt = this.title;
});

portfolioSchema.index({ isPublished: 1, category: 1, sortOrder: 1, createdAt: -1 });

export default mongoose.model('Portfolio', portfolioSchema);
