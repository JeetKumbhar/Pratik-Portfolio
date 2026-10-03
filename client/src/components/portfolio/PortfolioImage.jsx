import { useState } from 'react';
import { Camera } from 'lucide-react';
import { CATEGORY_GRADIENTS } from './portfolioData';

/** <img> that falls back to a labelled gradient if the file is missing. */
export default function PortfolioImage({ item, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`pimg-fallback ${className}`}
        role="img"
        aria-label={item.alt}
        style={{ background: CATEGORY_GRADIENTS[item.category] }}
      >
        <Camera size={28} strokeWidth={1.3} aria-hidden="true" />
        <span>{item.title}</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={item.src}
      alt={item.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
