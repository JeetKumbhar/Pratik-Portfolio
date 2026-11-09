import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * The 3D camera shown while a page is loading (used by CameraLoader.jsx, which loads this file on demand,
 * so Three.js never weighs on the pages that load instantly).
 *
 * createCameraScene(host, { animate }) puts a <canvas> inside `host` and returns { dispose, ready }.
 *   animate: false → one still frame (prefers-reduced-motion), no animation loop at all.
 * It throws when WebGL is not available, so the caller can show its simple fallback instead.
 * dispose() stops the loop, removes every listener, frees all GPU memory and removes the canvas.
 */

const GOLD = 0xe6aa4c;
const STILL_YAW = -0.55; // the angle of the still frame (a three-quarter view of the lens)

function makeMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55, metalness: 0.35 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.85, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.28, metalness: 0.95 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0x8d8d92, roughness: 0.18, metalness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.22, metalness: 1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.9, metalness: 0 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.08, metalness: 0.6 }),
    // the front glass: dark, glossy, with a blue / violet coating look from the reflections
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0c1c40, emissive: 0x030a1e, roughness: 0.03, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02,
      iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 520], envMapIntensity: 3,
    }),
    violet: new THREE.MeshStandardMaterial({ color: 0x6a3cc8, roughness: 0.14, metalness: 0.9, emissive: 0x1c0a46 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2f6fe0, roughness: 0.14, metalness: 0.9, emissive: 0x06204a }),
    deep: new THREE.MeshStandardMaterial({ color: 0x03050a, roughness: 0.1, metalness: 0.7 }),
  };
}

/** A lens barrel built as ONE revolved shape: stepped rings, grooved focus ring, gold accent bands. */
function buildLens(m, own) {
  const lens = new THREE.Group();
  const add = (geo, mat, parent = lens) => {
    own.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    return mesh;
  };
  // Cylinders are built along Y, then the whole group is turned so the lens points along +Z.
  const axis = new THREE.Group();
  axis.rotation.x = Math.PI / 2;
  lens.add(axis);

  // Mount ring (silver) where the lens meets the body
  const mount = add(new THREE.CylinderGeometry(0.78, 0.78, 0.1, 64), m.chrome, axis);
  mount.position.y = 0.05;

  // Rear barrel
  const rear = add(new THREE.CylinderGeometry(0.7, 0.72, 0.42, 64), m.body, axis);
  rear.position.y = 0.31;

  // Gold accent band
  const band = add(new THREE.CylinderGeometry(0.715, 0.715, 0.045, 64), m.gold, axis);
  band.position.y = 0.55;

  // Grooved focus ring: a lathe profile with a sawtooth edge
  const profile = [new THREE.Vector2(0.69, 0)];
  const grooves = 14;
  for (let i = 0; i < grooves; i++) {
    const y0 = (i / grooves) * 0.5;
    profile.push(new THREE.Vector2(0.745, y0 + 0.012), new THREE.Vector2(0.745, y0 + 0.026), new THREE.Vector2(0.7, y0 + 0.032));
  }
  profile.push(new THREE.Vector2(0.745, 0.5), new THREE.Vector2(0.69, 0.5));
  const focus = add(new THREE.LatheGeometry(profile, 72), m.rubber, axis);
  focus.position.y = 0.575;

  // Front barrel (silver) and the thin gold ring around the front element
  const front = add(new THREE.CylinderGeometry(0.66, 0.7, 0.34, 64, 1, true), m.metal, axis);
  front.position.y = 1.32;
  const ring = add(new THREE.TorusGeometry(0.64, 0.022, 16, 96), m.gold, axis);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.5;

  // Inside the front: the tube, then coloured rings, then the glass dome
  const tube = add(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 64, 1, true), m.deep, axis);
  tube.position.y = 1.3;
  tube.material = m.deep.clone();
  tube.material.side = THREE.BackSide;
  own.push(tube.material);

  // Concentric lens-element rings, each one a little deeper than the last, with coloured coatings (violet / blue) like a real lens
  const layers = [
    { outer: 0.6, inner: 0.5, mat: m.rubber, y: 1.4 },
    { outer: 0.5, inner: 0.43, mat: m.violet, y: 1.36 },
    { outer: 0.43, inner: 0.36, mat: m.deep, y: 1.33 },
    { outer: 0.36, inner: 0.3, mat: m.blue, y: 1.3 },
    { outer: 0.3, inner: 0.24, mat: m.violet, y: 1.27 },
  ];
  layers.forEach(({ outer, inner, mat, y }) => {
    const disc = add(new THREE.RingGeometry(inner, outer, 72), mat, axis);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = y;
  });

  // Front glass: a shallow glossy dome in the middle
  const dome = add(new THREE.SphereGeometry(0.26, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), m.glass, axis);
  dome.scale.set(1, 0.5, 1);
  dome.position.y = 1.26;

  // Reflections on the glass: one bright, one soft
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
  own.push(glintMat);
  const glint = add(new THREE.CircleGeometry(0.05, 24), glintMat, axis);
  glint.rotation.x = -Math.PI / 2;
  glint.position.set(-0.11, 1.405, -0.08);
  const glint2 = add(new THREE.CircleGeometry(0.022, 16), glintMat, axis);
  glint2.rotation.x = -Math.PI / 2;
  glint2.position.set(0.1, 1.405, 0.09);

  return lens;
}

function buildCamera(m, own) {
  const cam = new THREE.Group();
  const add = (geo, mat, parent = cam) => {
    own.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);
    return mesh;
  };

  // Body, with the soft rounded edges of a real camera
  add(new RoundedBoxGeometry(2.7, 1.65, 1.1, 6, 0.14), m.body);

  // Leatherette panels on the front and back (a hair larger so they read as a separate material)
  const frontPanel = add(new RoundedBoxGeometry(2.5, 1.35, 0.06, 4, 0.03), m.leather);
  frontPanel.position.z = 0.55;
  const backPanel = add(new RoundedBoxGeometry(2.5, 1.35, 0.06, 4, 0.03), m.leather);
  backPanel.position.z = -0.55;

  // Grip on the left of the front
  const grip = add(new RoundedBoxGeometry(0.62, 1.55, 0.42, 6, 0.16), m.rubber);
  grip.position.set(-1.22, -0.02, 0.62);

  // Top plate and viewfinder hump
  const top = add(new RoundedBoxGeometry(2.7, 0.22, 1.1, 4, 0.08), m.metal);
  top.position.set(0, 0.89, 0);
  const hump = add(new RoundedBoxGeometry(0.85, 0.42, 0.82, 5, 0.12), m.body);
  hump.position.set(0, 1.12, -0.06);
  const finder = add(new RoundedBoxGeometry(0.4, 0.2, 0.1, 3, 0.04), m.screen);
  finder.position.set(0, 1.12, -0.5);

  // Hot shoe on the hump
  const shoe = add(new THREE.BoxGeometry(0.42, 0.04, 0.3), m.chrome);
  shoe.position.set(0, 1.35, -0.06);

  // Shutter button with a gold ring, on the grip side of the top plate
  const shutterRing = add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 32), m.gold);
  shutterRing.position.set(-0.95, 1.03, 0.1);
  const shutter = add(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 32), m.chrome);
  shutter.position.set(-0.95, 1.08, 0.1);

  // Mode dial (silver, with a gold dot)
  const dial = add(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 40), m.chrome);
  dial.position.set(0.95, 1.05, 0.1);
  const dialCap = add(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), m.body);
  dialCap.position.set(0.95, 1.14, 0.1);
  const dialDot = add(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 12), m.gold);
  dialDot.position.set(0.95, 1.15, 0.2);

  // Thin gold line across the front (the brand accent)
  const accent = add(new THREE.BoxGeometry(0.9, 0.018, 0.012), m.gold);
  accent.position.set(0.78, 0.48, 0.585);

  // Back screen and a few buttons
  const screen = add(new RoundedBoxGeometry(1.7, 1.02, 0.05, 3, 0.03), m.screen);
  screen.position.set(-0.15, -0.05, -0.6);
  [[1.0, 0.3], [1.0, 0.0], [1.0, -0.3]].forEach(([x, y]) => {
    const b = add(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20), m.metal);
    b.rotation.x = Math.PI / 2;
    b.position.set(x + 0.2, y, -0.58);
  });

  // The lens, pointing along +Z, centred on the front
  const lens = buildLens(m, own);
  lens.position.set(0.05, -0.05, 0.55);
  cam.add(lens);

  return cam;
}

export function createCameraScene(host, { animate = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'camera-loader__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  // Ask for a WebGL context ourselves first, so a device without WebGL fails quietly (no console noise) and we can show the fallback
  const options = { antialias: true, alpha: true, powerPreference: 'low-power' };
  const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
  if (!gl) throw new Error('WebGL is not available');
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });

  const maxRatio = window.matchMedia('(max-width: 767px)').matches ? 1.5 : 2; // phones: smooth enough, much lighter
  const pixelRatio = Math.min(window.devicePixelRatio || 1, maxRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const threeCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  threeCamera.position.set(0, 0.5, 6.6);
  threeCamera.lookAt(0, 0.1, 0);

  // Reflections for the metal and glass come from a small built-in studio environment (no image files to download)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.9;
  envScene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  pmrem.dispose();

  // A warm gold key light, a cool rim light, and a soft fill
  const key = new THREE.DirectionalLight(0xffd9a0, 3.2);
  key.position.set(4, 4, 6);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4);
  rim.position.set(-5, 2, -4);
  const fill = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(key, rim, fill);

  const own = []; // everything created below that must be disposed
  const materials = makeMaterials();
  const camera = buildCamera(materials, own);
  const pivot = new THREE.Group(); // the camera turns around its own centre
  pivot.add(camera);
  scene.add(pivot);

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    threeCamera.aspect = w / h;
    // a narrower stage needs a little more distance so the camera is never cropped
    threeCamera.position.z = 6.6 * Math.max(1, 1.4 / threeCamera.aspect);
    threeCamera.updateProjectionMatrix();
  };

  const draw = (yaw, time) => {
    pivot.rotation.y = yaw;
    pivot.rotation.x = Math.sin(time * 0.6) * 0.07 + 0.06; // a slight, slow tilt
    pivot.rotation.z = Math.sin(time * 0.4 + 1) * 0.015;
    pivot.position.y = Math.sin(time * 0.9) * 0.035; // a barely-there float
    renderer.render(scene, threeCamera);
  };

  let frame = 0;
  let disposed = false;
  let running = false;
  let yaw = STILL_YAW;
  let speed = 0; // eased in so the camera starts turning gently, with no jump
  let last = 0;
  let time = 0;

  const loop = (now) => {
    if (disposed || !running) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05); // a long pause (busy tab) never makes it leap
    last = now;
    time += dt;
    speed += (0.55 - speed) * Math.min(1, dt * 1.5); // glide up to 0.55 rad/s (a full turn in ~11 s)
    yaw += speed * dt;
    draw(yaw, time);
  };
  const start = () => {
    if (disposed || running || !animate) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(frame);
  };
  const onVisibility = () => (document.hidden ? stop() : start()); // nothing runs in a background tab

  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); if (!running) draw(yaw, time); }) : null;
  observer?.observe(host);
  const onWindowResize = () => { resize(); if (!running) draw(yaw, time); };
  if (!observer) window.addEventListener('resize', onWindowResize);

  // a lost context (the phone ran out of GPU memory) must not leave a broken, half-drawn canvas
  const onContextLost = (e) => { e.preventDefault(); stop(); canvas.style.visibility = 'hidden'; };
  canvas.addEventListener('webglcontextlost', onContextLost);

  draw(yaw, 0); // first frame right away
  if (animate) {
    document.addEventListener('visibilitychange', onVisibility);
    start();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onWindowResize);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    observer?.disconnect();
    own.forEach((d) => d.dispose());
    Object.values(materials).forEach((mat) => mat.dispose());
    envTarget.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  return { dispose };
}
