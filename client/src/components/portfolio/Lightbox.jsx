import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import PortfolioImage from './PortfolioImage';
import { categoryLabel } from './portfolioData';

/**
 * index === null → closed.
 * Keys: Esc closes · ← → navigate. Touch: swipe left/right. Click the dark area to close.
 */
export default function Lightbox({ items, index, onClose, onIndexChange }) {
  const item = index !== null ? items[index] : null;
  const total = items.length;
  const panelRef = useRef(null);
  const touchStart = useRef(null);

  const go = useCallback(
    (dir) => onIndexChange((index + dir + total) % total),
    [index, total, onIndexChange]
  );

  useEffect(() => {
    if (!item) return undefined;
    const previouslyFocused = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && total > 1) go(1);
      else if (e.key === 'ArrowLeft' && total > 1) go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    // Preload neighbours so next/prev feels instant
    [1, -1].forEach((d) => {
      const n = items[(index + d + total) % total];
      if (n) new Image().src = n.src;
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [item, index, total, items, go, onClose]);

  if (!item) return null;

  const onTouchEnd = (e) => {
    if (touchStart.current === null || total < 2) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchStart.current = null;
  };

  return createPortal(
    <div
      ref={panelRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title}, image ${index + 1} of ${total}`}
      tabIndex={-1}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={onTouchEnd}
    >
      <div className="lightbox__bar">
        <span className="lightbox__count">{index + 1} / {total}</span>
        <button type="button" className="lightbox__btn" onClick={onClose} aria-label="Close"><X size={22} /></button>
      </div>

      {total > 1 && (
        <button type="button" className="lightbox__btn lightbox__nav lightbox__nav--prev" onClick={() => go(-1)} aria-label="Previous photo">
          <ChevronLeft size={26} />
        </button>
      )}

      <figure className="lightbox__figure">
        {/* key remounts the image so a failed one doesn't stick on the next photo */}
        <PortfolioImage key={item.id} item={item} className="lightbox__img" eager />
        <figcaption className="lightbox__caption">
          <strong>{item.title}</strong>
          <span>{categoryLabel(item.category)}</span>
        </figcaption>
      </figure>

      {total > 1 && (
        <button type="button" className="lightbox__btn lightbox__nav lightbox__nav--next" onClick={() => go(1)} aria-label="Next photo">
          <ChevronRight size={26} />
        </button>
      )}
    </div>,
    document.body
  );
}
