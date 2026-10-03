/**
 * DEV-ONLY helper that finds elements poking out past the screen edge (the usual cause of sideways scroll).
 *
 * In src/main.jsx add:
 *   if (import.meta.env.DEV) import('./utils/debugOverflow');
 *
 * Then in the browser console (at any screen size) run:   checkOverflow()
 * Offenders get a red outline and are listed in a table. Run checkOverflow(false) to clear the outlines.
 */
export function checkOverflow(outline = true) {
  const vw = document.documentElement.clientWidth;

  document.querySelectorAll('[data-overflow-flag]').forEach((el) => {
    el.style.outline = '';
    el.removeAttribute('data-overflow-flag');
  });

  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true; // inside a scroller / clipped box: fine
    }
    return false;
  };

  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return;
    if (r.right <= vw + 1 && r.left >= -1) return;
    if (getComputedStyle(el).position === 'fixed' || clipped(el)) return;
    bad.push({ el, right: Math.round(r.right), left: Math.round(r.left) });
  });

  if (outline) {
    bad.forEach(({ el }) => {
      el.style.outline = '2px solid red';
      el.setAttribute('data-overflow-flag', '');
    });
  }

  const scrollsSideways = document.documentElement.scrollWidth > vw;
  console.info(`[overflow] viewport ${vw}px, page ${scrollsSideways ? 'SCROLLS SIDEWAYS' : 'fits'}, ${bad.length} element(s) past the edge`);
  if (bad.length) {
    console.table(bad.slice(0, 15).map(({ el, right, left }) => ({
      element: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`,
      left,
      right,
    })));
    console.info('Hover the red outlines on the page, or inspect the first row:', bad[0].el);
  }
  return bad.map((b) => b.el);
}

if (typeof window !== 'undefined') {
  window.checkOverflow = checkOverflow;
  console.info('[dev] checkOverflow() is available in the console');
}
