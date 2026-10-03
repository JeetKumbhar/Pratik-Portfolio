# Responsive checklist

Test while you build each page, not at the end.

## How to test
- **Chrome DevTools:** F12, then Ctrl+Shift+M (device toolbar). Choose "Responsive" and type the width.
  Test each of: **1920, 1440, 1024, 768, 480, 375**. Also drag the width slowly from 1920 down to 320: breakages hide *between* the standard sizes (especially 1024 to 1200 and 700 to 900).
- **Real phone (do this at least once per page):** run `npm run dev -- --host`, then open `http://<your-PC-IP>:5173` on a phone on the same Wi-Fi.
- **Automatic overflow + screenshots:** `node scripts/responsive-check.mjs` (setup is at the top of that file).
- **Find sideways-scroll culprits:** console command `checkOverflow()` (see `src/utils/debugOverflow.js`).
- Also try: browser zoom 200%, landscape phone (e.g. 667x375), and the OS "larger text" setting.

## Every page, every width
- [ ] **Horizontal overflow:** no sideways scrolling. Nothing cut off at the right edge.
- [ ] **Navbar:** full menu at 1100px and up; hamburger below. Logo never wraps. Hamburger opens/closes, locks scroll, closes on link click.
- [ ] **Images:** no stretching, no blur, faces/subjects not cropped out (check hero + About on phone). Missing photos show gradients, not broken icons.
- [ ] **Typography:** headings wrap cleanly (no single orphan word, no word split mid-way); body text 16px+; line length comfortable at 1920.
- [ ] **Buttons:** at least ~44px tall tap area; no text wrapping inside; full width on phones where intended.
- [ ] **Forms:** inputs don't trigger zoom on iPhone; labels and errors visible; keyboard doesn't hide the active field or the submit button.
- [ ] **Gallery:** columns 2 / 3 / 4 at phone / tablet / desktop; no gaps or overlaps; lightbox arrows and close button reachable.
- [ ] **Animations:** smooth on a mid-range phone; nothing stuck half-visible; with "reduce motion" on, all content still shows.
- [ ] **Spacing:** consistent section padding; nothing touching the screen edge (24px side margin); no giant empty gaps at 1920.
- [ ] **Footer:** contact strip stacks cleanly; social icons are tappable.

## Page by page
**Home**
- [ ] Hero fills the screen under the transparent navbar; title + buttons readable over the photo at every width.
- [ ] Stats bar: 4 across on desktop, 2x2 on phones. Social rail only on desktop.
- [ ] Featured work: 2 columns on phones, 4 on wide screens. Testimonial arrows and dots are tappable.

**About**
- [ ] Phone: photographer on top, text below. Desktop: text left, photographer right.
- [ ] Desktop scroll scene is smooth (zoom, text lifts away, fade into Story). Phone: only light fade-ups, no video.
- [ ] Counters end on the right numbers. Timeline readable at 375px.

**Portfolio**
- [ ] Filter pills scroll sideways on phones (the page itself must not). Counts visible.
- [ ] Lightbox: swipe works on a real phone; image fits between the top bar and bottom arrows in landscape.

**Services**
- [ ] Service cards 1 / 2 / 3 columns. Pricing: 1 column on phone/tablet, 3 on desktop; "Most popular" badge not clipped.
- [ ] FAQ opens/closes smoothly; long questions wrap.

**Booking** (check all 4 steps + success)
- [ ] Step 1: two-column fields on tablet+, stacked on phone.
- [ ] Step 2: shoot-type tiles 2 / 3 columns; location + package options readable at 1100 to 1300px (the sidebar makes this the tightest range).
- [ ] Step 3: calendar + time slots side by side only when there's room. A selected time slot with the tick doesn't overflow its button.
- [ ] Step 4: review rows wrap; long email/notes don't push the page wider. Edit buttons reachable.
- [ ] Sidebar summary only on desktop; trust badges visible on phone.

**Contact**
- [ ] Form + info side by side at 960px+, stacked below. Map is a sensible height and doesn't trap scrolling on a phone.

**Admin**
- [ ] Sidebar is a slide-in drawer below 1024px. Header title and logout stay on one line at 375px.

## Known risk spots (already patched in `responsive.css`; re-check them)
- Navbar at 1024 to 1099px (was cramped)
- Hero "scroll" hint vs buttons at 900 to 1199px
- About hero stats width at 900 to 1199px
- Booking step 2 and 3 at 1100 to 1300px
- iPhone input zoom (inputs under 16px) and small tap targets (footer/hero social icons, testimonial dots, calendar arrows)
