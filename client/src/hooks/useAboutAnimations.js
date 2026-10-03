import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * All About-page motion lives here, so you can delete the one call in About.jsx
 * and the page still works as a static layout.
 *
 * Hooks into elements by data attribute:
 *   data-hero / data-hero-media / data-hero-content / data-hero-fade   hero intro + scroll scene
 *   data-reveal      fades up when scrolled into view
 *   data-stagger     children fade up one after another
 *   data-parallax    image drifts slower than the page (desktop only)
 *   data-count       number counts up (data-suffix for "+" or "%")
 *
 * Motion is skipped entirely for prefers-reduced-motion.
 * The scrubbed "scene" and parallax run on desktop only; mobile gets light reveals.
 */
export default function useAboutAnimations(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const mm = gsap.matchMedia();

    mm.add(
      {
        desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
        mobile: '(max-width: 899px) and (prefers-reduced-motion: no-preference)',
      },
      (context) => {
        const { desktop } = context.conditions;
        const dist = desktop ? 40 : 24;

        // ---- Hero intro (runs on load) ----
        gsap.from('[data-hero]', { y: 30, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', delay: 0.1 });

        // ---- Scroll reveals ----
        gsap.utils.toArray('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: dist, opacity: 0, duration: desktop ? 0.9 : 0.7, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });

        gsap.utils.toArray('[data-stagger]').forEach((group) => {
          gsap.from(group.children, {
            y: dist, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out',
            scrollTrigger: { trigger: group, start: 'top 85%', once: true },
          });
        });

        // ---- Count-up numbers ----
        const counters = gsap.utils.toArray('[data-count]');
        counters.forEach((el) => {
          const target = Number(el.dataset.count);
          const suffix = el.dataset.suffix || '';
          const obj = { v: 0 };
          el.textContent = `0${suffix}`;
          gsap.to(obj, {
            v: target, duration: 1.6, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
            onUpdate: () => { el.textContent = `${Math.round(obj.v)}${suffix}`; },
          });
        });

        // ---- Desktop only: the scrubbed scene ----
        if (desktop) {
          // Photographer zooms/drifts, text lifts away, screen fades to the next section
          gsap.timeline({
            scrollTrigger: { trigger: '[data-hero-section]', start: 'top top', end: 'bottom top', scrub: 0.6 },
          })
            .to('[data-hero-media]', { scale: 1.18, yPercent: 10, ease: 'none', duration: 1 }, 0)
            .to('[data-hero-content]', { y: -90, opacity: 0, ease: 'none', duration: 0.6 }, 0)
            .to('[data-hero-fade]', { opacity: 1, ease: 'none', duration: 1 }, 0);

          gsap.utils.toArray('[data-parallax]').forEach((img) => {
            gsap.fromTo(
              img,
              { yPercent: -6 },
              { yPercent: 6, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }
            );
          });
        }

        // Cleanup: leave counters showing their final value
        return () => {
          counters.forEach((el) => { el.textContent = `${el.dataset.count}${el.dataset.suffix || ''}`; });
        };
      },
      root
    );

    // Re-measure once fonts and the page fade-in have settled
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    const t = setTimeout(refresh, 600);

    return () => {
      clearTimeout(t);
      mm.revert();
    };
  }, [rootRef]);
}
