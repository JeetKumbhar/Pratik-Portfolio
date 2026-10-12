import { Portfolio } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { PORTFOLIO_CATEGORIES } from '../config/constants.js';
import { createUploadSignature, deleteImage, isConfigured, isOwnImage } from '../utils/imageStorage.js';

const str = (v) => (typeof v === 'string' ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function findPhoto(id) {
  const photo = /^[a-f\d]{24}$/i.test(id) ? await Portfolio.findById(id) : null;
  if (!photo) throw httpError(404, 'Photo not found');
  return photo;
}

// ---------------------------------------------------------------- GET /api/portfolio  (PUBLIC)
// ?category=wedding   → published photos only, in display order
export const getPublicPortfolio = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  const { category } = req.query;
  if (category !== undefined) {
    if (typeof category !== 'string' || !PORTFOLIO_CATEGORIES.includes(category)) {
      throw httpError(400, `Invalid category. Use one of: ${PORTFOLIO_CATEGORIES.join(', ')}`);
    }
    filter.category = category;
  }
  const items = await Portfolio.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(500);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, count: items.length, data: items });
});

// ---------------------------------------------------------------- everything below: ADMIN only
// GET /api/portfolio/admin → every photo including drafts, newest first
export const getAdminPortfolio = asyncHandler(async (req, res) => {
  const items = await Portfolio.find().sort({ createdAt: -1 }).limit(500);
  res.json({ success: true, count: items.length, data: items });
});

// GET /api/portfolio/upload-signature → permission for ONE direct-to-Cloudinary upload
export const getUploadSignature = (req, res) => {
  if (!isConfigured()) {
    throw httpError(503, 'Image storage is not set up yet. Add your Cloudinary keys to server/.env, or use "Paste an image URL" instead.');
  }
  res.json({ success: true, data: createUploadSignature() });
};

// POST /api/portfolio   { title, category, description?, featured?, isPublished?, image: { url, publicId?, width?, height? } }
export const createPhoto = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const img = b.image && typeof b.image === 'object' ? b.image : {};
  const image = { url: str(img.url), publicId: str(img.publicId), width: num(img.width), height: num(img.height) };

  // An uploaded image must really come from our own Cloudinary folder
  if (image.publicId && !isOwnImage(image)) throw httpError(400, 'That image was not uploaded through the portfolio uploader.');

  const photo = await Portfolio.create({
    image,
    title: str(b.title),
    category: str(b.category),
    description: str(b.description),
    alt: str(b.alt),
    featured: bool(b.featured),
    isPublished: bool(b.isPublished),
    sortOrder: num(b.sortOrder),
  });
  res.status(201).json({ success: true, data: photo });
});

// PATCH /api/portfolio/:id   → title, category, description, alt, featured, isPublished, sortOrder (the image itself cannot be swapped: delete and add a new one)
const EDITABLE = ['title', 'category', 'description', 'alt', 'featured', 'isPublished', 'sortOrder'];

export const updatePhoto = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const photo = await findPhoto(req.params.id);
  const alwaysFollowsTitle = photo.alt === photo.title; // alt text that was just the title keeps following it

  let touched = false;
  EDITABLE.forEach((key) => {
    if (key in body) { photo[key] = body[key]; touched = true; }
  });
  if (!touched) throw httpError(400, `Nothing to update. You can change: ${EDITABLE.join(', ')}.`);
  if (alwaysFollowsTitle && !('alt' in body)) photo.alt = photo.title;

  await photo.save();
  res.json({ success: true, data: photo });
});

// DELETE /api/portfolio/:id   → removes the record AND the stored file
export const deletePhoto = asyncHandler(async (req, res) => {
  const photo = await findPhoto(req.params.id);
  const publicId = photo.image?.publicId;
  await photo.deleteOne();

  // storageDeleted: true = file removed · false = could not reach storage (file may be left behind) · null = nothing stored (pasted URL)
  let storageDeleted = null;
  if (publicId) {
    try {
      storageDeleted = await deleteImage(publicId);
    } catch (err) {
      console.error(`[storage] could not delete ${publicId}:`, err.message);
      storageDeleted = false;
    }
  }
  res.json({
    success: true,
    message: storageDeleted === false ? 'Photo removed from the website, but the stored file could not be deleted.' : 'Photo deleted.',
    storageDeleted,
  });
});
