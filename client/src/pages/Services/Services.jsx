import { ArrowRight } from 'lucide-react';
import Button from '../../components/common/Button';
import ServicesGrid from '../../components/services/ServicesGrid';
import PricingSection from '../../components/services/PricingSection';
import FAQ from '../../components/services/FAQ';
import ServiceCTA from '../../components/services/ServiceCTA';
import { BOOKING_PATH } from '../../utils/constants';

export default function Services() {
  return (
    <>
      <section className="page-hero" style={{ '--page-hero-img': 'url("/images/services/hero.jpg")' }}>
        <div className="container page-hero__inner">
          <p className="page-hero__eyebrow">Services</p>
          <h1 className="page-hero__title">Photography that tells your story.</h1>
          <p className="page-hero__text">
            Professional photography services for every moment that matters. Let's create something beautiful together.
          </p>
          <div className="page-hero__actions">
            <Button to={BOOKING_PATH} size="lg" iconRight={<ArrowRight size={18} />}>Book a shoot</Button>
            <Button href="#pricing" variant="ghost" size="lg">See pricing</Button>
          </div>
        </div>
      </section>

      <ServicesGrid />
      <PricingSection />
      <FAQ />
      <ServiceCTA />
    </>
  );
}
