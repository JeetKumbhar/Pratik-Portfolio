import { Maximize2 } from 'lucide-react';
import PortfolioImage from './PortfolioImage';
import { categoryLabel } from './portfolioData';

export default function GalleryCard({ item, onOpen }) {
  return (
    <button type="button" className="gallery-card" onClick={onOpen} aria-label={`Open ${item.title} in full screen`}>
      <span className="gallery-card__media" style={{ aspectRatio: item.ratio }}>
        <PortfolioImage item={item} className="gallery-card__img" />
        <span className="gallery-card__overlay">
          <span>
            <span className="gallery-card__title">{item.title}</span>
            <span className="gallery-card__cat">{categoryLabel(item.category)}</span>
          </span>
          <span className="gallery-card__icon"><Maximize2 size={16} /></span>
        </span>
      </span>
    </button>
  );
}
