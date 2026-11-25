import type { Narrative } from "./api/types";

// The api decides which narratives exist; OTHER is always listed last.
export function narrativeNames(bps: Record<Narrative, number>): Narrative[] {
  const names = Object.keys(bps).filter((n) => n !== "OTHER");
  return "OTHER" in bps ? [...names, "OTHER"] : names;
}
