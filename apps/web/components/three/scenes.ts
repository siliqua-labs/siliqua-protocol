import type * as THREE from "three";
import { rng } from "../../lib/rng";
import { ease, type SceneDef, type Three, type Track } from "./mount";

// Procedural art, drawn once into canvases. No external image assets.
// Palette: white satin panels, ink, one burgundy accent.
const BURGUNDY = "#6D001A";
const INK = "#0A0A0A";
const CHAMPAGNE = "#C9A66B";
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
  wine = false,
): HTMLCanvasElement {
  const inv = dark || wine;
  const accent = wine ? CHAMPAGNE : BURGUNDY;
  const [c, x] = canvas2d(w, h);
  const r = rng(seed);
  const s = Math.max(9, w / 100);
  const bg = x.createLinearGradient(0, 0, w, h);
  if (wine) {
    bg.addColorStop(0, "#7d0c2a");
    bg.addColorStop(0.55, "#4a0618");
    bg.addColorStop(1, "#2a0009");
  } else if (dark) {
    bg.addColorStop(0, "#221a1d");
    bg.addColorStop(1, "#080506");
  } else {
    bg.addColorStop(0, "#fdf1f4");
    bg.addColorStop(0.5, "#f1cfd7");
    bg.addColorStop(1, "#f9e4e9");
  }
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  const ink = inv ? "rgba(255,255,255,.8)" : "rgba(10,10,10,.72)";
  const dim = inv ? "rgba(255,255,255,.28)" : "rgba(10,10,10,.22)";
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
      x.fillStyle = inv ? "#fff" : INK;
      x.fillRect(px, py - s * 0.8, tw, s * 1.6);
      x.fillStyle = inv ? INK : "#fff";
      x.fillText(label, px + s * 0.5, py);
    } else if (kind === 2) {
      const pw = s * 3.2;
      x.strokeStyle = dim;
      x.strokeRect(px, py - s * 0.7, pw, s * 1.4);
      x.fillStyle = r() < 0.5 ? accent : ink;
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
      x.fillStyle = accent;
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
      x.fillStyle = accent;
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
const TERRAIN_PX = 1024;

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
  // Slope differences shrink with resolution, so the relief gain scales with it.
  const relief = (size / 640) * 9;
  for (let j = 1; j < size - 1; j++)
    for (let k = 1; k < size - 1; k++) {
      const i = j * size + k;
      const h = H[i] ?? 0;
      const t = Math.max(0, Math.min(1, (h - 0.25) / 0.5)) ** 1.3;
      let shade = Math.max(
        0.45,
        Math.min(
          1.3,
          1 +
            ((H[i - 1] ?? 0) -
              (H[i + 1] ?? 0) +
              (H[i - size] ?? 0) -
              (H[i + size] ?? 0)) *
              relief,
        ),
      );
      if ((h * 18) % 1 < 0.07) shade *= 0.32;
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
  const S = TERRAIN_PX;
  const [c, x] = canvas2d(S);
  x.drawImage(terrainTexture(S), 0, 0);
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
  g.addColorStop(1, "rgba(30,0,8,.6)");
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
  // Bright red grit; the bump map turns it into the sparkle seen in the reference.
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(255,${30 + r() * 60},${50 + r() * 60},${0.2 + r() * 0.4})`;
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

// Large enough that the blur fades out before the edge; a tight canvas leaves a visible square.
const SHADOW_PX = 896;

// Soft contact shadow, drawn offscreen so only the blur lands on the canvas.
function shadowTexture(poly: Pt[]): HTMLCanvasElement {
  const [c, x] = canvas2d(SHADOW_PX);
  x.shadowColor = "rgba(45,0,14,.55)";
  x.shadowBlur = 34;
  x.shadowOffsetX = 1000;
  x.translate(-1000, 0);
  x.fillStyle = "#000";
  x.beginPath();
  poly.forEach(([px, py], i) => {
    const X = SHADOW_PX / 2 + px * 52;
    const Y = SHADOW_PX / 2 - py * 52;
    if (i) x.lineTo(X, Y);
    else x.moveTo(X, Y);
  });
  x.fill();
  return c;
}

// Slanted white label with a headline and four readout bars, like a HUD callout.
function tagTexture(): HTMLCanvasElement {
  const [c, x] = canvas2d(1024, 512);
  x.shadowColor = "rgba(40,0,12,.35)";
  x.shadowBlur = 24;
  x.shadowOffsetY = 10;
  x.fillStyle = "#fff";
  x.beginPath();
  x.moveTo(60, 40);
  x.lineTo(990, 40);
  x.lineTo(940, 190);
  x.lineTo(20, 190);
  x.closePath();
  x.fill();
  const rows = ["VALUE", "24H", "7D", "VALID."];
  rows.forEach((_, i) => {
    const y = 215 + i * 62;
    const w = 760 - i * 70;
    x.beginPath();
    x.moveTo(60 + i * 22, y);
    x.lineTo(60 + i * 22 + w, y);
    x.lineTo(60 + i * 22 + w - 36, y + 48);
    x.lineTo(24 + i * 22, y + 48);
    x.closePath();
    x.fillStyle = "#f4f1f1";
    x.fill();
  });
  x.shadowColor = "transparent";
  x.fillStyle = INK;
  x.font = "800 96px sans-serif";
  x.textBaseline = "middle";
  x.fillText("GRI-H100", 110, 118);
  x.fillStyle = BURGUNDY;
  x.fillRect(930, 56, 12, 12);
  x.font = "500 24px monospace";
  rows.forEach((label, i) => {
    x.fillStyle = INK;
    x.fillText(label, 70 + i * 22, 240 + i * 62);
    x.fillStyle = BURGUNDY;
    x.fillRect(260 + i * 22, 232 + i * 62, 240 - i * 38, 12);
  });
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
      color,
      metalness: 0.05,
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.85,
      ...extra,
    }),
  );
}

function texture(T: Three, track: Track, c: HTMLCanvasElement) {
  const t = track(new T.CanvasTexture(c));
  t.anisotropy = 8;
  return t;
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
  look: { x: number; y: number };
};

type Tone = "pearl" | "dark" | "wine";

// Hero: layered satin panels tilting as one body toward the pointer, with a
// slow idle sway and a spinning bezel.
export const coinScene: SceneDef<CoinState> = {
  aspect: 1,
  camera: { position: [0, 0, 15.5] },
  build(T, scene, track) {
    const group = new T.Group();
    const add = <O extends THREE.Object3D>(obj: O) => {
      group.add(obj);
      return obj;
    };
    const edges: Record<Tone, THREE.Material> = {
      pearl: lacquer(T, track, 0xd9d2cf, { roughness: 0.4, clearcoat: 0.5 }),
      dark: lacquer(T, track, 0x120a0d, { roughness: 0.4, metalness: 0.35 }),
      wine: lacquer(T, track, 0x3a0610, {
        roughness: 0.3,
        metalness: 0.45,
        clearcoat: 0.8,
      }),
    };
    const panel = (
      geo: THREE.BufferGeometry,
      map: HTMLCanvasElement,
      z: number,
      tone: Tone = "pearl",
      extra: THREE.MeshPhysicalMaterialParameters = {},
    ) => {
      const face = lacquer(T, track, 0xffffff, {
        map: texture(T, track, map),
        ...extra,
      });
      const mesh = new T.Mesh(geo, [face, edges[tone]]);
      mesh.position.z = z;
      return add(mesh);
    };
    // Wide soft shadow under each layer so the stack reads as separate plates.
    // It floats with less parallax than its panel, so it separates as you move.
    const shadow = (
      pts: Pt[],
      z: number,
      ox: number,
      oy: number,
      scale: number,
    ) => {
      const mat = track(
        new T.MeshBasicMaterial({
          map: texture(T, track, shadowTexture(pts)),
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        }),
      );
      const size = (SHADOW_PX / 52) * scale;
      const mesh = new T.Mesh(track(new T.PlaneGeometry(size, size)), mat);
      mesh.position.set(ox, oy, z);
      add(mesh);
    };
    const overlay = (map: HTMLCanvasElement, z: number) => {
      const mat = track(
        new T.MeshBasicMaterial({
          map: texture(T, track, map),
          transparent: true,
          depthWrite: false,
        }),
      );
      const mesh = new T.Mesh(track(new T.PlaneGeometry(4.9, 4.9)), mat);
      mesh.position.z = z;
      return add(mesh);
    };

    shadow(BASE, -1.2, 0.25, -0.45, 1.35);
    panel(
      polyGeometry(T, track, BASE, 0.14),
      detailTexture(1536, 1536, 11, false, false),
      -0.6,
    );
    panel(
      polyGeometry(T, track, LEFT, 0.12),
      detailTexture(512, 1024, 21, true, true),
      0.05,
      "dark",
    );
    panel(
      polyGeometry(T, track, TOP, 0.1),
      detailTexture(1024, 256, 31, true, true),
      -0.1,
      "dark",
    );
    panel(
      polyGeometry(T, track, BOTTOM, 0.1),
      detailTexture(1024, 256, 41, true, true),
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
      "pearl",
      {
        color: 0xc9bfc2,
        roughness: 0.5,
        clearcoat: 0.25,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.55,
      },
    );
    const terrainFaceMat = (
      terrain.material as THREE.MeshPhysicalMaterial[]
    )[0];
    if (terrainFaceMat) {
      terrainFaceMat.bumpMap = terrainFaceMat.map;
      terrainFaceMat.bumpScale = 2.2;
    }
    overlay(ringTicks(), 0.34);
    const tagMat = track(
      new T.MeshBasicMaterial({
        map: texture(T, track, tagTexture()),
        transparent: true,
        depthWrite: false,
      }),
    );
    const tag = new T.Mesh(track(new T.PlaneGeometry(5.2, 2.6)), tagMat);
    tag.position.set(2.85, 0.35, 0.75);
    add(tag);
    const bezel = overlay(bezelArcs(), 0.4);
    scene.add(group);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a0008, 0.5 * Math.PI));
    return { group, bezel, look: { x: 0, y: 0 } };
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
  },
};

// Four hex plates that separate as the section scrolls into view: sources,
// operators, oracle, markets.
export const stackScene: SceneDef<{
  group: THREE.Group;
  plates: THREE.Group[];
  beam: THREE.MeshBasicMaterial;
}> = {
  aspect: 1.15,
  camera: { position: [0, 0, 9] },
  build(T, scene, track) {
    const group = new T.Group();
    const geo = hexGeometry(T, track, 1.62, 0.12, 0.014);
    const edge = lacquer(T, track, 0x0a0a0a, {
      metalness: 0.35,
      roughness: 0.4,
    });
    const plates = [0, 1, 2, 3].map((i) => {
      const face = lacquer(T, track, 0xffffff, {
        map: texture(T, track, layerTexture(i)),
        roughness: 0.45,
      });
      const mesh = new T.Mesh(geo, [face, edge]);
      mesh.rotation.x = -Math.PI / 2;
      const holder = new T.Group();
      holder.add(mesh);
      group.add(holder);
      return holder;
    });
    const beam = track(
      new T.MeshBasicMaterial({
        color: 0x6d001a,
        transparent: true,
        opacity: 0,
      }),
    );
    group.add(
      new T.Mesh(track(new T.CylinderGeometry(0.02, 0.02, 6.6, 8)), beam),
    );
    group.rotation.x = 0.55;
    scene.add(group);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a0008, 0.55 * Math.PI));
    return { group, plates, beam };
  },
  frame({ group, plates, beam }, f) {
    const e = ease(f.progress);
    plates.forEach((p, i) => {
      p.position.y = (1.5 - i) * (0.3 + e * 1.05);
      p.rotation.y = f.reduced ? 0.3 : Math.sin(f.time * 0.5 + i * 0.8) * 0.4;
    });
    beam.opacity = e * 0.85;
    group.rotation.y = f.reduced ? 0 : Math.sin(f.time * 0.4) * 0.18;
  },
};

// Two hex-coin piles sized to the YES (burgundy) and NO (white) pools on a
// textured hex base; they build up on scroll.
export function poolsScene(
  yesShare: number,
): SceneDef<{ piles: [THREE.Mesh, THREE.Mesh][]; yesCount: number }> {
  const total = 20;
  const yesCount = Math.round(yesShare * total);
  return {
    aspect: 0.75,
    camera: { position: [0, 2.4, 9.5], lookAt: [0, 0.9, 0] },
    build(T, scene, track) {
      const geo = hexGeometry(T, track, 0.95, 0.06, 0.012);
      const edge = lacquer(T, track, 0x0a0a0a, {
        metalness: 0.3,
        roughness: 0.4,
      });
      const yes = lacquer(T, track, 0x6d001a, {
        roughness: 0.38,
        metalness: 0.25,
      });
      const no = lacquer(T, track, 0xf3f0f0, { roughness: 0.4 });
      const base = new T.Mesh(hexGeometry(T, track, 3.2, 0.08, 0.02), [
        lacquer(T, track, 0xffffff, {
          map: texture(T, track, detailTexture(1024, 1024, 77, false, true)),
        }),
        edge,
      ]);
      base.rotation.x = -Math.PI / 2;
      base.position.y = -0.14;
      scene.add(base);
      const piles = Array.from(
        { length: total },
        (_, i): [THREE.Mesh, THREE.Mesh] => {
          const a = new T.Mesh(geo, [yes, edge]);
          const b = new T.Mesh(geo, [no, edge]);
          for (const m of [a, b]) {
            m.rotation.order = "YXZ";
            m.rotation.x = -Math.PI / 2;
          }
          a.position.set(-1.35, i * 0.15, 0);
          b.position.set(1.35, i * 0.15, 0);
          a.visible = b.visible = false;
          scene.add(a, b);
          return [a, b];
        },
      );
      scene.add(new T.HemisphereLight(0xffffff, 0x2a0008, 0.55 * Math.PI));
      return { piles, yesCount };
    },
    frame({ piles, yesCount: n }, f) {
      const built = Math.round(ease(f.progress) * total);
      piles.forEach(([a, b], i) => {
        a.visible = i < Math.min(n, built);
        b.visible = i < Math.min(total - n, built);
        a.rotation.y = b.rotation.y = f.reduced ? 0.3 : f.time * 0.3 + i * 0.2;
      });
    },
  };
}
