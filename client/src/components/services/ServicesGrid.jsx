import { useEffect, useState } from 'react';
import SectionTitle from '../common/SectionTitle';
import ServiceCard from './ServiceCard';
import useSettings from '../../hooks/useSettings';
import { presentServices } from './servicePresentation';
import { getServiceFeaturedPortfolio } from '../../services/portfolioService';

export default function ServicesGrid() {
  const { services } = useSettings();
  const cards = presentServices(services);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    let active = true;
    const refresh = () => getServiceFeaturedPortfolio()
      .then((items) => {
        if (active) setPhotos(items.filter((item) => item.isPublished && item.serviceFeatured));
      })
      .catch(() => {
        if (active) setPhotos([]);
      });
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const photosByCategory = new Map(photos.map((photo) => [photo.category, photo]));

  if (cards.length === 0) return null;

  return (
    <section className="home-section">
      <div className="container">
        <SectionTitle
          eyebrow="What I offer"
          title="Photography & Services"
          subtitle="Tailored photography services to capture your most important moments."
          align="center"
          serif split
        />
        <ul className="svc-grid" data-stagger>
          {cards.map((service) => (
            <li key={service.id}><ServiceCard service={service} photo={photosByCategory.get(service.id)} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
