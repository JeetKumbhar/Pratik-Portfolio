
import mongoose from 'mongoose';

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Pricing packages (editable from the Admin panel later).
 * JSON output includes `id` = the slug ('standard'), so the existing frontend links
 * (/booking?package=standard) and PricingCard keep working unchanged.
 */
const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Package name is required'], trim: true, maxlength: 60, unique: true },
    slug: { type: String, unique: true, lowercase: true, trim: true }, // auto-generated from name
    tagline: { type: String, trim: true, maxlength: 120, default: '' },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    duration: { type: String, required: [true, 'Duration is required'], trim: true, maxlength: 40 }, // "2 hours"
    features: {
      type: [{ type: String, trim: true, maxlength: 100 }],
      default: [],
      validate: { validator: (arr) => arr.length <= 15, message: 'A package can have at most 15 features' },
    },
    popular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }, // hidden from the public site when false
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret.slug;
        delete ret.__v;
        return ret;
      },
    },
  }
);

packageSchema.pre('validate', function makeSlug() {
  if (!this.slug && this.name) this.slug = slugify(this.name);
});

export default mongoose.model('Package', packageSchema);
