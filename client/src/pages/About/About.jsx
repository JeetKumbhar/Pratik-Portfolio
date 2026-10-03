import { useRef } from 'react';
import AboutHero from '../../components/about/AboutHero';
import StorySection from '../../components/about/StorySection';
import ExperienceSection from '../../components/about/ExperienceSection';
import StyleSection from '../../components/about/StyleSection';
import CTASection from '../../components/home/CTASection';
import useAboutAnimations from '../../hooks/useAboutAnimations';

export default function About() {
  const rootRef = useRef(null);

  // Remove this one line and the page is still fully working, just static.
  useAboutAnimations(rootRef);

  return (
    <div ref={rootRef}>
      <AboutHero />
      <StorySection />
      <ExperienceSection />
      <StyleSection />
      <div data-reveal><CTASection /></div>
    </div>
  );
}
