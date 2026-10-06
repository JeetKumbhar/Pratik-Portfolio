import api from './api';

/**
 * Packages come from the database, so the admin can add, edit, hide or reorder them
 * without any frontend change.   Shape: { id, name, tagline, price, duration, durationHours, features[], popular, category }
 * Optional: getPackages('wedding') → wedding packages + the "general" ones.
 */
export async function getPackages(category) {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const { data } = await api.get(`/packages${query}`);
  return data;
}
