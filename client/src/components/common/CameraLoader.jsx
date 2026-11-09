import { useEffect, useRef, useState } from 'react';

/**
 * The picture of a camera shown while a page loads.
 *  - It is a drawn camera (SVG) first, instantly, so there is never an empty gap or a layout jump.
 *  - If the page is still loading after a moment, Three.js is loaded on demand and a real 3D camera fades in over it.
 *    A page that loads quickly never downloads Three.js at all.
 *  - No WebGL / Three.js fails to load → the drawn camera simply stays. Nothing here can block the page.
 *  - prefers-reduced-motion → one still 3D frame, no animation.
 * The stage has a fixed size (see .camera-loader in components.css), so the canvas never changes the layout.
 */
const START_DELAY_MS = 350;

export default function CameraLoader() {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let scene = null;
    const host = hostRef.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const timer = setTimeout(() => {
      import('./cameraScene.js')
        .then(({ createCameraScene }) => {
          if (cancelled) return; // the loader is already gone (or StrictMode re-ran this effect)
          scene = createCameraScene(host, { animate: !reduced });
          setReady(true);
        })
        .catch(() => { /* no WebGL or the file could not load: the drawn camera stays */ });
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      scene?.dispose();
    };
  }, []);

  return (
    <div className={`camera-loader${ready ? ' is-ready' : ''}`} aria-hidden="true">
      <svg className="camera-loader__fallback" viewBox="0 0 200 140" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="18" y="38" width="164" height="86" rx="12" strokeWidth="2" />
        <path d="M66 38l8-14h52l8 14" strokeWidth="2" />
        <circle cx="100" cy="81" r="34" strokeWidth="2.5" />
        <circle cx="100" cy="81" r="24" strokeWidth="1.5" opacity="0.8" />
        <circle cx="100" cy="81" r="14" strokeWidth="1.5" opacity="0.6" />
        <circle cx="93" cy="74" r="3" fill="currentColor" stroke="none" opacity="0.7" />
        <circle cx="156" cy="54" r="4" strokeWidth="1.5" />
        <path d="M30 52h16" strokeWidth="2" />
      </svg>
      <div ref={hostRef} className="camera-loader__host" />
    </div>
  );
}
