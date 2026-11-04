import api from './api';

/**
 * The public gallery now comes from the database (published photos only), so photos you add in
 * Admin → Portfolio appear on the website without any code change.
 * Shape: { id, title, category, description, alt, ratio, src, ... }  (the same fields the gallery already used)
 */
export async function getPortfolioItems() {
  const { data } = await api.get('/portfolio');
  return data;
}

/** Returns published photos marked for the homepage; this request is not cached by the API. */
export async function getFeaturedPortfolio() {
  const { data } = await api.get('/portfolio', { params: { featured: true } });
  return data;
}

/** Returns published photos marked for the Services page; this request is not cached by the API. */
export async function getServiceFeaturedPortfolio() {
  const { data } = await api.get('/portfolio', { params: { serviceFeatured: true } });
  return data;
}
