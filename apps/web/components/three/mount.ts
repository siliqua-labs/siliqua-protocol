import type * as THREE from "three";

export type Three = typeof THREE;
export type Disposable = { dispose(): void };
export type Track = <D extends Disposable>(item: D) => D;

export type FrameInput = {
  // 0 when the element enters the viewport, 1 when it has scrolled through.
  progress: number;
  time: number;
  reduced: boolean;
  pointer: { x: number; y: number };
  scrollY: number;
};

export type SceneDef<S> = {
  // Canvas height divided by width.
  aspect: number;
  camera: {
    position: [number, number, number];
    lookAt?: [number, number, number];
  };
  // `key` is the shared key light; a scene moves it and turns on its shadow.
  build: (
    T: Three,
    scene: THREE.Scene,
    track: Track,
    key: THREE.DirectionalLight,
  ) => S;
  frame: (state: S, input: FrameInput) => void;
};

export const ease = (p: number) => p * p * (3 - 2 * p);

// The look was tuned on three r128 light units (non-physical, linear falloff).
// These translate them to current intensities with distance decay off.
const KEY = 1.5 * Math.PI;
const rimIntensity = (r128: number) => r128 * 0.8 * Math.PI;
const SWEEP = 1.3 * 0.7 * Math.PI;

// Width, height, colour, position, intensity.
type Softbox = [number, number, number, [number, number, number], number];

// Large softboxes in a dark room, so metal and clear coat have something to reflect.
const STUDIO: Softbox[] = [
  [12, 6, 0xffffff, [0, 9, 1], 3],
  [3, 10, 0xffffff, [-7, 1, 3], 2],
  [2, 10, 0xffffff, [7, 0, 2.5], 1.2],
  [14, 4, 0xffffff, [0, -1, -8], 0.2],
  [4, 1.4, 0x6d001a, [3.5, -4, 5], 1.4],
  [2, 6, 0xffffff, [-4, -3, 6], 0.6],
];

// Baked once into an environment map.
function environment(T: Three, renderer: THREE.WebGLRenderer, track: Track) {
  const env = new T.Scene();
  env.background = new T.Color(0x18181a);
  const parts: Disposable[] = [];
  for (const [w, h, hex, pos, intensity] of STUDIO) {
    const geo = new T.PlaneGeometry(w, h);
    const color = new T.Color(hex)
      .convertSRGBToLinear()
      .multiplyScalar(intensity);
    const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
    parts.push(geo, mat);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  const target = track(pmrem.fromScene(env, 0.035));
  pmrem.dispose();
  for (const p of parts) p.dispose();
  return target.texture;
}

// Resolves to a cleanup function. Throws when WebGL is unavailable; the caller
// decides what to show instead.
export async function mountScene<S>(
  el: HTMLElement,
  def: SceneDef<S>,
): Promise<() => void> {
  const T = await import("three");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Scenes convert their own colours to linear, so automatic conversion stays off.
  T.ColorManagement.enabled = false;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  const owned: Disposable[] = [];
  const track: Track = (item) => {
    owned.push(item);
    return item;
  };

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, window.innerWidth < 860 ? 1.5 : 2),
  );
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  el.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.environment = environment(T, renderer, track);
  const key = track(new T.DirectionalLight(0xffffff, KEY));
  key.position.set(-3, 6, 4);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  Object.assign(key.shadow.camera, {
    left: -5,
    right: 5,
    top: 5,
    bottom: -5,
    near: 0.5,
    far: 30,
  });
  const rim = new T.PointLight(
    new T.Color(0x6d001a).convertSRGBToLinear(),
    rimIntensity(2.2),
    30,
    0,
  );
  rim.position.set(4, -3, 3);
  // A white light that orbits so highlights travel across the surfaces.
  const sweep = new T.PointLight(0xffffff, SWEEP, 22, 0);
  sweep.position.set(4, 3, 5);
  scene.add(key, rim, sweep);

  const camera = new T.PerspectiveCamera(32, 1 / def.aspect, 0.1, 50);
  camera.position.set(...def.camera.position);
  if (def.camera.lookAt) camera.lookAt(...def.camera.lookAt);

  const state = def.build(T, scene, track, key);
  const pointer = { x: 0, y: 0 };
  const t0 = performance.now();
  let raf = 0;
  let visible = true;

  const progress = () => {
    const b = el.getBoundingClientRect();
    const p =
      ((window.innerHeight - b.top) / (window.innerHeight + b.height)) * 1.7 -
      0.2;
    return Math.min(1, Math.max(0, p));
  };
  const draw = () => {
    raf = 0;
    const time = (performance.now() - t0) / 1000;
    if (!reduced) {
      sweep.position.set(
        Math.cos(time * 0.55) * 5.5,
        1.5 + Math.sin(time * 0.8) * 2.2,
        4.5 + Math.sin(time * 0.55) * 1.5,
      );
      rim.intensity = rimIntensity(1.7 + Math.sin(time * 1.4) * 0.5);
    }
    def.frame(state, {
      progress: reduced ? 1 : progress(),
      time,
      reduced,
      pointer,
      scrollY: reduced ? 0 : window.scrollY,
    });
    renderer.render(scene, camera);
    if (visible && !reduced) raf = requestAnimationFrame(draw);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };

  const resize = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (w === 0) return;
    renderer.setSize(w, w * def.aspect, false);
    schedule();
  });
  resize.observe(el);

  const io = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) schedule();
  });
  io.observe(el);

  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    pointer.y = (e.clientY / window.innerHeight - 0.5) * 0.5;
  };
  if (!reduced) window.addEventListener("pointermove", onPointer);

  return () => {
    resize.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onPointer);
    cancelAnimationFrame(raf);
    visible = false;
    for (const item of owned) item.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
