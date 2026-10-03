import { ExternalLink } from 'lucide-react';
import { LOCATION } from './contactData';

/**
 * OpenStreetMap embed: no API key needed. Dark-themed with a CSS filter (see contact.css).
 * To use Google Maps instead, swap the iframe src for a Google "Embed a map" URL.
 */
export default function Map({ lat = LOCATION.lat, lng = LOCATION.lng, label = LOCATION.lines.join(', ') }) {
  const dLat = 0.012;
  const dLng = 0.03;
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join('%2C');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const directions = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="map">
      <iframe className="map__frame" title={`Map showing ${label}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <a className="map__link" href={directions} target="_blank" rel="noopener noreferrer">
        Open in Google Maps <ExternalLink size={14} />
      </a>
    </div>
  );
}
