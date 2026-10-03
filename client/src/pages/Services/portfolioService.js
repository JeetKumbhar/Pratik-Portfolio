import { PORTFOLIO_ITEMS } from '../components/portfolio/portfolioData';

/**
 * Phase 1: returns the static list.
 * Phase 2 (MongoDB): replace the body with a real request, keep the same return shape:
 *   const { data } = await api.get('/portfolio');   // api from ./api.js
 *   return data;                                    // [{ id, category, title, alt, src, ratio }]
 * The Portfolio page won't need to change.
 */
export async function getPortfolioItems() {
  // Small delay so you can see the loading skeleton. Remove when using the real API.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return PORTFOLIO_ITEMS;
}
