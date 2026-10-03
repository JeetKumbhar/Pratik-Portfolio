/**
 * Pricing packages: STATIC for now.
 *
 * Later (admin-editable, MongoDB): replace the body of getPackages() with
 *   const { data } = await api.get('/packages');   // api from ./api.js
 *   return data;
 * and add createPackage / updatePackage / deletePackage for the Admin panel.
 * Keep this shape so PricingSection and PricingCard don't change:
 *   { id, name, tagline, price, duration, features[], popular }
 */
const PACKAGES = [
  {
    id: 'essential',
    name: 'Essential',
    tagline: 'Perfect for personal sessions',
    price: 600,
    duration: '1 hour',
    features: ['1 location', '30+ edited photos', 'Online gallery', 'Print release'],
    popular: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    tagline: 'Great for couples & small events',
    price: 1200,
    duration: '2 hours',
    features: ['1 to 2 locations', '75+ edited photos', 'Online gallery', 'Print release', 'Pre-shoot consultation'],
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'For weddings & big moments',
    price: 2500,
    duration: 'Up to 6 hours',
    features: ['Multiple locations', '150+ edited photos', 'Online gallery', 'Print release', 'Pre-shoot consultation', 'Photo album (10x10)'],
    popular: false,
  },
];

export async function getPackages() {
  return PACKAGES;
}
