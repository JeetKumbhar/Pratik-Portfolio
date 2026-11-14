import { Portfolio } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { PORTFOLIO_CATEGORIES } from '../config/constants.js';
import { createUploadSignature, deleteImage, isConfigured, isOwnImage } from '../utils/imageStorage.js';
import * as r2 from '../utils/r2Storage.js';
import { createIntent, verifyIntent } from '../utils/uploadIntent.js';
import { ALLOWED_IMAGE_TYPES, inspectImage } from '../utils/imageInspect.js';

const str = (v) => (typeof v === 'string' ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function findPhoto(id) {
  const photo = /^[a-f\d]{24}$/i.test(id) ? await Portfolio.findById(id) : null;
  if (!photo) throw httpError(404, 'Photo not found');
  return photo;
}

async function clearFeaturedInCategory(category, field, exceptId) {
  await Portfolio.updateMany(
    { category, [field]: true, ...(exceptId && { _id: { $ne: exceptId } }) },
    { $set: { [field]: false } }
  );
}

// ---------------------------------------------------------------- GET /api/portfolio  (PUBLIC)
// ?category=wedding, ?featured=true or ?serviceFeatured=true → published photos only, in display order
export const getPublicPortfolio = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  const { category, featured, serviceFeatured } = req.query;
  if (category !== undefined) {
    if (typeof category !== 'string' || !PORTFOLIO_CATEGORIES.includes(category)) {
      throw httpError(400, `Invalid category. Use one of: ${PORTFOLIO_CATEGORIES.join(', ')}`);
    }
    filter.category = category;
  }
  if (featured !== undefined) {
    if (featured !== 'true' && featured !== 'false') throw httpError(400, 'Featured must be true or false');
    filter.featured = featured === 'true';
  }
  if (serviceFeatured !== undefined) {
    if (serviceFeatured !== 'true' && serviceFeatured !== 'false') throw httpError(400, 'Service featured must be true or false');
    filter.serviceFeatured = serviceFeatured === 'true';
  }
  const items = await Portfolio.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(500);
  res.set('Cache-Control', featured === undefined && serviceFeatured === undefined ? 'public, max-age=60' : 'no-store');
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

// The text fields of a new photo come from the request body; `image` is decided by the caller (never copied from the body wholesale)
const buildPhoto = (b, image) => new Portfolio({
  image,
  title: str(b.title),
  category: str(b.category),
  description: str(b.description),
  alt: str(b.alt),
  featured: bool(b.featured),
  serviceFeatured: bool(b.serviceFeatured),
  isPublished: bool(b.isPublished),
  sortOrder: num(b.sortOrder),
});

async function savePhoto(b, image) {
  const photo = buildPhoto(b, image);
  if (photo.featured || photo.serviceFeatured) {
    await photo.validate();
    if (photo.featured) await clearFeaturedInCategory(photo.category, 'featured');
    if (photo.serviceFeatured) await clearFeaturedInCategory(photo.category, 'serviceFeatured');
  }
  await photo.save();
  return photo;
}

// POST /api/portfolio   { title, category, description?, featured?, serviceFeatured?, isPublished?, image: { url, publicId?, width?, height? } }
// (Cloudinary uploads and pasted URLs. Photos stored in R2 are saved by finalizeUpload below, never from here.)
export const createPhoto = asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const img = b.image && typeof b.image === 'object' ? b.image : {};
  const image = { url: str(img.url), publicId: str(img.publicId), width: num(img.width), height: num(img.height) };

  // An uploaded image must really come from our own Cloudinary folder
  if (image.publicId && !isOwnImage(image)) throw httpError(400, 'That image was not uploaded through the portfolio uploader.');

  const photo = await savePhoto(b, image);
  res.status(201).json({ success: true, data: photo });
});

// ---------------------------------------------------------------- direct-to-R2 uploads (original photographs)
// GET /api/portfolio/upload-config → which storage new photos go to, and the limits the upload screen should show
export const getUploadConfig = (req, res) => {
  const provider = r2.activeProvider();
  res.json({
    success: true,
    data: {
      provider, // 'cloudinary' (today's flow: GET /upload-signature) or 'r2' (POST /uploads then POST /uploads/finalize)
      ready: provider === 'r2' ? r2.isConfigured() : isConfigured(),
      maxBytes: provider === 'r2' ? r2.maxUploadBytes() : null, // Cloudinary's limit depends on its plan and is not known here
      allowedTypes: ALLOWED_IMAGE_TYPES,
    },
  });
};

function requireR2() {
  if (r2.activeProvider() !== 'r2') throw httpError(409, 'Uploads to Cloudflare R2 are switched off: new photos are going to Cloudinary.');
  const missing = r2.missingSettings();
  if (missing.length) throw httpError(503, `Cloudflare R2 is not set up yet. Missing in the server settings: ${missing.join(', ')}.`);
}

const fieldError = (field, message) => Object.assign(httpError(400, message), { fieldErrors: { [field]: message } });
const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;

// POST /api/portfolio/uploads   { contentType, size }   → permission to upload ONE file straight to R2
//   → { uploadUrl, method: 'PUT', headers: { 'Content-Type' }, token, expiresIn, maxBytes }
//   The browser PUTs the file to uploadUrl with exactly those headers, then calls finalize with the token.
//   The file lands in the TEMPORARY folder (tmp/); finalize moves it to permanent storage. Anything never finalized is removed by the
//   bucket's lifecycle rule for tmp/ (see the Phase 1 README), so abandoned or oversized uploads never pile up next to real photos.
export const requestUpload = asyncHandler(async (req, res) => {
  requireR2();
  const { contentType, size } = req.body ?? {}; // a file NAME is deliberately not accepted: the storage key is always made here
  if (!r2.isAllowedType(contentType)) throw fieldError('contentType', 'Use a JPG, PNG or WebP photo.');
  if (!Number.isInteger(size) || size < 1) throw fieldError('size', 'That file is empty.');
  const max = r2.maxUploadBytes();
  if (size > max) throw fieldError('size', `That photo is ${megabytes(size)}. The largest photo allowed is ${megabytes(max)}.`);

  const key = r2.createTempKey(contentType); // a temporary key: the photo only reaches permanent storage when finalize has checked it
  const uploadUrl = await r2.presignPut(key, contentType);
  const token = createIntent({ key, type: contentType, size, adminId: req.user._id });
  res.status(201).json({
    success: true,
    data: { uploadUrl, method: 'PUT', headers: { 'Content-Type': contentType }, token, expiresIn: r2.PRESIGN_SECONDS, maxBytes: max },
  });
});

const discardUpload = async (key) => { // a refused file is not kept; if R2 cannot be reached now, the lifecycle rule for tmp/ removes it later
  try { await r2.remove(key); } catch { /* ignore */ }
};

const REFUSED = {
  not_an_image: 'That file is not a valid JPG, PNG or WebP photo, so it was not kept.',
  type_mismatch: 'That file is not a valid JPG, PNG or WebP photo (it is not the type it announced), so it was not kept.',
  incomplete: 'That photo is incomplete (the file ends too early), so it was not kept. Please upload it again.',
  malformed: 'That photo file is damaged, so it was not kept. Please export it again and upload the new file.',
  unsupported: 'That JPEG uses a format browsers cannot display, so it was not kept. Please export it as a standard JPEG.',
  too_large: 'That photo is more than 65,535 pixels wide or high, so it was not kept.',
  changed: 'The uploaded file changed while it was being checked, so it was not kept. Please upload it again.',
};

// The permanent copy exists but no record points to it (saving failed): remove it, unless a record DOES point to it (a concurrent finalize
// of the same upload won) or we cannot find out. Deleting a file that a visible photo uses would be worse than leaving one stray file.
const dropUnreferenced = async (finalKey) => {
  try {
    if (await Portfolio.findOne({ 'image.key': finalKey })) return;
    await r2.remove(finalKey);
  } catch { /* unsure → keep the file */ }
};

// POST /api/portfolio/uploads/finalize   { token, title, category, description?, alt?, featured?, serviceFeatured?, isPublished?, sortOrder? }
//   Called after the browser finished the PUT. Order of events (nothing is saved in MongoDB unless every step before it succeeded):
//     1. the token is verified; if the upload was already finalized, the first record is returned (safe to repeat, no storage contact)
//     2. the text fields are validated (a missing title is refused before storage is touched)
//     3. the TEMPORARY object is measured (size, type) and its whole content is validated as a complete JPEG/PNG/WebP
//     4. it is copied inside R2 to the permanent key (only if it is still the version that was checked), and the copy is verified
//     5. the record is saved; then the temporary object is deleted
//   Refused files are deleted from tmp/. If a step fails for another reason (R2 or MongoDB trouble) the temporary object stays, the
//   same token can finalize again, and the lifecycle rule for tmp/ removes it if nobody does.
export const finalizeUpload = asyncHandler(async (req, res) => {
  requireR2();
  const b = req.body ?? {};
  const intent = verifyIntent(b.token, req.user._id);
  if (!r2.isTempKey(intent.key) || !r2.isAllowedType(intent.type)) throw httpError(400, 'This upload request is not valid. Please choose the photo again.');
  const finalKey = r2.finalKeyFor(intent.key);

  const already = () => Portfolio.findOne({ 'image.key': finalKey });
  const duplicate = (photo) => res.json({ success: true, duplicate: true, data: photo });
  /** A temporary object that is gone or different: maybe a parallel finalize of the same upload just finished (then return its record). */
  const unusable = async (message, { discard }) => {
    const winner = await already();
    if (winner) return duplicate(winner);
    if (discard) await discardUpload(intent.key);
    throw httpError(400, message);
  };

  const first = await already();
  if (first) return duplicate(first);

  const image = { url: r2.publicUrl(finalKey), provider: 'r2', key: finalKey, bytes: intent.size, contentType: intent.type };
  await buildPhoto(b, image).validate(); // 400 with field errors, before storage is touched

  const stored = await r2.head(intent.key);
  if (!stored) return unusable('The photo did not arrive in storage. Please upload it again.', { discard: false });
  if (stored.size !== intent.size || stored.size > r2.maxUploadBytes() || stored.contentType !== intent.type) {
    await discardUpload(intent.key);
    throw httpError(400, 'The uploaded file is not what was announced (different size or type), so it was not kept. Please upload it again.');
  }

  // The whole temporary file is read once, as a stream, and must be a complete picture of the announced type
  let seen;
  try {
    seen = await inspectImage(r2.openRead(intent.key, { etag: stored.etag }), intent.type, { maxBytes: stored.size });
  } catch (err) {
    if (err?.objectChanged) return unusable(REFUSED.changed, { discard: true });
    throw err;
  }
  if (!seen.ok) {
    if (seen.reason === 'changed') return unusable(REFUSED.changed, { discard: true });
    await discardUpload(intent.key);
    throw httpError(400, REFUSED[seen.reason] ?? REFUSED.malformed);
  }

  // Into permanent storage (a copy inside R2). It only happens if the temporary file is still exactly what was checked.
  try {
    await r2.copy(intent.key, finalKey, { etag: stored.etag });
  } catch (err) {
    if (err?.objectChanged) return unusable(REFUSED.changed, { discard: true });
    throw err; // R2 trouble: nothing was recorded, the temporary file stays, the same token can finalize again
  }

  let photo;
  try {
    const copied = await r2.head(finalKey);
    if (!copied || copied.size !== stored.size) throw httpError(502, 'The photo could not be copied into permanent storage. Please try again.');
    photo = await savePhoto(b, { ...image, bytes: stored.size, width: seen.width, height: seen.height });
  } catch (err) {
    if (err?.code === 11000) { // two requests finalized the same upload at the same moment: the unique key let only one in
      let winner = null;
      try { winner = await already(); } catch { /* cannot ask: handled below like any other failure */ }
      if (winner) return duplicate(winner);
    }
    await dropUnreferenced(finalKey);
    throw err;
  }
  await discardUpload(intent.key); // the temporary object is no longer needed (if this fails, the lifecycle rule removes it)
  res.status(201).json({ success: true, data: photo });
});

// PATCH /api/portfolio/:id   → title, category, description, alt, featured, serviceFeatured, isPublished, sortOrder (the image itself cannot be swapped: delete and add a new one)
const EDITABLE = ['title', 'category', 'description', 'alt', 'featured', 'serviceFeatured', 'isPublished', 'sortOrder'];

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

  if (photo.featured || photo.serviceFeatured) {
    await photo.validate();
    if (photo.featured) await clearFeaturedInCategory(photo.category, 'featured', photo._id);
    if (photo.serviceFeatured) await clearFeaturedInCategory(photo.category, 'serviceFeatured', photo._id);
  }
  await photo.save();
  res.json({ success: true, data: photo });
});

// DELETE /api/portfolio/:id   → removes the record AND the stored file
export const deletePhoto = asyncHandler(async (req, res) => {
  const photo = await findPhoto(req.params.id);
  const inR2 = photo.image?.provider === 'r2' && Boolean(photo.image.key);
  const stored = inR2 ? photo.image.key : photo.image?.publicId; // R2 object key, or the Cloudinary public id
  await photo.deleteOne();

  // storageDeleted: true = file removed · false = could not reach storage (file may be left behind) · null = nothing stored (pasted URL)
  let storageDeleted = null;
  if (stored) {
    try {
      storageDeleted = inR2 ? await r2.remove(stored) : await deleteImage(stored);
    } catch (err) {
      console.error(`[storage] could not delete ${stored}:`, err.message);
      storageDeleted = false;
    }
  }
  res.json({
    success: true,
    message: storageDeleted === false ? 'Photo removed from the website, but the stored file could not be deleted.' : 'Photo deleted.',
    storageDeleted,
  });
});
