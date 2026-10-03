const RATIOS = [0.75, 1, 0.8, 1.333, 0.667, 0.75, 1, 0.8];

/** Skeleton cards shown while portfolio data loads (same masonry layout as the real grid). */
export default function GalleryLoader({ count = 8 }) {
  return (
    <ul className="gallery-grid" aria-busy="true" aria-label="Loading gallery">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="gallery-grid__item">
          <div className="skeleton" style={{ aspectRatio: RATIOS[i % RATIOS.length] }} />
        </li>
      ))}
    </ul>
  );
}
