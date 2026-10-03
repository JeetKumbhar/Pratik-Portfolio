import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

gsap.config({ nullTargetWarn: false }); // don't warn when a page has no matching elements
ScrollTrigger.config({ ignoreMobileResize: true }); // phone address-bar show/hide must not re-trigger layout

/**
 * One definition of "desktop" and "mobile" for ALL animation code.
 * Anyone with "reduce motion" switched on matches NEITHER, so nothing animates for them
 * and every element simply shows in its final state.
 */
export const MEDIA = {
  desktop: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 899px) and (prefers-reduced-motion: no-preference)',
};

export { gsap, ScrollTrigger };
