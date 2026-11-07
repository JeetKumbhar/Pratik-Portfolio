import { useEffect } from 'react';
import { setPageSeo } from '../utils/pageSeoStore';

/**
 * A page that wants its own title/description in Google and when shared:   usePageSeo({ title: 'Wedding photography', description: '…' })
 * Whatever is given here wins over Settings → SEO & Social; anything left out falls back to the saved default.
 * Fields: title, description, shareTitle, shareDescription, image, canonical.
 */
export default function usePageSeo(values) {
  const key = JSON.stringify(values ?? {});
  useEffect(() => {
    setPageSeo(JSON.parse(key));
    return () => setPageSeo({});
  }, [key]);
}
