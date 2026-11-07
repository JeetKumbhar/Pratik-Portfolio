import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import useSettings from '../../hooks/useSettings';
import { buildHead } from '../../utils/seoHead';
import { getPageSeo, subscribePageSeo } from '../../utils/pageSeoStore';

/** Sets (or removes) one <meta> / <link> in the head. The tags are marked so we only ever touch our own. */
function setTag(selector, create, attr, value) {
  let el = document.head.querySelector(selector);
  if (!value) { if (el?.dataset.seoManaged) el.remove(); return; }
  if (!el) { el = create(); el.dataset.seoManaged = 'true'; document.head.appendChild(el); }
  el.setAttribute(attr, value);
}
const meta = (key, name, value) => setTag(`meta[${key}="${name}"]`, () => { const m = document.createElement('meta'); m.setAttribute(key, name); return m; }, 'content', value);

/**
 * Applies Settings → SEO & Social to the public pages: title, description, keywords, canonical link, share (Open Graph / Twitter)
 * tags and the favicon. Renders nothing. Mounted once in the public layout, so the admin pages are never touched.
 */
export default function SeoManager() {
  const { settings, loaded } = useSettings();
  const { pathname } = useLocation();
  const page = useSyncExternalStore(subscribePageSeo, getPageSeo);

  // Leaving the public site (to the admin pages) puts the page back as it was served
  useEffect(() => {
    const original = document.title;
    const icon = document.head.querySelector('link[rel~="icon"]');
    const iconHref = icon?.getAttribute('href');
    const iconType = icon?.getAttribute('type');
    return () => {
      document.title = original;
      document.head.querySelectorAll('[data-seo-managed]').forEach((el) => el.remove());
      if (icon && iconHref !== undefined && iconHref !== null) { icon.setAttribute('href', iconHref); if (iconType) icon.setAttribute('type', iconType); }
    };
  }, []);

  useEffect(() => {
    if (!loaded) return; // until the real settings arrive the page keeps the title it was served with (no flash of defaults)
    const head = buildHead(settings, page, pathname);
    if (head.title) document.title = head.title;
    meta('name', 'description', head.description);
    meta('name', 'keywords', head.keywords);
    meta('property', 'og:title', head.og.title);
    meta('property', 'og:description', head.og.description);
    meta('property', 'og:image', head.og.image);
    meta('property', 'og:url', head.og.url);
    meta('property', 'og:site_name', head.og.siteName);
    meta('property', 'og:type', head.og.type);
    meta('name', 'twitter:card', head.twitter.card);
    meta('name', 'twitter:title', head.twitter.title);
    meta('name', 'twitter:description', head.twitter.description);
    meta('name', 'twitter:image', head.twitter.image);
    setTag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, 'href', head.canonical);
    if (head.favicon) {
      const icon = document.head.querySelector('link[rel~="icon"]');
      if (icon) { if (!icon.dataset.original) icon.dataset.original = icon.getAttribute('href') ?? ''; icon.removeAttribute('type'); icon.setAttribute('href', head.favicon); }
    }
  }, [settings, loaded, page, pathname]);

  return null;
}
