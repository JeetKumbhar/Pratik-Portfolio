import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import SectionTitle from '../common/SectionTitle';
import Button from '../common/Button';
import { FEATURED, photoBg } from './homeData';
import PortfolioImage from '../portfolio/PortfolioImage';
import { getFeaturedPortfolio } from '../../services/portfolioService';

export default function FeaturedPortfolio() {
  const [photos, setPhotos] = useState(null);
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const railRef = useRef(null);

  useEffect(() => {
    let active = true;
    const refresh = () => getFeaturedPortfolio()
      .then((items) => {
        if (active) setPhotos(items.filter((item) => item.isPublished && item.featured));
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

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const updateScrollState = () => {
      setScrollState({
        canScrollLeft: rail.scrollLeft > 1,
        canScrollRight: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1,
      });
    };

    updateScrollState();
    rail.addEventListener('scroll', updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(rail);
    return () => {
      rail.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, []);

  const scrollCards = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.75, behavior: 'smooth' });
  };

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

        <div className={`featured__rail${scrollState.canScrollRight ? ' has-more-right' : ''}`}>
          <ul className="featured__grid" data-stagger ref={railRef}>
            {FEATURED.map(({ category, title, to, src, fallback }) => {
              const photo = photos?.find((item) => item.category === category && item.isPublished && item.featured);
              return (
                <li key={category}>
                  <Link to={to} className="work-card" aria-label={`${title} gallery`}>
                    {photo
                      ? <PortfolioImage item={photo} className="work-card__img" width={600} />
                      : <span className="work-card__img" style={{ backgroundImage: photoBg(src, fallback) }} />}
                    <span className="work-card__caption">
                      <span>
                        <span className="work-card__title">{title}</span>
                        <span className="work-card__sub">View gallery</span>
                      </span>
                      <span className="work-card__arrow"><ArrowRight size={16} /></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {scrollState.canScrollLeft && (
            <button type="button" className="featured__scroll featured__scroll--left" onClick={() => scrollCards(-1)} aria-label="Scroll featured categories left">
              <ChevronLeft size={18} />
            </button>
          )}
          {scrollState.canScrollRight && (
            <button type="button" className="featured__scroll featured__scroll--right" onClick={() => scrollCards(1)} aria-label="Scroll featured categories right">
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
