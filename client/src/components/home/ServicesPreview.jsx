

import { ChevronRight } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import Button from '../common/Button';
import useSettings from '../../hooks/useSettings';
import { presentServices } from '../services/servicePresentation';

export default function ServicesPreview() {
  const { services } = useSettings();
  const cards = presentServices(services);
  if (cards.length === 0) return null; // every service switched off: no empty section
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

        <ul className="services-grid" data-stagger>
          {cards.map(({ id, title, icon: Icon, text }) => (
            <li key={id}>
              <Card padding="lg" className="service-card">
                <span className="service-card__icon"><Icon size={26} strokeWidth={1.4} /></span>
                <h3 className="service-card__title">{title}</h3>
                <p className="service-card__text">{text}</p>
              </Card>
            </li>
          ))}
        </ul>

        <div className="center-row" data-reveal>
          <Button to="/services" variant="outline" iconRight={<ChevronRight size={16} />}>View services & pricing</Button>
        </div>
      </div>
    </section>
  );
}
