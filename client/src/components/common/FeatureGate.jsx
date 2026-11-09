import { useSite } from '../../hooks/useSettings';
import PageLoader from './PageLoader';
import NotFound from '../../pages/NotFound/NotFound';

/**
 * Shows its page only when that page is switched on in Admin → Settings → Website.
 * <FeatureGate feature="portfolio"> … </FeatureGate>   (feature: 'portfolio' | 'contact')
 * Switched off → the normal "Page not found". While the settings are still loading nothing is decided yet (no flash of the page).
 */
export default function FeatureGate({ feature, children }) {
  const { loaded, portfolioEnabled, contactEnabled } = useSite();
  if (!loaded) return <PageLoader />;
  const on = feature === 'portfolio' ? portfolioEnabled : feature === 'contact' ? contactEnabled : true;
  return on ? children : <NotFound />;
}
