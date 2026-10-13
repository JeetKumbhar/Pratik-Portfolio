/** Small pure helpers for the package admin API (no database, easy to test). */

/** "Wedding Deluxe!" → "wedding-deluxe": the same rule the Package model uses to make its link name (slug). */
export const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The booking form's "Not sure yet" option uses the slug "custom", so no real package may take it. */
export const RESERVED_SLUGS = ['custom'];
export const isReservedName = (name) => RESERVED_SLUGS.includes(slugify(name ?? ''));

/** ['  Online gallery ', '', 42, 'Print release'] → ['Online gallery', 'Print release'];  anything that is not a list → undefined */
export function cleanFeatures(value) {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}
