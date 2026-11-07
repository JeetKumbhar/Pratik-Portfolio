
import { Service } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { SLUG_MAX, SLUG_RE } from '../config/constants.js';
import { deleteImage, isOwnBrandingImage } from '../utils/imageStorage.js';
import { isImageInUse } from '../utils/imageUsage.js';
import { listServices, serviceUsage, RESERVED_SERVICE_IDS } from '../utils/services.js';

/**
 * Photography services. Public: only active services, in display order. Admin: everything.
 * A service's id (slug) is created once from its name and never changes, because bookings store it.
 */
const ID_RE = /^[a-f\d]{24}$/i;
const fieldError = (field, message, status = 400) => Object.assign(httpError(status, message), { fieldErrors: { [field]: message } });

const slugify = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/g, '');

async function load(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw httpError(404, 'Service not found');
  const service = await Service.findById(id);
  if (!service) throw httpError(404, 'Service not found');
  return service;
}

/** { url, publicId } from the image uploader, or empty to remove the image */
function parseImage(value) {
  if (value === null || (value && typeof value === 'object' && !value.url && !value.publicId)) return { url: '', publicId: '' };
  if (!value || typeof value !== 'object' || typeof value.url !== 'string' || typeof value.publicId !== 'string' || !isOwnBrandingImage(value)) {
    throw fieldError('coverImage', 'Upload the cover image with the image uploader.');
  }
  return { url: value.url, publicId: value.publicId };
}

const forgetImage = async (publicId) => { // best effort: a leftover file in storage is harmless, a failed save is not
  if (!publicId) return;
  if (await isImageInUse(publicId)) return; // the same picture is still the logo / a cover somewhere else: keep it
  try { await deleteImage(publicId); } catch (err) { console.error(`[services] could not remove old image: ${err.message}`); }
};

// GET /api/services  (PUBLIC)
export const getPublicServices = asyncHandler(async (req, res) => {
  const services = await listServices({ activeOnly: true });
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ success: true, count: services.length, data: services.map((s) => s.toPublic()) });
});

// GET /api/services/admin  (ADMIN)  all services with how many bookings and packages use each
export const getAdminServices = asyncHandler(async (req, res) => {
  const services = await listServices({ activeOnly: false });
  const data = await Promise.all(services.map(async (s) => ({ ...s.toJSON(), usage: await serviceUsage(s.slug) })));
  res.json({ success: true, count: data.length, data });
});

// POST /api/services  (ADMIN)  { name, description?, coverImage?, active? }
export const createService = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (typeof b.name !== 'string' || !b.name.trim()) throw fieldError('name', 'Service name is required');
  if (b.description !== undefined && typeof b.description !== 'string') throw fieldError('description', 'Description must be text');
  if (b.active !== undefined && typeof b.active !== 'boolean') throw fieldError('active', 'Active must be on or off');
  const slug = slugify(b.name);
  if (!slug || slug.length < 2 || !SLUG_RE.test(slug)) throw fieldError('name', 'Use letters or numbers in the name.');
  if (RESERVED_SERVICE_IDS.includes(slug)) throw fieldError('name', 'That name is reserved for the website\'s own options. Please choose another.');
  if (await Service.exists({ slug })) throw fieldError('name', 'A service with this name already exists.', 409);

  const last = await Service.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const service = new Service({
    slug,
    name: b.name,
    description: b.description === undefined ? '' : b.description,
    coverImage: b.coverImage === undefined ? undefined : parseImage(b.coverImage),
    active: b.active === undefined ? true : b.active,
    sortOrder: (last?.sortOrder ?? 0) + 10,
  });
  try { await service.save(); } catch (err) {
    if (err?.code === 11000) throw fieldError('name', 'A service with this name already exists.', 409);
    throw err;
  }
  res.status(201).json({ success: true, data: service });
});

// PATCH /api/services/:id  (ADMIN)  { name?, description?, coverImage?, active? }   (the id/slug never changes)
export const updateService = asyncHandler(async (req, res) => {
  const service = await load(req.params.id);
  const b = req.body ?? {};
  const oldImage = service.coverImage?.publicId;

  if ('name' in b) {
    if (typeof b.name !== 'string') throw fieldError('name', 'Name must be text');
    service.name = b.name;
  }
  if ('description' in b) {
    if (typeof b.description !== 'string') throw fieldError('description', 'Description must be text');
    service.description = b.description;
  }
  if ('active' in b) {
    if (typeof b.active !== 'boolean') throw fieldError('active', 'Active must be on or off');
    service.active = b.active;
  }
  if ('coverImage' in b) service.coverImage = parseImage(b.coverImage);

  await service.save();
  if (oldImage && oldImage !== service.coverImage?.publicId) await forgetImage(oldImage);
  res.json({ success: true, data: service });
});

// PUT /api/services/order  (ADMIN)  { ids: [every service id, in the new order] }
export const reorderServices = asyncHandler(async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !ID_RE.test(id)) || new Set(ids).size !== ids.length) {
    throw httpError(400, 'Send every service id once, in the order you want.');
  }
  const all = await Service.find().select('_id').lean();
  if (all.length !== ids.length || !all.every((s) => ids.includes(String(s._id)))) throw httpError(409, 'The list of services has changed. Reload and try again.');

  await Service.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: (i + 1) * 10 } } } })));
  res.json({ success: true, data: (await listServices({ activeOnly: false })) });
});

// DELETE /api/services/:id  (ADMIN)  refused while any booking or package uses it: deactivate it instead
export const deleteService = asyncHandler(async (req, res) => {
  const service = await load(req.params.id);
  const usage = await serviceUsage(service.slug);
  if (usage.bookings > 0 || usage.packages > 0) {
    const parts = [];
    if (usage.bookings) parts.push(`${usage.bookings} booking${usage.bookings === 1 ? '' : 's'}`);
    if (usage.packages) parts.push(`${usage.packages} package${usage.packages === 1 ? '' : 's'}`);
    throw httpError(409, `This service is used by ${parts.join(' and ')}, so it cannot be deleted. Switch it off instead: it will disappear from the website and the booking form but old bookings keep their details.`);
  }
  await service.deleteOne();
  await forgetImage(service.coverImage?.publicId);
  res.json({ success: true, message: `${service.name} deleted` });
});
