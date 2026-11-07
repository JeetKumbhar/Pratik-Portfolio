import { DEFAULT_SERVICES } from '../config/constants.js';

/**
 * Photography services (models/Service.js). Everything that needs to know "which services exist" asks here.
 */
const models = () => import('../models/index.js');

/** Ids the website already uses for something else: 'general' (all kinds of shoot / general question) and 'custom' ("Not sure yet"). */
export const RESERVED_SERVICE_IDS = ['general', 'custom'];

/** How these ids were labelled before services lived in the database. Used to label OLD bookings that have no saved name. */
export const LEGACY_LABELS = { ...Object.fromEntries(DEFAULT_SERVICES.map((s) => [s.slug, s.name])), custom: 'Custom' };

/** 'baby-shoot' → 'Baby shoot': a readable fallback for an id we know nothing about */
export const prettifySlug = (slug) => {
  const words = String(slug ?? '').replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
};

/**
 * Creates the six starting services ONCE, ever. A flag on the settings document is claimed atomically first, so two servers
 * starting together cannot both seed, and a service the admin deletes later never comes back.
 */
export async function seedDefaultServices() {
  const { Setting, Service } = await models();
  await Setting.updateOne({ key: 'site' }, { $setOnInsert: { key: 'site' } }, { upsert: true }).catch((err) => { if (err?.code !== 11000) throw err; });
  const claim = await Setting.updateOne({ key: 'site', servicesSeeded: { $ne: true } }, { $set: { servicesSeeded: true } });
  if (!claim.modifiedCount) return { seeded: false };

  try {
    const existing = new Set((await Service.find().select('slug').lean()).map((s) => s.slug)); // e.g. a partly migrated database
    const docs = DEFAULT_SERVICES.filter((s) => !existing.has(s.slug)).map((s, i) => ({ ...s, active: true, sortOrder: (i + 1) * 10 }));
    if (docs.length) await Service.insertMany(docs, { ordered: false }).catch((err) => { if (err?.code !== 11000 && !err?.writeErrors) throw err; });
    return { seeded: true, created: docs.length };
  } catch (err) {
    // The claim must not outlive a failed insert, or the starting services would never be created
    await Setting.updateOne({ key: 'site' }, { $set: { servicesSeeded: false } }).catch(() => {});
    throw err;
  }
}

export async function listServices({ activeOnly = true } = {}) {
  const { Service } = await models();
  return Service.find(activeOnly ? { active: true } : {}).sort({ sortOrder: 1, createdAt: 1 });
}

/** One service by its id, or null. activeOnly: only if customers may book it. */
export async function findService(slug, { activeOnly = true } = {}) {
  if (typeof slug !== 'string' || !slug) return null;
  const { Service } = await models();
  return Service.findOne({ slug: slug.toLowerCase(), ...(activeOnly && { active: true }) });
}

/** The name to show for a service id: the live name, else the legacy label, else a prettified id. */
export async function serviceNameFor(slug) {
  const service = await findService(slug, { activeOnly: false });
  return service?.name || LEGACY_LABELS[slug] || prettifySlug(slug);
}

/** slug → name for a list of ids in one query (used for older bookings that have no saved name) */
export async function serviceNames(slugs) {
  const { Service } = await models();
  const rows = await Service.find({ slug: { $in: [...new Set(slugs)] } }).select('slug name').lean();
  return Object.fromEntries(rows.map((r) => [r.slug, r.name]));
}

/** Where is this service used? Deleting is refused while any booking or package points at it. */
export async function serviceUsage(slug) {
  const { Booking, Package } = await models();
  const [bookings, packages] = await Promise.all([Booking.countDocuments({ shootType: slug }), Package.countDocuments({ category: slug })]);
  return { bookings, packages };
}
