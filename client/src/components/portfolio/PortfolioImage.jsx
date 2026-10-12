import { useState } from 'react';
import { Camera } from 'lucide-react';
import { CATEGORY_GRADIENTS } from './portfolioData';
import { transformUrl } from '../../utils/imageUtils';

/**
 * A photo that
 *  - asks Cloudinary for a copy sized for where it is shown (the `width` prop) in the best format the browser supports,
 *  - falls back to the original file if that resized copy fails,
 *  - and shows a labelled gradient if the file is missing altogether.
 */
export default function PortfolioImage({ item, className = '', eager = false, width }) {
  const [useOriginal, setUseOriginal] = useState(false);
  const [failed, setFailed] = useState(false);

  const optimised = transformUrl(item.src, { width });
  const src = useOriginal ? item.src : optimised;

  const onError = () => {
    if (!useOriginal && optimised !== item.src) setUseOriginal(true); // the resized copy failed: try the original
    else setFailed(true);
  };

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
      src={src}
      alt={item.alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={onError}
    />
  );
}
