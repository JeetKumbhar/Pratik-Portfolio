import { createHash } from 'node:crypto';

/**
 * Image storage = Cloudinary (free tier). Photos are uploaded by the BROWSER straight to Cloudinary using a short-lived
 * signature from this server, so large files never pass through (or get stored by) our server or MongoDB.
 * MongoDB only keeps the resulting URL + public id.
 *
 * Swapping to ImageKit (or anything else) later means rewriting only this file:
 *   isConfigured · createUploadSignature · isOwnImage · deleteImage
 *
 * .env:  CLOUDINARY_CLOUD_NAME   CLOUDINARY_API_KEY   CLOUDINARY_API_SECRET   CLOUDINARY_FOLDER (optional)
 * The API SECRET never leaves the server. The browser only receives a signature that is valid for about an hour
 * and only for the folder / formats chosen here.
 */
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';

const cfg = () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: (process.env.CLOUDINARY_FOLDER || 'alex-morgan/portfolio').replace(/^\/+|\/+$/g, ''),
});

export const isConfigured = () => {
  const { cloudName, apiKey, apiSecret } = cfg();
  return Boolean(cloudName && apiKey && apiSecret);
};

/** Cloudinary signature: SHA-1 of the sorted "key=value" pairs joined with "&", with the API secret appended. */
export function sign(params, secret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + secret).digest('hex');
}

/** What the browser needs to upload ONE image directly to Cloudinary. */
export function createUploadSignature(now = Date.now()) {
  const { cloudName, apiKey, apiSecret, folder } = cfg();
  const timestamp = Math.floor(now / 1000);
  const signature = sign({ allowed_formats: ALLOWED_FORMATS, folder, timestamp }, apiSecret);
  return { cloudName, apiKey, timestamp, folder, allowedFormats: ALLOWED_FORMATS, signature };
}

/**
 * A photo record may only point at an image that came out of OUR Cloudinary folder.
 * (Photos added by pasting a URL carry no publicId and skip this check.)
 */
export function isOwnImage({ url, publicId }) {
  const { cloudName, folder } = cfg();
  if (!cloudName || typeof url !== 'string' || typeof publicId !== 'string') return false;
  return (
    url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`) &&
    publicId.startsWith(`${folder}/`) &&
    !publicId.includes('..') &&
    url.includes(publicId)
  );
}

/** Removes the file from Cloudinary (and its CDN cache). Resolves true when it is gone; throws on a network/API failure. */
export async function deleteImage(publicId) {
  const { cloudName, apiKey, apiSecret } = cfg();
  if (!isConfigured()) throw new Error('Image storage is not configured.');

  const timestamp = Math.floor(Date.now() / 1000);
  const params = { invalidate: 'true', public_id: publicId, timestamp };
  const body = new URLSearchParams({ ...params, api_key: apiKey, signature: sign(params, apiSecret) });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary answered ${res.status}`);
  return data.result === 'ok' || data.result === 'not found'; // "not found" = already gone
}
