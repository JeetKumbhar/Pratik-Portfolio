import HeroSection from '../../components/home/HeroSection';
import AboutPreview from '../../components/home/AboutPreview';
import FeaturedPortfolio from '../../components/home/FeaturedPortfolio';
import ServicesPreview from '../../components/home/ServicesPreview';
import Testimonials from '../../components/home/Testimonials';
import CTASection from '../../components/home/CTASection';

export default function Home() {
  return (
    <>
      <HeroSection />
      <AboutPreview />
      <FeaturedPortfolio />
      <ServicesPreview />
      <Testimonials />
      <CTASection />
    </>
  );
}
