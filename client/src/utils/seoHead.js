/**
 * What goes in the page <head> for the PUBLIC site, from Admin → Settings → SEO & Social. Pure: no DOM, no React
 * (components/seo/SeoManager.jsx writes the result into the page).
 *
 * A page can set its own values with usePageSeo({ title, description, ... }). Those win; the saved defaults fill the rest, so
 * a page's own SEO is never overwritten.
 */
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/** 'https://site.com/' + '/services' → 'https://site.com/services'. '' when no canonical website address is saved. */
export function canonicalFor(base, pathname = '/') {
  const root = clean(base).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(root)) return '';
  const path = pathname === '/' ? '' : `/${String(pathname).replace(/^\/+|\/+$/g, '')}`;
  return `${root}${path}`;
}

/**
 * settings = the public settings ({ general, seo }); page = optional per-page override; pathname = the current route.
 * Returns the tags to show. Empty strings mean "leave that tag out".
 */
export function buildHead(settings, page = {}, pathname = '/') {
  const seo = settings?.seo ?? {};
  const general = settings?.general ?? {};
  const siteName = clean(general.websiteName);

  const title = clean(page.title) || clean(seo.title) || siteName;
  const description = clean(page.description) || clean(seo.description);
  // A page with its own title keeps it for sharing too, unless the page gave its own share text
  const shareTitle = clean(page.shareTitle) || (clean(page.title) ? clean(page.title) : clean(seo.shareTitle) || title);
  const shareDescription = clean(page.shareDescription) || (clean(page.description) ? clean(page.description) : clean(seo.shareDescription) || description);
  const image = clean(page.image) || clean(seo.ogImage?.url);
  const canonical = clean(page.canonical) || canonicalFor(seo.canonicalUrl, pathname);

  return {
    title,
    description,
    keywords: clean(seo.keywords),
    canonical,
    favicon: clean(general.favicon?.url),
    og: { title: shareTitle, description: shareDescription, image, url: canonical, siteName, type: 'website' },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: shareTitle, description: shareDescription, image },
  };
}
