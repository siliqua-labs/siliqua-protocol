const MICRO = 1_000_000n;

// Round half up from micro-USD to `decimals` places (0-6), in bigint.
export const NOT_AVAILABLE = "n/a";

export function formatUsd(microUsd: string | null, decimals = 2): string {
  if (microUsd === null) return NOT_AVAILABLE;
  const step = 10n ** BigInt(6 - decimals);
  const units = (BigInt(microUsd) + step / 2n) / step;
  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  if (decimals === 0) return `$${whole}`;
  return `$${whole}.${(units % scale).toString().padStart(decimals, "0")}`;
}

// Raw micro-USD as a 6-decimal string, as the API publishes it.
export function formatMicro(microUsd: string | null): string {
  if (microUsd === null) return NOT_AVAILABLE;
  const v = BigInt(microUsd);
  return `${v / MICRO}.${(v % MICRO).toString().padStart(6, "0")}`;
}

// Change is stored in basis points; shown with one decimal, truncated.
export function formatChange(bps: number | null): string {
  if (bps === null) return NOT_AVAILABLE;
  if (bps === 0) return "0.0%";
  const abs = Math.abs(bps);
  const text = `${Math.floor(abs / 100)}.${Math.floor((abs % 100) / 10)}%`;
  return `${bps > 0 ? "▲ +" : "▼ "}${text}`;
}

export function formatBpsPercent(bps: number): string {
  return `${Math.floor(bps / 100)}.${String(bps % 100).padStart(2, "0")}%`;
}

export function formatUtc(iso: string | null): string {
  if (iso === null) return NOT_AVAILABLE;
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

export function formatInt(n: number | string): string {
  return BigInt(n).toLocaleString("en-US");
}

export function changeTone(bps: number | null): "up" | "dn" | "" {
  if (bps === null) return "";
  return bps > 0 ? "up" : bps < 0 ? "dn" : "";
}

// Whole-token amount ("100", "12.5") to hundredths of a token. Null when invalid.
export function parseCents(input: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  return BigInt(m[1] ?? "0") * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
}

export function formatCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}
