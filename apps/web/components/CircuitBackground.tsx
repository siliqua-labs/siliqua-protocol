"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { at } from "../lib/at";
import { rng } from "../lib/rng";
import { type FxLevel, useAppState } from "./AppState";
import styles from "./CircuitBackground.module.css";

// Fixed backdrop: circuit traces on three depth layers, pulses that travel
// along them and light up their pads, a periodic print scan, and large beaded
// rings. Decorative only. It slows itself down on weak hardware and is a
// still frame under prefers-reduced-motion.

type Pt = [number, number];
type Trace = {
  p: Pt[];
  cum: number[];
  len: number;
  s: number;
  v: number;
  on: boolean;
  lit: number[];
};
type Layer = { z: number; f: number; traces: Trace[]; cv: HTMLCanvasElement };
type Dust = { x: number; y: number; z: number; p: number };

const LEVELS: Record<FxLevel, { n: number; a: number }> = {
  Subtle: { n: 6, a: 0.55 },
  Default: { n: 10, a: 0.8 },
  Bold: { n: 14, a: 1 },
};
const DEPTHS = [0.4, 0.7, 1];
const PARALLAX = [0.06, 0.14, 0.28];
const TRACE_COUNTS = [8, 6, 5];
const FULL_DPR = 1.5;

const gridSize = (z: number) => 80 * (0.6 + z * 0.4);

function makeGlow(): HTMLCanvasElement {
  const o = document.createElement("canvas");
  o.width = o.height = 64;
  const x = o.getContext("2d");
  if (!x) throw new Error("2d canvas context unavailable");
  const q = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  q.addColorStop(0, "rgba(255,175,110,1)");
  q.addColorStop(0.25, "rgba(240,122,62,.55)");
  q.addColorStop(1, "rgba(224,102,43,0)");
  x.fillStyle = q;
  x.fillRect(0, 0, 64, 64);
  return o;
}

function makeRings(): HTMLCanvasElement {
  const o = document.createElement("canvas");
  o.width = o.height = 1024;
  const x = o.getContext("2d");
  if (!x) throw new Error("2d canvas context unavailable");
  x.strokeStyle = "rgba(216,212,204,.5)";
  x.fillStyle = "rgba(216,212,204,.9)";
  for (const [radius, double] of [
    [470, 1],
    [400, 0],
    [330, 1],
    [250, 0],
  ] as const) {
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(512, 512, radius - 14, 0, 6.283);
    x.stroke();
    if (double) {
      x.beginPath();
      x.arc(512, 512, radius + 14, 0, 6.283);
      x.stroke();
    }
    const n = Math.round(radius * 0.45);
    for (let k = 0; k < n; k++) {
      x.beginPath();
      x.arc(
        512 + Math.cos((k / n) * 6.283) * radius,
        512 + Math.sin((k / n) * 6.283) * radius,
        double ? 4 : 3,
        0,
        6.283,
      );
      x.fill();
    }
  }
  return o;
}

function makeTrace(z: number, r: () => number, W: number, Hl: number): Trace {
  const gs = gridSize(z);
  let x = 0;
  let y = Math.round((r() * Hl) / gs) * gs;
  const p: Pt[] = [[x, y]];
  const stop = W * (0.55 + r() * 0.4);
  while (x < stop) {
    x += gs * (2 + Math.floor(r() * 4));
    p.push([x, y]);
    if (x >= stop) break;
    y = Math.max(
      0,
      Math.min(Hl, y + (r() < 0.5 ? -1 : 1) * gs * (1 + Math.floor(r() * 3))),
    );
    p.push([x, y]);
  }
  const cum = [0];
  let len = 0;
  for (let i = 1; i < p.length; i++) {
    const a = at(p, i);
    const b = at(p, i - 1);
    len += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    cum.push(len);
  }
  return {
    p,
    cum,
    len,
    s: r() * len,
    v: 50 + r() * 50,
    on: false,
    lit: p.map(() => 0),
  };
}

function pointAt(t: Trace, s: number): Pt {
  let i = 1;
  while (i < t.cum.length - 1 && at(t.cum, i) < s) i++;
  const c0 = at(t.cum, i - 1);
  const f = (s - c0) / (at(t.cum, i) - c0 || 1);
  const a = at(t.p, i - 1);
  const b = at(t.p, i);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export function CircuitBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const { fx } = useAppState();
  const onHome = useRef(true);
  onHome.current = pathname === "/";

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const level = LEVELS[fx];
    const A = level.a;
    let quality = 1;
    let r = rng(2026);
    let W = 0;
    let H = 0;
    let Hl = 0;
    let layers: Layer[] = [];
    let dust: Dust[] = [];
    let glow = makeGlow();
    let rings = makeRings();
    let raf = 0;
    let last = 0;
    let scrollSeen = 0;
    let boost = 0;
    let scanStart = -1e9;
    let scanX = -1e3;
    let nextScan = 600;
    let frames = 0;
    let frameTime = 0;
    let tuned = false;
    let mobile = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const preset = () => {
      for (const l of layers) {
        l.traces.forEach((t, j) => {
          t.on = j % 2 === 0;
          t.s = t.len * (0.35 + 0.4 * r());
          t.lit = t.lit.map((_, m) => (m % 3 === 0 ? 0.8 : 0));
        });
      }
    };

    const init = () => {
      r = rng(2026);
      mobile = window.innerWidth < 700;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        mobile ? 1.5 * quality : FULL_DPR * quality,
      );
      W = window.innerWidth;
      H = window.innerHeight;
      Hl = H * 1.5;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      glow = makeGlow();
      rings = makeRings();
      layers = DEPTHS.map((z, li) => {
        const count = Math.round(at(TRACE_COUNTS, li) * (mobile ? 0.5 : 1));
        const traces = Array.from({ length: count }, () =>
          makeTrace(z, r, W, Hl),
        );
        const cv = document.createElement("canvas");
        cv.width = W * dpr;
        cv.height = Hl * dpr;
        const x = cv.getContext("2d");
        if (!x) throw new Error("2d canvas context unavailable");
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const t of traces) {
          x.strokeStyle = `rgba(216,212,204,${(0.07 + 0.14 * z) * A})`;
          x.lineWidth = 0.8 + z;
          x.beginPath();
          t.p.forEach((q, k) => {
            if (k) x.lineTo(q[0], q[1]);
            else x.moveTo(q[0], q[1]);
          });
          x.stroke();
          x.strokeStyle = `rgba(224,102,43,${(0.25 + 0.35 * z) * A})`;
          t.p.forEach((q, k) => {
            const s = (k === t.p.length - 1 ? 9 : 5) * (0.6 + z * 0.4);
            x.strokeRect(q[0] - s / 2, q[1] - s / 2, s, s);
          });
        }
        return { z, f: at(PARALLAX, li), traces, cv };
      });
      const total = Math.round(level.n * quality * (mobile ? 0.45 : 1));
      const all = layers.flatMap((l) => l.traces);
      const every = Math.max(1, Math.round(all.length / total));
      all.forEach((t, i) => {
        t.on = total > 0 && i % every === 0;
      });
      dust = Array.from(
        { length: Math.round((mobile ? 30 : 70) * quality) },
        () => ({
          x: r() * W,
          y: r() * H,
          z: 0.3 + r() * 0.7,
          p: r() * 6.28,
        }),
      );
      if (reduced) preset();
    };

    const draw = (t: number) => {
      raf = 0;
      const dt = Math.min(3, (t - last) / 16.7 || 1);
      if (!reduced && last) {
        frames++;
        frameTime += t - last;
      }
      last = t;
      const sy = window.scrollY;
      const speed = Math.abs(sy - scrollSeen) / dt;
      scrollSeen = sy;
      boost = boost * 0.93 + Math.min(1, speed * 0.04) * 0.07;
      const sp = 1 + boost * 1.5;
      const al = A * (1 + boost * 0.4);
      if (!reduced && !tuned && frames === 60) {
        tuned = true;
        if (frameTime / 60 > 22) {
          quality = 0.55;
          init();
        }
      }
      g.clearRect(0, 0, W, H);

      const fade = Math.max(0, 1 - sy / (H * 1.1));
      const ra = (onHome.current ? 1 : 0.35) * fade * (0.35 + 0.45 * A);
      if (ra > 0.01) {
        g.save();
        g.globalAlpha = ra * 0.55;
        g.translate(W * 0.82, H * 0.42 - sy * 0.35);
        const rs = (Math.max(W, H) * 0.78) / 512;
        g.scale(rs, rs);
        g.rotate(reduced ? 0.4 : (t / 1000) * 0.03);
        g.drawImage(rings, -512, -512);
        g.restore();
      }

      if (!reduced && t > nextScan) {
        scanStart = t;
        nextScan = t + 9000;
      }
      const prevScan = scanX;
      scanX = reduced ? -1e3 : ((t - scanStart) / 1600) * (W + 260) - 130;
      if (scanX > W + 130) scanX = -1e3;

      for (const d of dust) {
        if (!reduced) {
          d.y -= 0.14 * d.z * dt;
          d.p += 0.01 * dt;
        }
        if (d.y < -4) d.y = H + 4;
        const yy = (((d.y - sy * d.z * 0.12) % H) + H) % H;
        g.fillStyle = `rgba(216,212,204,${(0.1 + d.z * 0.2) * A})`;
        g.beginPath();
        g.arc(d.x + Math.sin(d.p) * 6, yy, 0.6 + d.z * 1.1, 0, 6.283);
        g.fill();
      }

      for (const l of layers) {
        const offset = -((sy * l.f) % Hl);
        for (let k = 0; k < 2; k++) {
          const Y = offset + k * Hl;
          g.drawImage(l.cv, 0, Y, W, Hl);
          for (const tr of l.traces) {
            tr.p.forEach((q, m) => {
              if (k === 0 && scanX > -900 && prevScan < q[0] && scanX >= q[0])
                tr.lit[m] = 1;
              const lit = tr.lit[m] ?? 0;
              if (lit > 0.02) {
                g.globalAlpha = Math.min(1, lit * al * l.z);
                g.drawImage(glow, q[0] - 14, q[1] + Y - 14, 28, 28);
                g.globalAlpha = 1;
              }
            });
            if (tr.on) {
              const tail = 90 + 120 * l.z;
              const N = 16;
              g.lineWidth = 1 + l.z;
              g.lineCap = "round";
              for (let m = 0; m < N; m++) {
                const a1 = pointAt(tr, Math.max(0, tr.s - (m * tail) / N));
                const a2 = pointAt(
                  tr,
                  Math.max(0, tr.s - ((m + 1) * tail) / N),
                );
                g.strokeStyle = `rgba(240,122,62,${(1 - m / N) * 0.7 * al * l.z})`;
                g.beginPath();
                g.moveTo(a1[0], a1[1] + Y);
                g.lineTo(a2[0], a2[1] + Y);
                g.stroke();
              }
              const head = pointAt(tr, tr.s);
              const size = 24 * (0.6 + l.z);
              g.globalAlpha = Math.min(1, al * (0.5 + 0.5 * l.z));
              g.drawImage(
                glow,
                head[0] - size / 2,
                head[1] + Y - size / 2,
                size,
                size,
              );
              g.globalAlpha = 1;
            }
          }
          g.globalAlpha = 1;
        }
        for (const tr of l.traces) {
          if (tr.on && !reduced) {
            const before = tr.s;
            tr.s += tr.v * dt * sp * 0.3 * l.z + tr.v * dt * 0.1;
            if (tr.s > tr.len + 120) {
              tr.s = 0;
              tr.lit = tr.lit.map(() => 0);
            }
            tr.cum.forEach((c, m) => {
              if (before < c && tr.s >= c) tr.lit[m] = 1;
            });
          }
          if (!reduced) tr.lit = tr.lit.map((v) => v * 0.97 ** dt);
        }
      }

      if (scanX > -900) {
        const gr = g.createLinearGradient(scanX - 160, 0, scanX, 0);
        gr.addColorStop(0, "rgba(224,102,43,0)");
        gr.addColorStop(1, `rgba(240,122,62,${0.28 * A})`);
        g.fillStyle = gr;
        g.fillRect(scanX - 160, 0, 160, H);
        g.fillStyle = `rgba(255,175,110,${0.55 * A})`;
        g.fillRect(scanX - 1, 0, 1.5, H);
      }
      g.globalAlpha = 1;
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        cancelAnimationFrame(raf);
        init();
        raf = requestAnimationFrame(draw);
      }, 150);
    };
    const onVisible = () => {
      if (!document.hidden && !raf && !reduced)
        raf = requestAnimationFrame(draw);
    };

    init();
    draw(0);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(resizeTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fx]);

  return <canvas ref={ref} className={styles.bg} />;
}
