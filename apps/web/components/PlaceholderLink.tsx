"use client";

import type { ReactNode } from "react";
import { useAppState } from "./AppState";

// Social profiles do not exist yet; the link says so instead of going nowhere.
export function PlaceholderLink({ children }: { children: ReactNode }) {
  const { toast } = useAppState();
  return (
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault();
        toast("Placeholder link");
      }}
    >
      {children}
    </a>
  );
}
