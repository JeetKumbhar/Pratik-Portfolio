import { ExternalLink } from 'lucide-react';
import { useSite } from '../../hooks/useSettings';
import { addressLines, mapsLink } from '../../utils/siteSettings';

/**
 * The studio's location from Admin → Settings → Business.
 *  - a written address  → a map of it (Google's keyless embed), plus the "Open in Google Maps" link
 *  - only a Maps link   → just the link
 *  - neither            → nothing is shown (no map of a made-up place)
 */
export default function Map() {
  const { settings } = useSite();
  const lines = addressLines(settings.business);
  const link = mapsLink(settings.business);
  if (!link) return null;
  const label = lines.join(', ');

  return (
    <div className="map">
      {lines.length > 0 && (
        <iframe
          className="map__frame" title={`Map showing ${label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(label)}&output=embed`}
        />
      )}
      <a className="map__link" href={link} target="_blank" rel="noopener noreferrer">
        Open in Google Maps <ExternalLink size={14} />
      </a>
    </div>
  );
}
