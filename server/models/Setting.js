import mongoose from 'mongoose';

/**
 * ONE document (key: 'site') holds every admin setting, one object per group (general, business, booking, availability,
 * notifications, website, seo). The shape and validation of each group live in utils/settingsSchema.js, which checks every
 * change BEFORE it is written, so the groups are stored as plain objects here.
 *
 * Secrets never go in this document. The WhatsApp access token and other credentials stay in the server's .env.
 * A missing document (or missing fields) is normal: utils/settings.js fills in the defaults.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site', immutable: true },
    general: { type: Object },
    business: { type: Object },
    booking: { type: Object },
    availability: { type: Object },
    notifications: { type: Object },
    website: { type: Object },
    seo: { type: Object },
    servicesSeeded: { type: Boolean, default: false }, // the six starting services were created (so deleting one never brings it back)
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.models.Setting || mongoose.model('Setting', settingSchema);
