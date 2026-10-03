import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import SectionTitle from '../../components/common/SectionTitle';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import CategoryFilter from '../../components/portfolio/CategoryFilter';
import GalleryGrid from '../../components/portfolio/GalleryGrid';
import GalleryLoader from '../../components/portfolio/GalleryLoader';
import Lightbox from '../../components/portfolio/Lightbox';
import CTASection from '../../components/home/CTASection';
import { CATEGORIES, CATEGORY_ALIASES } from '../../components/portfolio/portfolioData';
import { getPortfolioItems } from '../../services/portfolioService';

export default function Portfolio() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Active category lives in the URL (?category=wedding) so it's shareable and Back works
  const raw = params.get('category');
  const requested = CATEGORY_ALIASES[raw] ?? raw ?? 'all';
  const active = CATEGORIES.some((c) => c.value === requested) ? requested : 'all';

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    getPortfolioItems()
      .then((data) => { if (!cancelled) { setItems(data); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [load]);

  const categories = useMemo(
    () => CATEGORIES.map((c) => ({
      ...c,
      count: c.value === 'all' ? items.length : items.filter((i) => i.category === c.value).length,
    })),
    [items]
  );

  const visible = useMemo(
    () => (active === 'all' ? items : items.filter((i) => i.category === active)),
    [items, active]
  );

  const changeCategory = (value) => {
    setLightboxIndex(null);
    setParams(value === 'all' ? {} : { category: value }, { replace: true });
  };

  return (
    <>
      <section className="home-section portfolio">
        <div className="container">
          <SectionTitle
            eyebrow="Portfolio"
            title="Moments I've captured"
            subtitle="A selection of weddings, portraits, events and landscapes. Tap any photo to view it full screen."
            serif
          />

          <CategoryFilter categories={categories} active={active} onChange={changeCategory} />

          {status === 'loading' && <GalleryLoader />}

          {status === 'error' && (
            <EmptyState
              icon={<CloudOff size={28} />}
              title="Couldn't load the gallery"
              message="Something went wrong while loading the photos."
              action={<Button onClick={load}>Try again</Button>}
            />
          )}

          {status === 'ready' && (
            // key restarts the fade-in whenever the category changes
            <div key={active} className="portfolio__results">
              <GalleryGrid items={visible} onOpen={setLightboxIndex} />
            </div>
          )}
        </div>
      </section>

      <Lightbox items={visible} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />

      <CTASection />
    </>
  );
}
