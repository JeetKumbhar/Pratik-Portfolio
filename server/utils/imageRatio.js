export const MIN_RATIO = 0.3; // very tall
export const MAX_RATIO = 3; // very wide (panorama)

/**
 * width ÷ height, kept within a range the gallery layout can handle.
 * Returns null if either size is missing. e.g. 1200x800 → 1.5, 800x1200 → 0.667
 */
export function ratioFromSize(width, height) {
  if (!(width > 0) || !(height > 0)) return null;
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
  return Math.round(ratio * 1000) / 1000;
}
