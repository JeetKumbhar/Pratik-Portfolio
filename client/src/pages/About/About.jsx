import { useRef } from 'react';
import AboutHero from '../../components/about/AboutHero';
import StorySection from '../../components/about/StorySection';
import ExperienceSection from '../../components/about/ExperienceSection';
import StyleSection from '../../components/about/StyleSection';
import CTASection from '../../components/home/CTASection';
import useScrollAnimations from '../../hooks/useScrollAnimations';
import useAboutAnimations from '../../hooks/useAboutAnimations';

export default function About() {
  const rootRef = useRef(null);

  // Remove these two lines and the page is still fully working, just static.
  useScrollAnimations(rootRef); // reveals, image reveal, split text, parallax, counters
  useAboutAnimations(rootRef); // the scrubbed hero scene (desktop)

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
