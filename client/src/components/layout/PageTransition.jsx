import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, ScrollTrigger, MEDIA } from '../../utils/motion';

/**
 * Route change → desktop: a dark curtain with a thin gold edge wipes up to reveal the new page.
 *               phones: a quick fade (no big motion).  reduce-motion: nothing.
 * The very first page load does NOT play it (so the site never feels slow to open).
 * Wrap <Outlet /> with it (PublicLayout already does).
 */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const curtainRef = useRef(null);
  const previousPath = useRef(pathname);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Same path (first load, StrictMode double-run, or only the ?query changed): do nothing
    if (previousPath.current === pathname) return undefined;
    previousPath.current = pathname;

    const mm = gsap.matchMedia();
    mm.add(
      { desktop: MEDIA.desktop, mobile: MEDIA.mobile },
      (context) => {
        const content = contentRef.current;
        const curtain = curtainRef.current;

        if (context.conditions.desktop) {
          gsap.set(curtain, { autoAlpha: 1, yPercent: 0 }); // cover instantly, before the browser paints
          gsap.timeline({ onComplete: () => { gsap.set(curtain, { autoAlpha: 0 }); ScrollTrigger.refresh(); } })
            .to(curtain, { yPercent: -100, duration: 0.8, ease: 'power3.inOut', delay: 0.05 })
            .from(content, { opacity: 0, duration: 0.6, ease: 'power2.out', clearProps: 'opacity' }, 0.2);
        } else {
          gsap.from(content, { opacity: 0, duration: 0.35, ease: 'power1.out', clearProps: 'opacity' });
        }
      }
    );

    return () => mm.revert();
  }, [pathname]);

  return (
    <>
      <div ref={contentRef}>{children}</div>
      <div ref={curtainRef} className="curtain" aria-hidden="true" />
    </>
  );
}
