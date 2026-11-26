import type * as THREE from "three";
import { rng } from "../../lib/rng";
import { ease, type SceneDef, type Three, type Track } from "./mount";

// Procedural art, drawn once into canvases. No external image assets.
// Palette: white satin panels, ink, one burgundy accent.
const BURGUNDY = "#6D001A";
const INK = "#0A0A0A";
const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

function canvas2d(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) throw new Error("2d canvas context unavailable");
  return [c, x];
}

const LABELS = [
  "SETTINGS",
  "STATUS",
  "LOCKED",
  "SURFACE",
  "VOLUME",
  "MASS",
  "DENSITY",
  "GRI-H100",
  "CMI-AI",
  "ORACLE",
  "SYNC",
  "H100",
  "A100",
  "B200",
  "MEDIAN",
  "VALID 6/12",
  "USD/GPU-HR",
  "SCANNING",
  "CHARGE",
  "RELEVANCE",
  "AC 4520",
];

// Micro-UI texture for a panel: tags, gauges, barcodes, hatching, crosshairs.
function detailTexture(
  w: number,
  h: number,
  seed: number,
  dark: boolean,
  ring: boolean,
): HTMLCanvasElement {
  const [c, x] = canvas2d(w, h);
  const r = rng(seed);
  const s = Math.max(9, w / 100);
  const bg = x.createLinearGradient(0, 0, w, h);
  if (dark) {
    bg.addColorStop(0, "#1b1b1e");
    bg.addColorStop(1, "#08080a");
  } else {
    bg.addColorStop(0, "#fcfbfb");
    bg.addColorStop(0.5, "#ebe7e7");
    bg.addColorStop(1, "#f8f6f6");
  }
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  const ink = dark ? "rgba(255,255,255,.8)" : "rgba(10,10,10,.72)";
  const dim = dark ? "rgba(255,255,255,.28)" : "rgba(10,10,10,.22)";
  x.fillStyle = dim;
  for (let i = 0; i < w; i += s * 1.3)
    for (let j = 0; j < h; j += s * 1.3)
      if (r() < 0.1) x.fillRect(i, j, 1.5, 1.5);
  x.lineWidth = 1.2;
  x.font = `500 ${s}px monospace`;
  x.textBaseline = "middle";
  const count = Math.round((w * h) / 9000);
  for (let k = 0; k < count; k++) {
    const px = r() * w;
    const py = r() * h;
    const dx = (px / w) * 2 - 1;
    const dy = (py / h) * 2 - 1;
    if (ring && Math.hypot(dx, dy) < 0.7) continue;
    const kind = Math.floor(r() * 9);
    const label = LABELS[Math.floor(r() * LABELS.length)] ?? "SYNC";
    x.strokeStyle = ink;
    x.fillStyle = ink;
    if (kind === 0) {
      x.fillRect(px, py - 2, 4, 4);
      x.fillText(label, px + 9, py);
    } else if (kind === 1) {
      const tw = x.measureText(label).width + s;
      x.fillStyle = dark ? "#fff" : INK;
      x.fillRect(px, py - s * 0.8, tw, s * 1.6);
      x.fillStyle = dark ? INK : "#fff";
      x.fillText(label, px + s * 0.5, py);
    } else if (kind === 2) {
      const pw = s * 3.2;
      x.strokeStyle = dim;
      x.strokeRect(px, py - s * 0.7, pw, s * 1.4);
      x.fillStyle = r() < 0.5 ? BURGUNDY : ink;
      x.fillRect(
        px + (r() < 0.5 ? 2 : pw * 0.5),
        py - s * 0.7 + 2,
        pw * 0.5 - 2,
        s * 1.4 - 4,
      );
    } else if (kind === 3) {
      const rr = s * (1.2 + r() * 1.6);
      x.beginPath();
      x.arc(px, py, rr, 0, TAU);
      x.stroke();
      x.beginPath();
      x.arc(px, py, rr * 0.45, 0, TAU);
      x.stroke();
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * TAU;
        x.beginPath();
        x.moveTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
        x.lineTo(px + Math.cos(a) * (rr + 3), py + Math.sin(a) * (rr + 3));
        x.stroke();
      }
      x.fillStyle = BURGUNDY;
      x.fillRect(px - 2, py - 2, 4, 4);
    } else if (kind === 4) {
      for (let j = 0; j < 26; j++)
        x.fillRect(px + j * 3.4, py, 1 + r() * 2, s * 1.8);
    } else if (kind === 5) {
      const hw = s * 7;
      const hh = s * 1.4;
      x.save();
      x.beginPath();
      x.rect(px, py, hw, hh);
      x.clip();
      for (let j = -hh; j < hw; j += 4) {
        x.beginPath();
        x.moveTo(px + j, py + hh);
        x.lineTo(px + j + hh, py);
        x.stroke();
      }
      x.restore();
    } else if (kind === 6) {
      const mm = `0${Math.floor(r() * 60)}`.slice(-2);
      const ss = `0${Math.floor(r() * 99)}`.slice(-2);
      x.fillText(`00:${mm}:${ss}`, px, py);
    } else if (kind === 7) {
      x.fillStyle = BURGUNDY;
      x.fillRect(px, py, s * (2 + r() * 4), s * 0.55);
    } else {
      x.beginPath();
      x.moveTo(px - 5, py);
      x.lineTo(px + 5, py);
      x.moveTo(px, py - 5);
      x.lineTo(px, py + 5);
      x.stroke();
    }
  }
  return c;
}

// Value-noise height field coloured black-cherry to blush. Four octaves keep
// the landforms large; contours are dark bands one level wide, so they read
// as thick on gentle ground and thin on steep ground.
const TERRAIN_PX = 640;
const FACE_PX = 1024;

function terrainTexture(size: number): HTMLCanvasElement {
  const [c, x] = canvas2d(size);
  const r = rng(5);
  const lattice = Array.from({ length: 1024 }, () => r());
  const at = (X: number, Y: number) => lattice[(X & 31) * 32 + (Y & 31)] ?? 0;
  const noise = (p: number, q: number) => {
    const ix = Math.floor(p);
    const iy = Math.floor(q);
    const fx = p - ix;
    const fy = q - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return (
      at(ix, iy) * (1 - u) * (1 - v) +
      at(ix + 1, iy) * u * (1 - v) +
      at(ix, iy + 1) * (1 - u) * v +
      at(ix + 1, iy + 1) * u * v
    );
  };
  const H = new Float32Array(size * size);
  for (let j = 0; j < size; j++)
    for (let k = 0; k < size; k++) {
      let sum = 0;
      let amp = 0.5;
      let freq = 3;
      for (let a = 0; a < 4; a++) {
        sum +=
          amp * noise((k / size) * freq + a * 7, (j / size) * freq + a * 3);
        amp /= 2;
        freq *= 2;
      }
      H[j * size + k] = sum;
    }
  const stops: [number, [number, number, number]][] = [
    [0, [58, 0, 15]],
    [0.4, [109, 0, 26]],
    [0.7, [196, 160, 166]],
    [1, [250, 246, 246]],
  ];
  const im = x.createImageData(size, size);
  const d = im.data;
  for (let j = 1; j < size - 1; j++)
    for (let k = 1; k < size - 1; k++) {
      const i = j * size + k;
      const h = H[i] ?? 0;
      const t = Math.max(0, Math.min(1, (h - 0.25) / 0.5));
      let shade = Math.max(
        0.55,
        Math.min(
          1.3,
          1 +
            ((H[i - 1] ?? 0) -
              (H[i + 1] ?? 0) +
              (H[i - size] ?? 0) -
              (H[i + size] ?? 0)) *
              6,
        ),
      );
      if ((h * 18) % 1 < 0.07) shade *= 0.82;
      let m = 0;
      while (m < stops.length - 2 && t > (stops[m + 1]?.[0] ?? 1)) m++;
      const p0 = stops[m];
      const p1 = stops[m + 1];
      if (!p0 || !p1) continue;
      const w = p1[0] > p0[0] ? (t - p0[0]) / (p1[0] - p0[0]) : 0;
      p0[1].forEach((from, a) => {
        const to = p1[1][a] ?? from;
        d[i * 4 + a] = Math.min(255, (from + (to - from) * w) * shade);
      });
      d[i * 4 + 3] = 255;
    }
  x.putImageData(im, 0, 0);
  return c;
}

function terrainFace(): HTMLCanvasElement {
  const S = FACE_PX;
  const [c, x] = canvas2d(S);
  x.imageSmoothingQuality = "high";
  x.drawImage(terrainTexture(TERRAIN_PX), 0, 0, S, S);
  x.strokeStyle = "rgba(255,255,255,.07)";
  x.lineWidth = 1;
  for (let i = 0; i < S; i += 64) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, S);
    x.moveTo(0, i);
    x.lineTo(S, i);
    x.stroke();
  }
  let g = x.createRadialGradient(S / 2, S / 2, 260, S / 2, S / 2, 620);
  g.addColorStop(0, "rgba(30,0,8,0)");
  g.addColorStop(1, "rgba(30,0,8,.28)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0.25, "rgba(255,255,255,0)");
  g.addColorStop(0.42, "rgba(255,255,255,.22)");
  g.addColorStop(0.6, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const r = rng(9);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(255,255,255,${r() * 0.08})`;
    x.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  return c;
}

// Tick ring and engraved text, drawn white so it reads on the dark terrain.
function ringTicks(): HTMLCanvasElement {
  const [c, x] = canvas2d(1024);
  const text = "SILIQUA · COMPUTE INDEX · GRI · CMI · ORACLE · MARKETS · ";
  x.translate(512, 512);
  x.strokeStyle = x.fillStyle = "#fff";
  x.shadowColor = "rgba(40,0,12,.6)";
  x.shadowBlur = 5;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    const r1 = 436 - (i % 5 ? 12 : 28);
    x.lineWidth = i % 5 ? 1.4 : 2.4;
    x.beginPath();
    x.moveTo(Math.cos(a) * 436, Math.sin(a) * 436);
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.stroke();
  }
  x.font = "500 17px monospace";
  x.textAlign = "center";
  [...text].forEach((ch, i) => {
    x.save();
    x.rotate((i / text.length) * TAU);
    x.translate(0, -372);
    x.fillText(ch, 0, 0);
    x.restore();
  });
  x.lineWidth = 1.6;
  x.beginPath();
  x.arc(0, 0, 400, 0, TAU);
  x.stroke();
  x.setLineDash([2, 11]);
  x.lineWidth = 4;
  x.beginPath();
  x.arc(0, 0, 338, 0, TAU);
  x.stroke();
  x.setLineDash([]);
  x.lineWidth = 2;
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as Pt[]) {
    x.beginPath();
    x.moveTo(sx * 150, sy * 100);
    x.lineTo(sx * 150, sy * 150);
    x.lineTo(sx * 100, sy * 150);
    x.stroke();
  }
  x.lineWidth = 1.6;
  for (const [from, to] of [
    [60, 230],
    [-230, -60],
  ] as Pt[]) {
    x.beginPath();
    x.moveTo(from, 0);
    x.lineTo(to, 0);
    x.moveTo(0, from);
    x.lineTo(0, to);
    x.stroke();
  }
  x.fillRect(-4, -300, 8, 22);
  x.fillRect(-4, 278, 8, 22);
  x.fillRect(-300, -4, 22, 8);
  x.fillRect(278, -4, 22, 8);
  x.beginPath();
  x.arc(0, 0, 12, 0, TAU);
  x.stroke();
  x.beginPath();
  x.arc(0, 0, 3, 0, TAU);
  x.fill();
  return c;
}

// Rotating bezel arcs drawn on a separate plane so they can spin.
function bezelArcs(): HTMLCanvasElement {
  const [c, x] = canvas2d(1024);
  x.translate(512, 512);
  x.strokeStyle = "#fff";
  x.shadowColor = "rgba(40,0,12,.55)";
  x.shadowBlur = 6;
  const arc = (r: number, w: number, a0: number, a1: number, al: number) => {
    x.globalAlpha = al;
    x.lineWidth = w;
    x.beginPath();
    x.arc(0, 0, r, a0, a1);
    x.stroke();
  };
  arc(300, 16, 0.5, 2.3, 0.95);
  arc(300, 3, 2.5, 5.9, 0.8);
  arc(236, 7, 3.4, 4.9, 0.9);
  x.setLineDash([3, 15]);
  arc(268, 5, 0, TAU, 0.8);
  x.setLineDash([]);
  arc(198, 24, 5.2, 6.1, 0.5);
  arc(198, 2, 0, TAU, 0.7);
  x.globalAlpha = 1;
  x.fillStyle = "#fff";
  for (const a of [0.5, 2.3, 3.4, 4.9])
    x.fillRect(Math.cos(a) * 300 - 5, Math.sin(a) * 300 - 5, 10, 10);
  return c;
}

const SHADOW_PX = 512;
// Canvas pixels per scene unit.
const SHADOW_SCALE = 34;

// Soft contact shadow, drawn offscreen so only the blur lands on the canvas,
// then faded radially so the square canvas never shows.
function shadowTexture(poly: Pt[]): HTMLCanvasElement {
  const [c, x] = canvas2d(SHADOW_PX);
  const mid = SHADOW_PX / 2;
  x.shadowColor = "rgba(17,17,17,.2)";
  x.shadowBlur = 34;
  x.shadowOffsetX = 1000;
  x.translate(-1000, 0);
  x.fillStyle = "#000";
  x.beginPath();
  poly.forEach(([px, py], i) => {
    const X = mid + px * SHADOW_SCALE;
    const Y = mid - py * SHADOW_SCALE;
    if (i) x.lineTo(X, Y);
    else x.moveTo(X, Y);
  });
  x.fill();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.shadowColor = "transparent";
  x.globalCompositeOperation = "destination-in";
  const fade = x.createRadialGradient(mid, mid, 150, mid, mid, 254);
  fade.addColorStop(0, "#000");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = fade;
  x.fillRect(0, 0, SHADOW_PX, SHADOW_PX);
  return c;
}

const LAYER_NAMES = ["SOURCES", "OPERATORS", "ORACLE", "MARKETS"];

function layerTexture(i: number): HTMLCanvasElement {
  const [c, x] = canvas2d(1024);
  const r = rng(30 + i);
  x.drawImage(detailTexture(1024, 1024, 40 + i, false, true), 0, 0);
  x.scale(2, 2);
  x.translate(256, 256);
  x.strokeStyle = x.fillStyle = BURGUNDY;
  x.lineWidth = 1.6;
  for (let j = 0; j < 120; j++) {
    const a = (j / 120) * TAU;
    const l = j % 5 ? 8 : 18;
    x.beginPath();
    x.moveTo(Math.cos(a) * 205, Math.sin(a) * 205);
    x.lineTo(Math.cos(a) * (205 - l), Math.sin(a) * (205 - l));
    x.stroke();
  }
  x.beginPath();
  x.arc(0, 0, 150, 0, TAU);
  x.stroke();
  x.setLineDash([2, 8]);
  x.beginPath();
  x.arc(0, 0, 176, 0, TAU);
  x.stroke();
  x.setLineDash([]);
  if (i === 0) {
    for (let j = 0; j < 60; j++) {
      const a = r() * TAU;
      const l = r() * 120;
      x.fillRect(Math.cos(a) * l - 2.5, Math.sin(a) * l - 2.5, 5, 5);
    }
  } else if (i === 1) {
    for (let j = 0; j < 3; j++) {
      x.beginPath();
      x.arc(
        Math.cos(j * 2.094 - 1.57) * 52,
        Math.sin(j * 2.094 - 1.57) * 52,
        32,
        0,
        TAU,
      );
      x.fill();
    }
  } else if (i === 2) {
    x.fillStyle = INK;
    x.fillRect(-52, -52, 104, 104);
    x.strokeStyle = "#fff";
    x.strokeRect(-38, -38, 76, 76);
    x.fillStyle = BURGUNDY;
    x.fillRect(-16, -16, 32, 32);
  } else {
    x.fillStyle = INK;
    x.fillRect(-90, -34, 84, 68);
    x.fillStyle = BURGUNDY;
    x.fillRect(6, -34, 84, 68);
  }
  x.fillStyle = INK;
  x.font = "700 17px monospace";
  x.textAlign = "center";
  x.fillText(`0${i + 1} · ${LAYER_NAMES[i]}`, 0, -112);
  return c;
}

function hexPoints(radius: number): Pt[] {
  return Array.from(
    { length: 6 },
    (_, i): Pt => [
      Math.cos((i * Math.PI) / 3) * radius,
      Math.sin((i * Math.PI) / 3) * radius,
    ],
  );
}

function shapeOf(T: Three, pts: Pt[]): THREE.Shape {
  const s = new T.Shape();
  pts.forEach(([px, py], i) => {
    if (i) s.lineTo(px, py);
    else s.moveTo(px, py);
  });
  s.closePath();
  return s;
}

// Planar UVs so a texture spans the whole outline instead of the extrude default.
function fitUv(
  g: THREE.BufferGeometry,
  x0: number,
  y0: number,
  w: number,
  h: number,
) {
  const p = g.attributes.position;
  const u = g.attributes.uv;
  if (!p || !u) throw new Error("extruded geometry has no position or uv");
  for (let i = 0; i < p.count; i++)
    u.setXY(i, (p.getX(i) - x0) / w, (p.getY(i) - y0) / h);
  return g;
}

function hexGeometry(
  T: Three,
  track: Track,
  radius: number,
  depth: number,
  bevel = 0.02,
) {
  const g = new T.ExtrudeGeometry(shapeOf(T, hexPoints(radius)), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  return track(fitUv(g, -radius, -radius, 2 * radius, 2 * radius));
}

function polyGeometry(T: Three, track: Track, pts: Pt[], depth: number) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const g = new T.ExtrudeGeometry(shapeOf(T, pts), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  return track(fitUv(g, x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0));
}

// Hex colours are authored in sRGB; the renderer lights in linear space.
const linear = (T: Three, hex: number) =>
  new T.Color(hex).convertSRGBToLinear();

// Satin lacquer with a clear coat: the "premium" look comes from this plus the
// studio environment map set up in mount.ts.
function lacquer(
  T: Three,
  track: Track,
  color: number,
  extra: THREE.MeshPhysicalMaterialParameters = {},
) {
  return track(
    new T.MeshPhysicalMaterial({
      color: linear(T, color),
      metalness: 0.05,
      roughness: 0.46,
      clearcoat: 0.6,
      clearcoatRoughness: 0.22,
      ...extra,
    }),
  );
}

// Raw canvas texture, for bump, roughness and glow maps.
function texture(T: Three, track: Track, c: HTMLCanvasElement) {
  const t = track(new T.CanvasTexture(c));
  t.anisotropy = 8;
  return t;
}

// Canvas texture holding colours, decoded from sRGB.
function colorTexture(T: Three, track: Track, c: HTMLCanvasElement) {
  const t = texture(T, track, c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

// Radial glow: a filled spot, or a thin ring when `ring` is set.
function radialTexture(inner: string, outer: string, ring = false) {
  const [c, x] = canvas2d(256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (ring) {
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.72, "rgba(0,0,0,0)");
    g.addColorStop(0.84, inner);
  } else {
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
  }
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return c;
}

// Diagonal light band that sweeps across the terrain.
function sheenTexture(): HTMLCanvasElement {
  const [c, x] = canvas2d(512);
  const g = x.createLinearGradient(0, 512, 512, 0);
  g.addColorStop(0.38, "rgba(255,255,255,0)");
  g.addColorStop(0.48, "rgba(255,235,240,.55)");
  g.addColorStop(0.5, "rgba(255,255,255,.9)");
  g.addColorStop(0.52, "rgba(255,235,240,.55)");
  g.addColorStop(0.62, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return c;
}

const BASE: Pt[] = [
  [3.5, 0],
  [2.05, 2.52],
  [1.6, 2.52],
  [1.35, 3.03],
  [-1.75, 3.03],
  [-2.2, 2.25],
  [-3.5, 0],
  [-1.75, -3.03],
  [1.2, -3.03],
  [1.5, -2.55],
  [2.1, -2.55],
];
const LEFT: Pt[] = [
  [-4.15, 0.95],
  [-3.1, 1.2],
  [-3.1, -1.3],
  [-4.15, -1.6],
];
const TOP: Pt[] = [
  [0.2, 2.95],
  [2.7, 2.95],
  [3.0, 3.35],
  [0.5, 3.35],
];
const BOTTOM: Pt[] = [
  [-1.3, -3.0],
  [1.5, -3.0],
  [1.2, -3.5],
  [-1.6, -3.5],
];
const RIGHT: Pt[] = [
  [2.3, -2.05],
  [4.15, -1.75],
  [4.15, -1.05],
  [2.5, -1.35],
];

type CoinState = {
  group: THREE.Group;
  bezel: THREE.Mesh;
  terrain: THREE.MeshPhysicalMaterial;
  sheen: THREE.Texture;
  aura: THREE.MeshBasicMaterial;
  ripple: THREE.Mesh;
  rippleMaterial: THREE.MeshBasicMaterial;
  look: { x: number; y: number };
};

// Hero: layered satin panels tilting as one body toward the pointer, with a
// slow idle sway, a spinning bezel and a pulsing terrain core.
export const coinScene: SceneDef<CoinState> = {
  aspect: 1,
  camera: { position: [0, 0, 15.5] },
  build(T, scene, track) {
    const group = new T.Group();
    const add = <O extends THREE.Object3D>(obj: O) => {
      group.add(obj);
      return obj;
    };
    const edge = {
      light: lacquer(T, track, 0xd4d4d6, { roughness: 0.4, metalness: 0.2 }),
      dark: lacquer(T, track, 0x1c1c1e, { roughness: 0.35, metalness: 0.9 }),
    };
    const panel = (
      geo: THREE.BufferGeometry,
      map: HTMLCanvasElement,
      z: number,
      tone: keyof typeof edge = "light",
      extra: THREE.MeshPhysicalMaterialParameters = {},
    ) => {
      const face = lacquer(T, track, 0xffffff, {
        map: colorTexture(T, track, map),
        ...extra,
      });
      const mesh = new T.Mesh(geo, [face, edge[tone]]);
      mesh.position.z = z;
      add(mesh);
      return face;
    };
    // A flat decal or glow that ignores tone mapping.
    const sheet = (
      geo: THREE.BufferGeometry,
      map: THREE.Texture,
      z: number,
      extra: THREE.MeshBasicMaterialParameters = {},
    ) => {
      const mat = track(
        new T.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          ...extra,
        }),
      );
      const mesh = new T.Mesh(geo, mat);
      mesh.position.z = z;
      return { mesh: add(mesh), mat };
    };
    const plane = (size: number) => track(new T.PlaneGeometry(size, size));
    // Wide soft shadow under each layer so the stack reads as separate plates.
    // It floats with less parallax than its panel, so it separates as you move.
    const shadow = (
      pts: Pt[],
      z: number,
      ox: number,
      oy: number,
      scale: number,
    ) => {
      const { mesh } = sheet(
        plane((SHADOW_PX / SHADOW_SCALE) * scale),
        colorTexture(T, track, shadowTexture(pts)),
        z,
        { opacity: 0.5 },
      );
      mesh.position.set(ox, oy, z);
    };
    const overlay = (map: HTMLCanvasElement, z: number) =>
      sheet(plane(4.9), colorTexture(T, track, map), z).mesh;

    shadow(BASE, -1.2, 0.25, -0.45, 1.35);
    panel(
      polyGeometry(T, track, BASE, 0.14),
      detailTexture(1536, 1536, 11, false, false),
      -0.6,
    );
    panel(
      polyGeometry(T, track, LEFT, 0.12),
      detailTexture(512, 1024, 21, true, false),
      0.05,
      "dark",
    );
    panel(
      polyGeometry(T, track, TOP, 0.1),
      detailTexture(1024, 256, 31, true, false),
      -0.1,
      "dark",
    );
    panel(
      polyGeometry(T, track, BOTTOM, 0.1),
      detailTexture(1024, 256, 41, true, false),
      -0.1,
      "dark",
    );
    panel(
      polyGeometry(T, track, RIGHT, 0.1),
      detailTexture(1024, 384, 51, false, false),
      0.05,
    );
    shadow(hexPoints(3.0), -0.5, 0.12, -0.28, 1.25);
    panel(
      hexGeometry(T, track, 3.0, 0.16),
      detailTexture(1536, 1536, 61, false, true),
      -0.25,
    );
    shadow(hexPoints(2.45), -0.05, 0.1, -0.2, 1.25);
    const terrain = panel(
      hexGeometry(T, track, 2.45, 0.1),
      terrainFace(),
      0.12,
      "light",
      {
        color: linear(T, 0xc4c4c4),
        roughness: 0.42,
        clearcoat: 0.8,
        clearcoatRoughness: 0.14,
        // three only honours envMapIntensity when the material owns the map.
        envMap: scene.environment,
        envMapIntensity: 0.4,
        emissive: linear(T, 0x8e0f2d),
        emissiveIntensity: 0.3,
      },
    );
    terrain.bumpMap = terrain.map;
    // three now measures bump height per screen pixel, so the r128 value of 2.2
    // becomes roughly 60 times larger at this camera distance.
    terrain.bumpScale = 130;
    terrain.emissiveMap = terrain.map;
    overlay(ringTicks(), 0.34);
    const bezel = overlay(bezelArcs(), 0.4);

    const sheen = texture(T, track, sheenTexture());
    const hex = track(new T.ShapeGeometry(shapeOf(T, hexPoints(2.45))));
    sheet(fitUv(hex, -2.45, -2.45, 4.9, 4.9), sheen, 0.27, {
      blending: T.AdditiveBlending,
      opacity: 0.85,
    });
    const aura = sheet(
      plane(9),
      texture(T, track, radialTexture("rgba(70,0,12,.5)", "rgba(60,0,10,.2)")),
      -1.6,
      { opacity: 0.12 },
    );
    const ripple = sheet(
      plane(6.4),
      texture(T, track, radialTexture("rgba(255,120,150,.9)", "", true)),
      0.36,
      { blending: T.AdditiveBlending, opacity: 0 },
    );

    scene.add(group);
    scene.add(new T.HemisphereLight(0xffffff, 0x1a1a1a, 0.5 * Math.PI));
    return {
      group,
      bezel,
      terrain,
      sheen,
      aura: aura.mat,
      ripple: ripple.mesh,
      rippleMaterial: ripple.mat,
      look: { x: 0, y: 0 },
    };
  },
  frame(s, f) {
    // Pointer arrives as +-0.25; ease toward it so the tilt never snaps.
    s.look.x += (f.pointer.x * 4 - s.look.x) * 0.06;
    s.look.y += (f.pointer.y * 4 - s.look.y) * 0.06;
    s.group.rotation.y = f.reduced
      ? -0.22
      : -0.22 - s.look.x * 0.3 + Math.sin(f.time * 0.5) * 0.05;
    s.group.rotation.x = f.reduced
      ? -0.16
      : -0.16 - s.look.y * 0.2 + Math.cos(f.time * 0.4) * 0.03;
    s.bezel.rotation.z = f.reduced ? 0 : -f.time * 0.25;
    if (f.reduced) return;
    const pulse = 0.5 + 0.5 * Math.sin(f.time * 1.3);
    s.terrain.emissiveIntensity = 0.22 + pulse * 0.38;
    s.aura.opacity = 0.08 + pulse * 0.07;
    s.sheen.offset.set(((f.time * 0.32) % 2.6) - 1.3, 0);
    const wave = (f.time * 0.45) % 1;
    s.ripple.scale.setScalar(0.55 + wave * 0.75);
    s.rippleMaterial.opacity = (1 - wave) * 0.75;
  },
};

// Four hex plates that separate as the section scrolls into view: sources,
// operators, oracle, markets. Lacquered faces, brushed graphite edges and real
// shadows cast between the plates.
export const stackScene: SceneDef<{
  group: THREE.Group;
  plates: THREE.Group[];
  beam: THREE.MeshBasicMaterial;
}> = {
  aspect: 1.15,
  camera: { position: [0, 0, 9] },
  build(T, scene, track, key) {
    const group = new T.Group();
    const geo = hexGeometry(T, track, 1.62, 0.12, 0.022);
    const brushed = texture(T, track, brushedTexture(4));
    brushed.wrapS = brushed.wrapT = T.RepeatWrapping;
    const edge = lacquer(T, track, 0x161616, {
      metalness: 0.6,
      roughness: 0.9,
      roughnessMap: brushed,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
    });
    const plates = [0, 1, 2, 3].map((i) => {
      const face = lacquer(T, track, 0xffffff, {
        map: colorTexture(T, track, layerTexture(i)),
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
        envMap: scene.environment,
        envMapIntensity: 0.6,
      });
      const mesh = new T.Mesh(geo, [face, edge]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = mesh.receiveShadow = true;
      const holder = new T.Group();
      holder.add(mesh);
      group.add(holder);
      return holder;
    });
    const beam = track(
      new T.MeshBasicMaterial({
        color: linear(T, 0x6d001a),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    group.add(
      new T.Mesh(track(new T.CylinderGeometry(0.03, 0.03, 6.6, 12)), beam),
    );
    group.rotation.x = 0.55;
    scene.add(group);
    key.position.set(-2.5, 9, 3);
    key.castShadow = true;
    scene.add(new T.HemisphereLight(0xffffff, 0x1a1a1a, 0.55 * Math.PI));
    return { group, plates, beam };
  },
  frame({ group, plates, beam }, f) {
    const e = ease(f.progress);
    plates.forEach((p, i) => {
      p.position.y = (1.5 - i) * (0.3 + e * 1.05);
      p.rotation.y = f.reduced
        ? 0.3
        : 0.3 + Math.sin(f.time * 0.45 + i * 0.8) * 0.22;
    });
    beam.opacity = e * 0.92;
    group.rotation.y = f.reduced ? 0 : Math.sin(f.time * 0.35) * 0.16;
  },
};

const COINS = 20;
const COIN_H = 0.13;
const STACK_STEP = 0.133;

// Coin with a raised rim, as a lathe profile.
function coinGeometry(T: Three, radius: number, h: number) {
  const profile: Pt[] = [
    [0, 0.012],
    [radius * 0.83, 0.012],
    [radius * 0.88, 0],
    [radius * 0.975, 0],
    [radius, 0.016],
    [radius, h - 0.016],
    [radius * 0.975, h],
    [radius * 0.88, h],
    [radius * 0.83, h - 0.012],
    [0, h - 0.012],
  ];
  return new T.LatheGeometry(
    profile.map(([px, py]) => new T.Vector2(px, py)),
    160,
  );
}

// Bump map for the reeded coin edge.
function reedTexture(): HTMLCanvasElement {
  const [c, x] = canvas2d(2048, 90);
  x.fillStyle = "#000";
  x.fillRect(0, 0, 2048, 90);
  for (let i = 0; i < 2048; i += 6) {
    const g = x.createLinearGradient(i, 0, i + 6, 0);
    g.addColorStop(0, "#000");
    g.addColorStop(0.5, "#fff");
    g.addColorStop(1, "#000");
    x.fillStyle = g;
    x.fillRect(i, 41, 6, 8);
  }
  return c;
}

// Horizontal streaks used as a roughness map for brushed metal.
function brushedTexture(seed: number): HTMLCanvasElement {
  const [c, x] = canvas2d(512);
  const r = rng(seed);
  x.fillStyle = "#8a8a8a";
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(105 + r() * 100);
    x.globalAlpha = 0.35 + r() * 0.5;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(0, r() * 512, 512, 1);
  }
  return c;
}

// Engraved top of the highest coin in a stack.
function coinFace(label: string, ink: string): HTMLCanvasElement {
  const [c, x] = canvas2d(512);
  x.translate(256, 256);
  x.strokeStyle = x.fillStyle = ink;
  x.lineWidth = 5;
  x.beginPath();
  x.arc(0, 0, 206, 0, TAU);
  x.stroke();
  x.lineWidth = 2;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const inner = i % 8 ? 178 : 168;
    x.beginPath();
    x.moveTo(Math.cos(a) * 186, Math.sin(a) * 186);
    x.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    x.stroke();
  }
  x.lineWidth = 4;
  x.beginPath();
  x.arc(0, -26, 70, 0, TAU);
  x.stroke();
  x.fillRect(-28, -54, 56, 56);
  x.font = "600 44px Georgia,serif";
  x.textAlign = "center";
  x.fillText(label, 0, 108);
  x.font = "500 17px monospace";
  x.fillText("SILIQUA · USDG", 0, 146);
  return c;
}

// Burgundy glow on the base, centred under the YES stack.
function glowTexture(): HTMLCanvasElement {
  const [c, x] = canvas2d(512);
  const g = x.createRadialGradient(148, 256, 0, 148, 256, 190);
  g.addColorStop(0, "#8E0F2D");
  g.addColorStop(0.45, "#4a0012");
  g.addColorStop(1, "#000");
  x.fillStyle = "#000";
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return c;
}

type Coin = { mesh: THREE.Mesh; droppedAt: number | null };

type PoolsState = {
  group: THREE.Group;
  stacks: { coins: Coin[]; size: number; face: THREE.Mesh }[];
  base: THREE.MeshPhysicalMaterial;
  yes: THREE.MeshPhysicalMaterial;
};

// Two coin stacks sized to the YES (burgundy) and NO (silver) pools on a dark
// hex base; coins drop in as the section scrolls into view.
export function poolsScene(yesShare: number): SceneDef<PoolsState> {
  const yesCount = Math.round(yesShare * COINS);
  return {
    aspect: 0.75,
    camera: { position: [0, 2.6, 9.4], lookAt: [0, 0.8, 0] },
    build(T, scene, track, key) {
      const group = new T.Group();
      const material = (params: THREE.MeshPhysicalMaterialParameters) =>
        track(new T.MeshPhysicalMaterial(params));
      const colorMap = (c: HTMLCanvasElement) => colorTexture(T, track, c);

      const reed = texture(T, track, reedTexture());
      reed.wrapS = T.RepeatWrapping;
      const coin = track(coinGeometry(T, 0.95, COIN_H));
      const yes = material({
        color: linear(T, 0x6d001a),
        metalness: 0.35,
        roughness: 0.34,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        // three only honours envMapIntensity when the material owns the map.
        envMap: scene.environment,
        envMapIntensity: 0.7,
        bumpMap: reed,
        bumpScale: 0.12,
        emissive: linear(T, 0x8e0f2d),
        emissiveIntensity: 0.2,
      });
      const no = material({
        color: linear(T, 0xdedede),
        metalness: 1,
        roughness: 0.22,
        bumpMap: reed,
        bumpScale: 0.12,
      });

      const brushed = texture(T, track, brushedTexture(8));
      brushed.wrapS = brushed.wrapT = T.RepeatWrapping;
      const baseFace = material({
        map: colorMap(detailTexture(1024, 1024, 77, true, true)),
        roughness: 0.4,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        emissive: 0xffffff,
        emissiveMap: texture(T, track, glowTexture()),
        emissiveIntensity: 0.6,
      });
      const baseEdge = material({
        color: linear(T, 0x3a3a3e),
        metalness: 1,
        roughness: 0.6,
        roughnessMap: brushed,
      });
      const base = new T.Mesh(hexGeometry(T, track, 3.2, 0.12, 0.03), [
        baseFace,
        baseEdge,
      ]);
      base.rotation.x = -Math.PI / 2;
      base.position.y = -0.155;
      base.receiveShadow = true;
      group.add(base);

      // Seeded jitter so the stacks look hand placed.
      const r = rng(19);
      const piles = [
        { x: -1.35, mat: yes, size: yesCount },
        { x: 1.35, mat: no, size: COINS - yesCount },
      ].map((p) => ({ ...p, coins: [] as Coin[] }));
      for (let i = 0; i < COINS; i++)
        for (const pile of piles) {
          const mesh = new T.Mesh(coin, pile.mat);
          mesh.position.set(
            pile.x + (r() - 0.5) * 0.07,
            i * STACK_STEP,
            (r() - 0.5) * 0.07,
          );
          mesh.rotation.y = r() * TAU;
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.visible = false;
          group.add(mesh);
          pile.coins.push({ mesh, droppedAt: null });
        }

      const disc = track(new T.CircleGeometry(0.79, 64));
      const decal = (label: string, ink: string, metalness: number) => {
        const mesh = new T.Mesh(
          disc,
          material({
            map: colorMap(coinFace(label, ink)),
            transparent: true,
            depthWrite: false,
            metalness,
            roughness: 0.35,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        group.add(mesh);
        return mesh;
      };
      const faces = [decal("YES", "#f1e4e7", 0.3), decal("NO", "#2a2a2a", 0.6)];
      const stacks = piles.map(({ coins, size }, j) => {
        const face = faces[j];
        if (!face) throw new Error("coin stack without a face");
        return { coins, size, face };
      });

      key.position.set(-3, 7, 4);
      key.castShadow = true;
      scene.add(
        group,
        new T.HemisphereLight(0xffffff, 0x1a1a1a, 0.35 * Math.PI),
      );
      return { group, stacks, base: baseFace, yes };
    },
    frame({ group, stacks, base, yes }, f) {
      // Reduced motion draws one still frame, so every moving value rests.
      const t = f.reduced ? 0 : f.time;
      const built = Math.round(ease(f.progress) * COINS);
      for (const { coins, size, face } of stacks) {
        const shown = Math.min(size, built);
        coins.forEach((c, i) => {
          const on = i < shown;
          if (on && !c.mesh.visible) c.droppedAt = t;
          c.mesh.visible = on;
          // Fall for most of the drop, then one small bounce.
          const a =
            f.reduced || c.droppedAt === null
              ? 1
              : Math.min(1, (t - c.droppedAt) / 0.55);
          const lift =
            a < 0.72
              ? 1 - (a / 0.72) ** 2
              : Math.sin(((a - 0.72) / 0.28) * Math.PI) * 0.08;
          c.mesh.position.y = i * STACK_STEP + lift * 0.9;
        });
        const top = coins[shown - 1];
        face.visible = top !== undefined;
        if (top) {
          face.position.copy(top.mesh.position);
          face.position.y += COIN_H - 0.011;
        }
      }
      const pulse = f.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.5);
      const yesShown = Math.min(yesCount, built);
      base.emissiveIntensity =
        Math.min(1, yesShown / 6) * (0.45 + pulse * 0.45);
      yes.emissiveIntensity = 0.04 + pulse * 0.12;
      group.rotation.y = 0.3 + Math.sin(t * 0.25) * 0.12;
    },
  };
}
