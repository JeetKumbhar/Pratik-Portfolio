import Package from '../models/Package.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { Booking } from '../models/index.js';
import { cleanFeatures, isReservedName } from '../utils/packageInput.js';
import { PACKAGE_CATEGORIES } from '../config/constants.js';

// @route GET /api/packages                    (public)  every active package
// @route GET /api/packages?category=wedding   (public)  active packages for that shoot type + the "general" ones
export const getPackages = asyncHandler(async (req, res) => {
  const filter = { active: true };
  const { category } = req.query;

  if (category !== undefined) {
    if (typeof category !== 'string' || !PACKAGE_CATEGORIES.includes(category)) {
      const err = new Error(`Invalid category. Use one of: ${PACKAGE_CATEGORIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    filter.category = category === 'general' ? 'general' : { $in: ['general', category] };
  }

  const packages = await Package.find(filter).sort({ sortOrder: 1, price: 1 });
  res.json({ success: true, count: packages.length, data: packages });
});

// ---------------------------------------------------------------- everything below: ADMIN only
const str = (v) => (typeof v === 'string' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);

const reservedError = (name) => httpError(400, `"${String(name).trim()}" is reserved for the "Not sure yet" option. Please choose another name.`);
const duplicateError = () => httpError(409, 'A package with that name (or a very similar one) already exists.');

async function findPackage(id) {
  const pkg = /^[a-f\d]{24}$/i.test(id) ? await Package.findById(id) : null;
  if (!pkg) throw httpError(404, 'Package not found');
  return pkg;
}

// GET /api/packages/admin → every package (active or not) + how many bookings used each one: usage = { slug: count }
export const getAdminPackages = asyncHandler(async (req, res) => {
  const [packages, rows] = await Promise.all([
    Package.find().sort({ sortOrder: 1, price: 1 }),
    Booking.aggregate([{ $group: { _id: '$package.slug', count: { $sum: 1 } } }]),
  ]);
  const usage = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  res.json({ success: true, count: packages.length, usage, data: packages });
});

// POST /api/packages   { name, price, duration, durationHours, features[], description?, category?, popular?, active?, sortOrder? }
export const createPackage = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  if (str(b.name) && isReservedName(b.name)) throw reservedError(b.name);

  // new packages go to the end of the list unless an order is given
  let sortOrder = num(b.sortOrder);
  if (sortOrder === undefined) {
    const last = await Package.findOne().sort({ sortOrder: -1 }).select('sortOrder');
    sortOrder = (last?.sortOrder ?? 0) + 1;
  }

  try {
    const pkg = await Package.create({
      name: str(b.name),
      price: num(b.price),
      duration: str(b.duration),
      durationHours: num(b.durationHours),
      features: cleanFeatures(b.features),
      description: str(b.description),
      category: str(b.category),
      popular: bool(b.popular),
      active: bool(b.active),
      sortOrder,
    });
    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    if (err.code === 11000) throw duplicateError();
    throw err;
  }
});

// PATCH /api/packages/:id   (the link name / slug is fixed so old links and bookings keep working)
const EDITABLE = ['name', 'price', 'duration', 'durationHours', 'features', 'description', 'category', 'popular', 'active', 'sortOrder'];

export const updatePackage = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const pkg = await findPackage(req.params.id);

  let touched = false;
  EDITABLE.forEach((key) => {
    if (!(key in body)) return;
    touched = true;
    if (key === 'features') {
      const features = cleanFeatures(body.features);
      if (!features) throw httpError(400, 'Features must be a list of text lines.');
      pkg.features = features;
    } else if (key === 'name' && isReservedName(body.name)) {
      throw reservedError(body.name);
    } else {
      pkg[key] = body[key];
    }
  });
  if (!touched) throw httpError(400, `Nothing to update. You can change: ${EDITABLE.join(', ')}.`);

  try {
    await pkg.save();
  } catch (err) {
    if (err.code === 11000) throw duplicateError();
    throw err;
  }
  res.json({ success: true, data: pkg });
});

// DELETE /api/packages/:id   → bookings made with it are NOT affected: each keeps the name, price and duration it was booked with
export const deletePackage = asyncHandler(async (req, res) => {
  const pkg = await findPackage(req.params.id);
  const bookings = await Booking.countDocuments({ 'package.slug': pkg.slug });
  await pkg.deleteOne();
  res.json({
    success: true,
    bookings,
    message: bookings
      ? `Package deleted. ${bookings} existing booking${bookings === 1 ? '' : 's'} keep${bookings === 1 ? 's' : ''} the name and price ${bookings === 1 ? 'it was' : 'they were'} booked with.`
      : 'Package deleted.',
  });
});
