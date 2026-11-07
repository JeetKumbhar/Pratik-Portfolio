/** The current page's own SEO values (see hooks/usePageSeo.js). A tiny store so SeoManager can re-apply when a page sets or clears them. */
let current = {};
const listeners = new Set();

export const getPageSeo = () => current;
export function setPageSeo(values) {
  current = values && typeof values === 'object' ? values : {};
  listeners.forEach((fn) => fn());
}
export function subscribePageSeo(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
