"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./Reveal.module.css";

type Phase = "static" | "hidden" | "shown";

// Content is visible without JavaScript. After mount, sections below the fold
// are hidden and fade in as they scroll into view. Reduced motion skips it.
export function Reveal({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    setPhase("hidden");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase("shown");
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = [
    className,
    phase === "hidden" && styles.hidden,
    phase === "shown" && styles.shown,
    styles.reveal,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section ref={ref} id={id} className={cls}>
      {children}
    </section>
  );
}
