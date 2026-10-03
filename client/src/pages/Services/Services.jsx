import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../../components/common/Button';
import ServicesGrid from '../../components/services/ServicesGrid';
import PricingSection from '../../components/services/PricingSection';
import FAQ from '../../components/services/FAQ';
import ServiceCTA from '../../components/services/ServiceCTA';
import useScrollAnimations from '../../hooks/useScrollAnimations';
import { BOOKING_PATH } from '../../utils/constants';

export default function Services() {
  const rootRef = useRef(null);
  useScrollAnimations(rootRef);

  return (
    <div ref={rootRef}>
      <section className="page-hero" style={{ '--page-hero-img': 'url("/images/services/hero.jpg")' }}>
        <div className="container page-hero__inner">
          <p className="page-hero__eyebrow" data-hero>Services</p>
          <h1 className="page-hero__title" data-hero>Photography that tells your story.</h1>
          <p className="page-hero__text" data-hero>
            Professional photography services for every moment that matters. Let's create something beautiful together.
          </p>
          <div className="page-hero__actions" data-hero>
            <Button to={BOOKING_PATH} size="lg" iconRight={<ArrowRight size={18} />}>Book a shoot</Button>
            <Button href="#pricing" variant="ghost" size="lg">See pricing</Button>
          </div>
        </div>
      </section>

      <ServicesGrid />
      <PricingSection />
      <FAQ />
      <ServiceCTA />
    </div>
  );
}
