import type * as THREE from "three";
import { rng } from "../../lib/rng";
import { ease, type SceneDef, type Three, type Track } from "./mount";

// Procedural art, drawn once into canvases. No external image assets.
function coinFace(back: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas context unavailable");
  const r = rng(back ? 7 : 3);
  const gr = g.createRadialGradient(256, 230, 40, 256, 256, 260);
  gr.addColorStop(0, "#d4d1cb");
  gr.addColorStop(1, "#8d8a85");
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#6e6b66";
  for (let i = 0; i < 72; i++) {
    g.beginPath();
    g.arc(
      256 + Math.cos((i / 72) * 6.283) * 238,
      256 + Math.sin((i / 72) * 6.283) * 238,
      5,
      0,
      6.283,
    );
    g.fill();
  }
  g.strokeStyle = "#55524e";
  g.lineWidth = 3;
  for (const radius of [222, 170]) {
    g.beginPath();
    g.arc(256, 256, radius, 0, 6.283);
    g.stroke();
  }
  if (!back) {
    const text = "SILIQUA · THE COIN OF COMPUTE · ";
    g.font = "700 26px monospace";
    g.fillStyle = "#3c3a37";
    g.textAlign = "center";
    [...text].forEach((ch, i) => {
      g.save();
      g.translate(256, 256);
      g.rotate((i / text.length) * 6.283);
      g.translate(0, -190);
      g.fillText(ch, 0, 0);
      g.restore();
    });
    g.strokeStyle = "#4a4743";
    g.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const a = r() * 6.283;
      const x = 256 + Math.cos(a) * 62;
      const y = 256 + Math.sin(a) * 62;
      const len = 40 + r() * 50;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    g.fillStyle = "#2b2a28";
    g.fillRect(196, 196, 120, 120);
    g.strokeStyle = "#9a968f";
    g.strokeRect(210, 210, 92, 92);
    g.fillStyle = "#5c5954";
    g.fillRect(236, 236, 40, 40);
  } else {
    g.fillStyle = "#4a4743";
    for (let a = 0; a < 11; a++) {
      for (let b = 0; b < 11; b++) {
        const x = 96 + a * 32;
        const y = 96 + b * 32;
        if (Math.hypot(x + 10 - 256, y + 10 - 256) < 150)
          g.fillRect(x, y, 20, 20);
      }
    }
  }
  return c;
}

function layerFace(i: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas context unavailable");
  const r = rng(20 + i);
  g.fillStyle = "#8d8a85";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#3c3a37";
  if (i === 0) {
    for (let j = 0; j < 60; j++)
      g.fillRect(30 + r() * 190, 30 + r() * 190, 8, 8);
  } else if (i === 1) {
    for (let j = 0; j < 3; j++) {
      g.beginPath();
      g.arc(
        128 + Math.cos(j * 2.094) * 60,
        128 + Math.sin(j * 2.094) * 60,
        22,
        0,
        6.283,
      );
      g.fill();
    }
  } else if (i === 2) {
    g.fillRect(88, 88, 80, 80);
  } else {
    g.fillRect(40, 100, 80, 56);
    g.fillStyle = "#e0662b";
    g.fillRect(136, 100, 80, 56);
  }
  g.strokeStyle = "#55524e";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 118, 0, 6.283);
  g.stroke();
  return c;
}

// Alternating light and dark bands, used as a bump map for the coin edge.
function reedTexture(T: Three, track: Track): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 4;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas context unavailable");
  g.fillStyle = "#222";
  g.fillRect(0, 0, 64, 4);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 32, 4);
  const t = track(new T.CanvasTexture(c));
  t.wrapS = T.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

function colorTexture(T: Three, track: Track, canvas: HTMLCanvasElement) {
  return track(new T.CanvasTexture(canvas));
}

export const coinScene: SceneDef<{ group: THREE.Group }> = {
  aspect: 1,
  camera: { position: [0, 0, 6] },
  build(T, scene, track) {
    const front = colorTexture(T, track, coinFace(false));
    const back = colorTexture(T, track, coinFace(true));
    const reed = reedTexture(T, track);
    const face = (map: THREE.Texture) =>
      track(
        new T.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.92,
          roughness: 0.3,
          map,
          bumpMap: map,
          bumpScale: 2,
        }),
      );
    const edge = track(
      new T.MeshStandardMaterial({
        color: 0xb8b5b0,
        metalness: 0.92,
        roughness: 0.32,
        bumpMap: reed,
        bumpScale: 3,
      }),
    );
    const mesh = new T.Mesh(
      track(new T.CylinderGeometry(1.5, 1.5, 0.34, 120, 1)),
      [edge, face(front), face(back)],
    );
    mesh.rotation.x = Math.PI / 2;
    const group = new T.Group();
    group.add(mesh);
    scene.add(group);
    return { group };
  },
  frame({ group }, f) {
    // Slow spin, nudged by pointer and scroll. Reduced motion freezes all three.
    group.rotation.set(
      0.35 + f.pointer.y + f.scrollY * 0.0003,
      f.time * 0.36 + f.scrollY * 0.004 + 0.6 + f.pointer.x,
      0.12,
    );
  },
};

// Four coins that separate as the section scrolls into view: sources,
// operators, oracle, markets.
export const stackScene: SceneDef<{
  group: THREE.Group;
  discs: THREE.Mesh[];
  beam: THREE.MeshBasicMaterial;
}> = {
  aspect: 1.15,
  camera: { position: [0, 0, 9] },
  build(T, scene, track) {
    const reed = reedTexture(T, track);
    const edge = track(
      new T.MeshStandardMaterial({
        color: 0xb8b5b0,
        metalness: 0.92,
        roughness: 0.32,
        envMapIntensity: 1.7,
        bumpMap: reed,
        bumpScale: 3,
      }),
    );
    const geo = track(new T.CylinderGeometry(1.5, 1.5, 0.16, 96, 1));
    const group = new T.Group();
    const discs = [0, 1, 2, 3].map((i) => {
      const map = colorTexture(T, track, layerFace(i));
      const face = track(
        new T.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.9,
          roughness: 0.32,
          envMapIntensity: 1.7,
          map,
          bumpMap: map,
          bumpScale: 1.2,
        }),
      );
      const disc = new T.Mesh(geo, [edge, face, face]);
      group.add(disc);
      return disc;
    });
    const beam = track(
      new T.MeshBasicMaterial({
        color: 0xe0662b,
        transparent: true,
        opacity: 0,
      }),
    );
    group.add(
      new T.Mesh(track(new T.CylinderGeometry(0.03, 0.03, 6.6, 8)), beam),
    );
    group.rotation.x = 0.5;
    scene.add(group);
    scene.add(new T.HemisphereLight(0xfff1dd, 0x4a3022, 0.7 * Math.PI));
    const front = new T.DirectionalLight(0xfff1dd, 1.1 * Math.PI);
    front.position.set(0, 2, 7);
    scene.add(front);
    return { group, discs, beam };
  },
  frame({ group, discs, beam }, f) {
    const e = ease(f.progress);
    discs.forEach((d, i) => {
      d.position.y = (1.5 - i) * (0.3 + e * 1.05);
      d.rotation.y = f.reduced ? 0.4 : f.time * 0.3 + i * 0.6;
    });
    beam.opacity = e * 0.9;
    group.rotation.y = f.reduced ? 0 : Math.sin(f.time * 0.4) * 0.2;
  },
};

// Two coin piles sized to the YES and NO pools; they build up on scroll.
export function poolsScene(
  yesShare: number,
): SceneDef<{ piles: [THREE.Mesh, THREE.Mesh][]; yesCount: number }> {
  const total = 20;
  const yesCount = Math.round(yesShare * total);
  return {
    aspect: 0.75,
    camera: { position: [0, 2.2, 9], lookAt: [0, 0.9, 0] },
    build(T, scene, track) {
      const geo = track(new T.CylinderGeometry(1, 1, 0.1, 64));
      const yes = track(
        new T.MeshStandardMaterial({
          color: 0xe0662b,
          metalness: 0.85,
          roughness: 0.35,
        }),
      );
      const no = track(
        new T.MeshStandardMaterial({
          color: 0xc9c6c0,
          metalness: 0.92,
          roughness: 0.3,
        }),
      );
      const piles = Array.from(
        { length: total },
        (_, i): [THREE.Mesh, THREE.Mesh] => {
          const a = new T.Mesh(geo, yes);
          const b = new T.Mesh(geo, no);
          a.position.set(-1.5, i * 0.13, 0);
          b.position.set(1.5, i * 0.13, 0);
          a.visible = b.visible = false;
          scene.add(a, b);
          return [a, b];
        },
      );
      return { piles, yesCount };
    },
    frame({ piles, yesCount: n }, f) {
      const built = Math.round(ease(f.progress) * total);
      piles.forEach(([a, b], i) => {
        a.visible = i < Math.min(n, built);
        b.visible = i < Math.min(total - n, built);
        a.rotation.y = b.rotation.y = f.reduced
          ? 0.3
          : f.time * 0.35 + i * 0.25;
      });
    },
  };
}
