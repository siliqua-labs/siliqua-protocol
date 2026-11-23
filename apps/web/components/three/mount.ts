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
  build: (T: Three, scene: THREE.Scene, track: Track) => S;
  frame: (state: S, input: FrameInput) => void;
};

export const ease = (p: number) => p * p * (3 - 2 * p);

// Soft studio reflections: white strip lights, a burgundy kicker and a dark fill, baked once into an environment map.
function environment(T: Three, renderer: THREE.WebGLRenderer, track: Track) {
  const env = new T.Scene();
  const planes: [number, number, number, [number, number, number]][] = [
    [8, 1, 0xffffff, [-3, 4, 3]],
    [1, 6, 0xffffff, [4, 0, 2]],
    [6, 0.8, 0x6d001a, [2, -4, 3]],
    [3, 3, 0x14060a, [-5, -1, 2]],
  ];
  const parts: Disposable[] = [];
  for (const [w, h, color, pos] of planes) {
    const geo = new T.PlaneGeometry(w, h);
    const mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
    parts.push(geo, mat);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  const target = track(pmrem.fromScene(env, 0.04));
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
  // The look was tuned on three r128: raw linear output, no colour management,
  // and non-physical light units (intensity * PI, linear distance falloff).
  T.ColorManagement.enabled = false;
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
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
  const key = new T.DirectionalLight(0xffffff, 1.1 * Math.PI);
  key.position.set(-3, 4, 4);
  const rim = new T.PointLight(0x6d001a, 2.2 * 0.8 * Math.PI, 30, 0);
  rim.position.set(4, -3, 3);
  scene.add(key, rim);

  const camera = new T.PerspectiveCamera(32, 1 / def.aspect, 0.1, 50);
  camera.position.set(...def.camera.position);
  if (def.camera.lookAt) camera.lookAt(...def.camera.lookAt);

  const state = def.build(T, scene, track);
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
    def.frame(state, {
      progress: reduced ? 1 : progress(),
      time: (performance.now() - t0) / 1000,
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
