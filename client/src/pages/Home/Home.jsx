import { useRef } from 'react';
import HeroSection from '../../components/home/HeroSection';
import AboutPreview from '../../components/home/AboutPreview';
import FeaturedPortfolio from '../../components/home/FeaturedPortfolio';
import ServicesPreview from '../../components/home/ServicesPreview';
import Testimonials from '../../components/home/Testimonials';
import CTASection from '../../components/home/CTASection';
import useScrollAnimations from '../../hooks/useScrollAnimations';

export default function Home() {
  const rootRef = useRef(null);
  useScrollAnimations(rootRef);

  return (
    <div ref={rootRef}>
      <HeroSection />
      <AboutPreview />
      <FeaturedPortfolio />
      <ServicesPreview />
      <Testimonials />
      <CTASection />
    </div>
  );
}
