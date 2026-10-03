import { ChevronRight } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import Button from '../common/Button';
import { SERVICES } from './homeData';

export default function ServicesPreview() {
  return (
    <section className="home-section">
      <div className="container">
        <SectionTitle
          eyebrow="What I offer"
          title="Photography & Services"
          subtitle="Tailored photography services to capture your most important moments."
          align="center"
          serif
        />

        <ul className="services-grid">
          {SERVICES.map(({ title, icon: Icon, text }) => (
            <li key={title}>
              <Card padding="lg" className="service-card">
                <span className="service-card__icon"><Icon size={26} strokeWidth={1.4} /></span>
                <h3 className="service-card__title">{title}</h3>
                <p className="service-card__text">{text}</p>
              </Card>
            </li>
          ))}
        </ul>

        <div className="center-row">
          <Button to="/services" variant="outline" iconRight={<ChevronRight size={16} />}>View services & pricing</Button>
        </div>
      </div>
    </section>
  );
}
