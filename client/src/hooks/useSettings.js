import { useContext, useMemo } from 'react';
import { SettingsContext } from '../context/SettingsContext';
import { brandParts, ctaText, homeBlocks, socialLinks, visibleNav } from '../utils/siteSettings';
import { DEFAULT_FORMAT, formatDateKey, formatMoney, formatTimeKey } from '../utils/siteFormat';
import { serviceName } from '../utils/servicesList';

/** Public settings + services for any component: const { settings, services, loaded, refresh } = useSettings(); */
export default function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

/** Ready-made values for the layout: the logo name, social links, which pages exist, the main button text. */
export function useSite() {
  const { settings, loaded } = useSettings();
  return useMemo(() => ({
    settings,
    loaded,
    brand: brandParts(settings.general),
    social: socialLinks(settings.business, settings.general),
    home: homeBlocks(settings.website),
    cta: ctaText(settings.website),
    portfolioEnabled: settings.website.portfolio.enabled !== false,
    contactEnabled: settings.website.contact.enabled !== false,
    nav: (links) => visibleNav(links, settings.website),
  }), [settings, loaded]);
}

/** money / date / time written the way Settings → General says. Use these instead of formatting by hand. */
export function useFormatters() {
  const { settings, services } = useSettings();
  const { currency, dateFormat, timeFormat } = settings.general ?? DEFAULT_FORMAT;
  return useMemo(() => ({
    money: (n) => formatMoney(n, currency),
    formatDate: (key) => formatDateKey(key, dateFormat),
    formatTime: (t) => formatTimeKey(t, timeFormat),
    serviceLabel: (slug, savedName) => serviceName(services, slug, savedName),
  }), [currency, dateFormat, timeFormat, services]);
}
