import SectionTitle from '../common/SectionTitle';
import ServiceCard from './ServiceCard';
import { SERVICES } from './servicesData';

export default function ServicesGrid() {
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
          {SERVICES.map((s) => (
            <li key={s.id}><ServiceCard service={s} /></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
