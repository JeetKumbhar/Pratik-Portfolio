import { ImageOff } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import GalleryCard from './GalleryCard';

/** items: the already-filtered list · onOpen(index) opens the lightbox at that position */
export default function GalleryGrid({ items, onOpen }) {
  if (!items.length) {
    return <EmptyState icon={<ImageOff size={28} />} title="Nothing here yet" message="No photos in this category yet. Check back soon." />;
  }

  return (
    <ul className="gallery-grid">
      {items.map((item, i) => (
        <li key={item.id} className="gallery-grid__item">
          <GalleryCard item={item} onOpen={() => onOpen(i)} />
        </li>
      ))}
    </ul>
  );
}
