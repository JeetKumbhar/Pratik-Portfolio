import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import Button from '../common/Button';
import { FEATURED, photoBg } from './homeData';

export default function FeaturedPortfolio() {
  return (
    <section className="home-section home-section--alt">
      <div className="container featured">
        <div className="featured__intro" data-reveal>
          <SectionTitle
            className="title--script"
            eyebrow="My work"
            title="Featured Work"
            subtitle="From intimate portraits to grand celebrations, explore moments I've had the privilege to capture."
            serif split
          />
          <Button to="/portfolio" variant="outline" iconRight={<ChevronRight size={16} />}>View all portfolio</Button>
        </div>

        <ul className="featured__grid" data-stagger>
          {FEATURED.map(({ title, to, src, fallback }) => (
            <li key={title}>
              <Link to={to} className="work-card" aria-label={`${title} gallery`}>
                <span className="work-card__img" style={{ backgroundImage: photoBg(src, fallback) }} />
                <span className="work-card__caption">
                  <span>
                    <span className="work-card__title">{title}</span>
                    <span className="work-card__sub">View gallery</span>
                  </span>
                  <span className="work-card__arrow"><ArrowRight size={16} /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
