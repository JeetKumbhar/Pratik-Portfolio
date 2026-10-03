import { useLayoutEffect } from 'react';
import { gsap, MEDIA } from '../utils/motion';

/**
 * About page hero "scene" only (desktop). Everything else on the page (reveals, counters,
 * parallax, image reveal) now comes from useScrollAnimations.
 *
 * Scroll out of the hero → photographer zooms and drifts, text lifts away, screen fades to the next section.
 */
export default function useAboutAnimations(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const mm = gsap.matchMedia();
    mm.add(
      MEDIA.desktop,
      () => {
        gsap.timeline({
          scrollTrigger: { trigger: '[data-hero-section]', start: 'top top', end: 'bottom top', scrub: 0.6 },
        })
          .to('[data-hero-media]', { scale: 1.18, yPercent: 10, ease: 'none', duration: 1 }, 0)
          .to('[data-hero-content]', { y: -90, opacity: 0, ease: 'none', duration: 0.6 }, 0)
          .to('[data-hero-fade]', { opacity: 1, ease: 'none', duration: 1 }, 0);
      },
      root
    );

    return () => mm.revert();
  }, [rootRef]);
}
