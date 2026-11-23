"use client";

import { useState } from "react";
import ui from "./ui.module.css";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.small}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch (err) {
          console.error("clipboard write failed", err);
          setState("failed");
        }
      }}
    >
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed. Select the text."
          : "Copy"}
    </button>
  );
}
