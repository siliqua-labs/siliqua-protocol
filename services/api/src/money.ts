// Money is integer micro-USD (bigint). No float touches a price.

export function numericToMicro(value: string): bigint {
  const match = /^(\d+)\.(\d{6})$/.exec(value);
  if (!match) {
    throw new Error(
      `expected numeric(18,6) text, got ${JSON.stringify(value)}`,
    );
  }
  return BigInt(`${match[1]}${match[2]}`);
}

export function medianMicro(values: bigint[]): bigint {
  if (values.length === 0) throw new Error("median of an empty list");
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = sorted.length >> 1;
  const upper = sorted[middle] as bigint;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] as bigint) + upper + 1n) / 2n;
}

export function meanHalfUp(values: bigint[]): bigint {
  if (values.length === 0) throw new Error("mean of an empty list");
  const count = BigInt(values.length);
  const sum = values.reduce((total, value) => total + value, 0n);
  return (2n * sum + count) / (2n * count);
}

// Change in basis points, rounded half away from zero.
export function changeBps(latest: bigint, earlier: bigint): number {
  if (earlier <= 0n)
    throw new Error(`earlier value must be positive, got ${earlier}`);
  const scaled = (latest - earlier) * 10_000n;
  const sign = scaled < 0n ? -1n : 1n;
  const magnitude = scaled * sign;
  return Number(sign * ((2n * magnitude + earlier) / (2n * earlier)));
}

export function isoSeconds(moment: Date): string {
  return `${moment.toISOString().slice(0, 19)}Z`;
}
