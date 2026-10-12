/** Image helpers shared by the public gallery and the admin uploader. Pure functions, no React. */
export const MAX_FILE_MB = 10; // Cloudinary's free plan accepts images up to 10 MB
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** '' when the file is fine, otherwise a message for the person */
export function validateImageFile(file) {
  if (!file) return 'Choose a photo to upload.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `That image is too large. The limit is ${MAX_FILE_MB} MB.`;
  if (file.size === 0) return 'That file is empty.';
  return '';
}

const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

/**
 * Asks Cloudinary for a copy sized for the screen, in the best format the browser supports (WebP/AVIF).
 * A 6 MB original becomes roughly 100 KB. Any other URL (e.g. a local /images/... path) is returned unchanged.
 */
export function transformUrl(url, { width } = {}) {
  if (!url || !width || !CLOUDINARY.test(url)) return url;
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${width}/`);
}

/** Same rule the server applies: an https:// address or a /site-path (not javascript:, data: or //host) */
export const isImageUrlOrPath = (value) => /^(https?:\/\/\S+|\/(?!\/)\S*)$/i.test(String(value ?? ''));

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "IMG_2041-golden_hour.jpg" → "IMG 2041 golden hour"  (a starting point for the title) */
export function titleFromFilename(name = '') {
  const words = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
