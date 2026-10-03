import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import { STYLE_PILLARS } from './aboutData';

export default function StyleSection() {
  return (
    <section className="home-section">
      <div className="container">
        <div data-reveal>
          <SectionTitle
            eyebrow="Photography style"
            title="How I see the world"
            subtitle="Four principles that shape every shoot."
            align="center"
            serif split
          />
        </div>

        <ul className="services-grid style-grid" data-stagger>
          {STYLE_PILLARS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card padding="lg" className="service-card">
                <span className="service-card__icon"><Icon size={26} strokeWidth={1.4} /></span>
                <h3 className="service-card__title">{title}</h3>
                <p className="service-card__text">{text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
