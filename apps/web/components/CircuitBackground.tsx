"use client";

import { useEffect, useRef } from "react";
import { rng } from "../lib/rng";
import { type FxLevel, useAppState } from "./AppState";
import styles from "./CircuitBackground.module.css";

// Fixed backdrop: white base, a soft burgundy veil, three satin waves and
// drifting dust. Decorative only. It is a still frame under
// prefers-reduced-motion.

const LEVELS: Record<FxLevel, { dust: number; a: number }> = {
  Subtle: { dust: 12, a: 0.6 },
  Default: { dust: 17, a: 0.85 },
  Bold: { dust: 22, a: 1 },
};

type Mote = {
  x: number;
  y: number;
  s: number;
  v: number;
  a: number;
  o: number;
};

export function CircuitBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { fx } = useAppState();

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const level = LEVELS[fx];
    let W = 0;
    let H = 0;
    let motes: Mote[] = [];
    let raf = 0;
    let last = 0;
    let mx = 0;
    let my = 0;
    let tx = 0;
    let ty = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const mobile = window.innerWidth < 700;
      const r = rng(7);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = mobile ? Math.round(level.dust * 0.4) : level.dust;
      motes = Array.from({ length: n }, () => ({
        x: r() * W,
        y: r() * H,
        s: 0.6 + r() * 1.5,
        v: 3 + r() * 8,
        a: r() * 6.28,
        o: 0.06 + r() * 0.18,
      }));
    };

    const wave = (
      t: number,
      y0: number,
      amp: number,
      phase: number,
      edge: string,
      mid: string,
      thick: number,
    ) => {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = (W * i) / 40;
        const y =
          y0 +
          Math.sin(i * 0.28 + t * 0.25 + phase) * amp +
          Math.sin(i * 0.11 - t * 0.18 + phase * 2) * amp * 0.8;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      for (let i = 40; i >= 0; i--) {
        const x = (W * i) / 40;
        g.lineTo(
          x,
          y0 +
            thick +
            Math.sin(i * 0.24 + t * 0.22 + phase + 0.6) * amp * 1.1 +
            Math.sin(i * 0.09 - t * 0.15 + phase) * amp * 0.7,
        );
      }
      g.closePath();
      const q = g.createLinearGradient(0, y0 - amp, 0, y0 + thick + amp);
      q.addColorStop(0, edge);
      q.addColorStop(0.5, mid);
      q.addColorStop(1, edge);
      g.fillStyle = q;
      g.fill();
    };

    const draw = (ts: number) => {
      raf = 0;
      const t = reduced ? 0 : ts / 1000;
      const dt = Math.min(0.05, (ts - last) / 1000 || 0);
      last = ts;
      tx += (mx - tx) * 0.05;
      ty += (my - ty) * 0.05;
      const A = level.a;

      g.fillStyle = "#FFFFFF";
      g.fillRect(0, 0, W, H);

      const gx = W * 0.72 - tx * 30;
      const gy = H * 0.4 - ty * 20;
      const veil = g.createRadialGradient(
        gx,
        gy,
        0,
        gx,
        gy,
        Math.max(W, H) * 0.45,
      );
      veil.addColorStop(0, `rgba(109,0,26,${0.08 * A})`);
      veil.addColorStop(1, "rgba(109,0,26,0)");
      g.fillStyle = veil;
      g.fillRect(0, 0, W, H);

      g.save();
      g.translate(tx * 14, ty * 10);
      wave(
        t,
        H * 0.16,
        H * 0.05,
        0,
        "rgba(240,240,240,0)",
        `rgba(238,238,238,${0.75 * A})`,
        H * 0.22,
      );
      wave(
        t,
        H * 0.48,
        H * 0.07,
        2,
        "rgba(109,0,26,0)",
        `rgba(109,0,26,${0.07 * A})`,
        H * 0.18,
      );
      wave(
        t,
        H * 0.72,
        H * 0.05,
        4.5,
        "rgba(240,240,240,0)",
        `rgba(232,232,232,${0.6 * A})`,
        H * 0.25,
      );
      g.restore();

      for (const p of motes) {
        p.y -= p.v * dt;
        p.x += Math.sin(t * 0.3 + p.a) * 0.15;
        if (p.y < -4) {
          p.y = H + 4;
          p.x = Math.random() * W;
        }
        g.fillStyle = `rgba(109,0,26,${p.o * A})`;
        g.beginPath();
        g.arc(p.x, p.y, p.s, 0, 6.283);
        g.fill();
      }
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const onPointer = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
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
    raf = requestAnimationFrame(draw);
    if (!reduced)
      window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(resizeTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fx]);

  return <canvas ref={ref} className={styles.bg} />;
}
