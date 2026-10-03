/**
 * Opens every page at every width, checks for sideways overflow and JS errors,
 * and saves a full-page screenshot of each. Open the screenshots and LOOK at them:
 * the script catches overflow, not ugliness.
 *
 * Setup (once):   npm i -D playwright   &&   npx playwright install chromium
 * Run:            npm run dev           (terminal 1)
 *                 node scripts/responsive-check.mjs      (terminal 2)
 * Other port:     BASE_URL=http://localhost:5174 node scripts/responsive-check.mjs
 *
 * Animations are switched off (reduced-motion) so every section is visible in the screenshots.
 * Booking steps 2 to 4, modals and the lightbox need a manual look (see RESPONSIVE_CHECKLIST.md).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = 'responsive-report';

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 480, height: 900 },
  { width: 375, height: 812 },
];

const ROUTES = ['/', '/about', '/portfolio', '/services', '/booking', '/contact', '/admin', '/page-that-does-not-exist'];
const slug = (route) => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-'));

// Runs inside the browser page
function findOverflow() {
  const vw = document.documentElement.clientWidth;
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls}`;
  };

  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
        const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.visibility === 'hidden' || clipped(el)) continue;
    offenders.push(`${label(el)} (right edge at ${Math.round(r.right)}px)`);
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) };
}

const browser = await chromium.launch();
const rows = [];
let failures = 0;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));

  for (const route of ROUTES) {
    jsErrors.length = 0;
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const result = await page.evaluate(findOverflow);
    const dir = path.join(OUT, String(vp.width));
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${slug(route)}.png`), fullPage: true });

    const sideways = result.scrollWidth > result.vw;
    const ok = !sideways && result.offenders.length === 0 && jsErrors.length === 0;
    if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(vp.width).padStart(4)}px  ${route}`);
    if (sideways) console.log(`        page scrolls sideways: content is ${result.scrollWidth}px wide, screen is ${result.vw}px`);
    result.offenders.forEach((o) => console.log(`        overflow: ${o}`));
    jsErrors.forEach((e) => console.log(`        js error: ${e}`));

    rows.push({ width: vp.width, route, ok, sideways, offenders: result.offenders, jsErrors: [...jsErrors] });
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 2));
console.log(`\n${rows.length - failures}/${rows.length} checks passed. Screenshots are in ./${OUT}/`);
process.exit(failures ? 1 : 0);
