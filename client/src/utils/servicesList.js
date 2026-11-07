/**
 * The photography services as the website uses them. They are records in the database now (Admin → Settings → Services);
 * FALLBACK_SERVICES is only what is shown if the server cannot be reached, so the booking form still opens.
 * Pure: no React.
 */
export const FALLBACK_SERVICES = [
  { id: 'wedding', slug: 'wedding', name: 'Weddings', description: 'Ceremony and celebration' },
  { id: 'pre-wedding', slug: 'pre-wedding', name: 'Pre-weddings', description: 'Couple sessions' },
  { id: 'portrait', slug: 'portrait', name: 'Portrait', description: 'Individuals, professionals, branding' },
  { id: 'baby-shoot', slug: 'baby-shoot', name: 'Baby-Shoots', description: 'Precious little moments' },
  { id: 'events', slug: 'events', name: 'Events', description: 'Parties, corporate events, occasions' },
  { id: 'commercial', slug: 'commercial', name: 'Commercial', description: 'Brands, products, campaigns' },
].map((s, i) => ({ ...s, coverImage: '', sortOrder: (i + 1) * 10 }));

/** The server's list → clean, ordered rows. Anything without an id or name is dropped. */
export function normalizeServices(list) {
  if (!Array.isArray(list)) return FALLBACK_SERVICES;
  return list
    .filter((s) => s && typeof s.slug === 'string' && s.slug && typeof s.name === 'string' && s.name)
    .map((s) => ({ id: s.slug, slug: s.slug, name: s.name, description: s.description || '', coverImage: s.coverImage || '', sortOrder: Number(s.sortOrder) || 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The name to show for a service id. A deleted or switched-off service still has a readable name on old bookings. */
export function serviceName(services, slug, savedName) {
  if (savedName) return savedName; // the name the booking was made under (Booking.shootTypeName)
  const found = services?.find((s) => s.slug === slug);
  if (found) return found.name;
  if (slug === 'custom') return 'Custom';
  const words = String(slug ?? '').replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}
