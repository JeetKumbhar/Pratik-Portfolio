/**
 * STATIC PORTFOLIO DATA (phase 1). Later this moves to MongoDB; see services/portfolioService.js.
 *
 * Put photos in:  client/public/images/portfolio/gallery/
 * named:          <category>-01.jpg, <category>-02.jpg ...   e.g. wedding-01.jpg, pre-wedding-02.jpg
 * Any missing file shows a gradient placeholder, so the page works before you add photos.
 * `ratio` (width / height) reserves space so the grid doesn't jump while images load.
 */
export const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'events', label: 'Events' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'family', label: 'Family' },
  { value: 'pre-wedding', label: 'Pre-Wedding' },
  { value: 'landscape', label: 'Landscape' },
];

/** Old links from the Home page (?category=weddings) still work. */
export const CATEGORY_ALIASES = { weddings: 'wedding', portraits: 'portrait', landscapes: 'landscape' };

export const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label ?? value;

export const CATEGORY_GRADIENTS = {
  wedding: 'linear-gradient(160deg, #4a3a2a, #0e0b08)',
  portrait: 'linear-gradient(160deg, #5a3d22, #120d08)',
  events: 'linear-gradient(160deg, #4a2a5a, #0b0810)',
  commercial: 'linear-gradient(160deg, #2a3a4a, #080b0e)',
  family: 'linear-gradient(160deg, #5a4a2a, #100c08)',
  'pre-wedding': 'linear-gradient(160deg, #5a2a3a, #10080b)',
  landscape: 'linear-gradient(160deg, #6a4a28, #0b0e12)',
};

const RATIOS = [0.75, 1, 0.8, 1.333, 0.667];

const make = (category, count) =>
  Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const label = categoryLabel(category);
    return {
      id: `${category}-${n}`,
      category,
      title: `${label} ${n}`,
      alt: `${label} photograph by Alex Morgan, number ${i + 1}`,
      src: `/images/portfolio/gallery/${category}-${n}.jpg`,
      ratio: RATIOS[(i + category.length) % RATIOS.length],
    };
  });

// Interleave categories so the "All" view is a nice mix instead of grouped blocks
const groups = [
  make('wedding', 4), make('portrait', 3), make('events', 3), make('commercial', 3),
  make('family', 3), make('pre-wedding', 3), make('landscape', 3),
];
export const PORTFOLIO_ITEMS = Array.from({ length: Math.max(...groups.map((g) => g.length)) }, (_, i) =>
  groups.map((g) => g[i]).filter(Boolean)
).flat();
