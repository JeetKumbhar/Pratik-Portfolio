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

/**
 * Jump to the top of the page (no animation) AND tell ScrollTrigger the page is at the top.
 * ScrollTrigger keeps its own cached copy of the scroll position, and that copy is not updated until the browser fires its "scroll"
 * event a moment later. If a ScrollTrigger.refresh() runs in the meantime it records the stale value and, as its last step, scrolls
 * back to it (clamped to the new page's height): Portfolio / Contact / Booking opened 500-700px down after leaving a scrolled-down Home.
 * Writing 0 into the cached value as well removes the stale copy. Use this for every "new page" reset.
 */
export function resetScrollToTop() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  ScrollTrigger.getScrollFunc(window)(0);
}

export { gsap, ScrollTrigger };
