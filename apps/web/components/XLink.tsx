"use client";

import { useAppState } from "./AppState";
import styles from "./XLink.module.css";

// The profile URL is public. NEXT_PUBLIC_X_URL overrides it, for example on a preview deployment.
const X_URL = process.env.NEXT_PUBLIC_X_URL ?? "https://x.com/SiliquaCompute";

export function XLink({ className }: { className?: string }) {
  const { toast } = useAppState();
  const cls = `${styles.x} ${className ?? ""}`;
  const glyph = (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
  if (X_URL) {
    return (
      <a
        href={X_URL}
        className={cls}
        aria-label="Siliqua on X"
        target="_blank"
        rel="noopener noreferrer"
      >
        {glyph}
      </a>
    );
  }
  return (
    <a
      href="/"
      className={cls}
      aria-label="Siliqua on X (placeholder)"
      onClick={(e) => {
        e.preventDefault();
        toast("Placeholder link");
      }}
    >
      {glyph}
    </a>
  );
}
