"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { mountScene } from "./mount";
import { coinScene, poolsScene, stackScene } from "./scenes";

type Props = {
  kind: "coin" | "stack" | "pools";
  // Share of the YES pool, 0 to 1. Only used by "pools".
  yesShare?: number;
  label: string;
  className?: string;
  // Shown only if the scene fails to start (for example no WebGL), never while loading.
  fallback?: ReactNode;
};

// three.js is imported on first approach to the viewport, so pages that never
// scroll to a scene never download it.
export function ThreeScene({
  kind,
  yesShare = 0.5,
  label,
  className,
  fallback,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const mounted =
          kind === "coin"
            ? mountScene(el, coinScene)
            : kind === "stack"
              ? mountScene(el, stackScene)
              : mountScene(el, poolsScene(yesShare));
        mounted.then(
          (cleanup) => {
            if (cancelled) return cleanup();
            stop = cleanup;
          },
          (err) => {
            console.error(`3D scene "${kind}" failed, showing fallback`, err);
            if (!cancelled) setFailed(true);
          },
        );
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      stop?.();
      setFailed(false);
    };
  }, [kind, yesShare]);

  return (
    <div ref={ref} className={className} role="img" aria-label={label}>
      {failed ? fallback : null}
    </div>
  );
}
