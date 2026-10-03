
import { useLayoutEffect } from 'react';
import { gsap, ScrollTrigger, MEDIA } from '../utils/motion';
import { splitWords } from '../utils/splitText';

const once = (trigger, start = 'top 88%') => ({ trigger, start, once: true });

/**
 * Shared scroll animations. Call once per page, with a ref on the page's wrapper element:
 *
 *   const rootRef = useRef(null);
 *   useScrollAnimations(rootRef);
 *   return <div ref={rootRef}>…</div>;
 *
 * Then switch things on with data attributes (no other code needed):
 *
 *   data-hero            fades up on page load, one after another          (all screens)
 *   data-reveal          fades up when scrolled into view                  (all screens)
 *   data-stagger         its children fade up one after another            (all screens)
 *   data-image-reveal    image wipes in + settles from a slight zoom       (desktop; phones just fade)
 *   data-split           heading words rise out of a mask                  (desktop; phones just fade)
 *   data-split="load"    same, but plays immediately (for the hero title)
 *   data-parallax        image drifts slower than the page                 (desktop only)
 *   data-count="250" data-suffix="+"     number counts up                  (all screens)
 *
 * "Reduce motion" users get none of it; content just shows.
 */
export default function useScrollAnimations(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    // New page: make sure scroll-triggered items are measured from the top
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });

    const mm = gsap.matchMedia();

    mm.add(
      { desktop: MEDIA.desktop, mobile: MEDIA.mobile },
      (context) => {
        const { desktop } = context.conditions;
        const dist = desktop ? 40 : 20;
        const q = (selector) => gsap.utils.toArray(selector);
        const splits = [];
        const counters = q('[data-count]');

        // ---- Hero intro on load ----
        const heroEls = q('[data-hero]');
        if (heroEls.length) {
          gsap.from(heroEls, { y: 30, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', delay: desktop ? 0.3 : 0.1 });
        }

        // ---- Reveal on scroll ----
        q('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: dist, opacity: 0, duration: desktop ? 0.9 : 0.6, ease: 'power3.out',
            scrollTrigger: once(el, desktop ? 'top 88%' : 'top 92%'),
          });
        });

        q('[data-stagger]').forEach((group) => {
          gsap.from(group.children, {
            y: dist, opacity: 0, duration: desktop ? 0.8 : 0.6, stagger: desktop ? 0.12 : 0.08, ease: 'power3.out',
            scrollTrigger: once(group, 'top 88%'),
          });
        });

        // ---- Image reveal ----
        q('[data-image-reveal]').forEach((el) => {
          if (desktop) {
            gsap.fromTo(
              el,
              { clipPath: 'inset(0% 0% 100% 0%)' },
              { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power3.inOut', clearProps: 'clipPath', scrollTrigger: once(el, 'top 85%') }
            );
            if (el.firstElementChild) {
              gsap.from(el.firstElementChild, { scale: 1.2, duration: 1.5, ease: 'power3.out', scrollTrigger: once(el, 'top 85%') });
            }
          } else {
            gsap.from(el, { opacity: 0, y: 20, duration: 0.7, ease: 'power2.out', scrollTrigger: once(el, 'top 92%') });
          }
        });

        // ---- Text: words rise out of a mask (desktop) / simple fade (phones) ----
        q('[data-split]').forEach((el) => {
          const immediate = el.dataset.split === 'load';
          if (desktop) {
            const split = splitWords(el);
            splits.push(split);
            gsap.from(split.inners, {
              yPercent: 105, opacity: 0, duration: 1, ease: 'power4.out', stagger: 0.045,
              delay: immediate ? 0.3 : 0,
              scrollTrigger: immediate ? undefined : once(el),
            });
          } else if (!immediate) {
            gsap.from(el, { opacity: 0, y: 16, duration: 0.6, ease: 'power2.out', scrollTrigger: once(el, 'top 92%') });
          }
        });

        // ---- Parallax (desktop only) ----
        if (desktop) {
          q('[data-parallax]').forEach((img) => {
            gsap.fromTo(
              img,
              { yPercent: -6 },
              { yPercent: 6, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }
            );
          });
        }

        // ---- Count-up numbers ----
        counters.forEach((el) => {
          const target = Number(el.dataset.count);
          const suffix = el.dataset.suffix || '';
          const obj = { v: 0 };
          el.textContent = `0${suffix}`;
          gsap.to(obj, {
            v: target, duration: 1.6, ease: 'power2.out',
            scrollTrigger: once(el, 'top 90%'),
            onUpdate: () => { el.textContent = `${Math.round(obj.v)}${suffix}`; },
          });
        });

        return () => {
          splits.forEach((s) => s.revert());
          counters.forEach((el) => { el.textContent = `${el.dataset.count}${el.dataset.suffix || ''}`; });
        };
      },
      root
    );

    // Re-measure once fonts and images settle
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    const t = setTimeout(refresh, 900);

    return () => {
      clearTimeout(t);
      mm.revert();
    };
  }, [rootRef]);
}
