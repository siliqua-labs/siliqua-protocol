import assert from "node:assert/strict";
import { test } from "node:test";
import { changeBps, meanHalfUp, medianMicro, numericToMicro } from "./money.ts";
import {
  buildSeries,
  HOUR_MS,
  type HourRow,
  trend7d,
  twap24h,
} from "./series.ts";

const T0 = Date.UTC(2027, 0, 1);

function row(hourIndex: number, value: bigint | null): HourRow {
  return {
    hour: new Date(T0 + hourIndex * HOUR_MS),
    valueMicro: value,
    validSources: value === null ? 0 : 5,
    status: value === null ? "STALE" : "LIVE",
  };
}

test("numericToMicro parses text exactly", () => {
  assert.equal(numericToMicro("4.390000"), 4_390_000n);
  assert.equal(numericToMicro("0.000001"), 1n);
  assert.throws(() => numericToMicro("4.39"));
});

test("median and mean round half up", () => {
  assert.equal(medianMicro([1n, 2n]), 2n);
  assert.equal(medianMicro([3n, 1n, 2n]), 2n);
  assert.equal(meanHalfUp([1n, 2n]), 2n);
  assert.equal(meanHalfUp([1n, 1n, 2n]), 1n);
});

test("changeBps rounds half away from zero", () => {
  assert.equal(changeBps(1_100_000n, 1_000_000n), 1000);
  assert.equal(changeBps(900_000n, 1_000_000n), -1000);
  assert.equal(changeBps(20_001n, 20_000n), 1);
  assert.equal(changeBps(19_999n, 20_000n), -1);
  assert.equal(changeBps(20_000n, 20_000n), 0);
});

test("empty hours repeat the last value and are flagged stale", () => {
  const series = buildSeries([row(0, 100n), row(1, null), row(2, 120n)], null);
  assert.deepEqual(
    series.points.map((p) => [p.value, p.stale]),
    [
      [100n, false],
      [100n, true],
      [120n, false],
    ],
  );
});

test("hours before the first value are dropped", () => {
  const series = buildSeries([row(0, null), row(1, 7n)], null);
  assert.deepEqual(series.points, [{ value: 7n, stale: false }]);
});

test("twap skips stale hours and voids above 6 stale", () => {
  const live = Array.from({ length: 18 }, () => ({
    value: 100n,
    stale: false,
  }));
  const stale6 = Array.from({ length: 6 }, () => ({
    value: 100n,
    stale: true,
  }));
  assert.equal(twap24h([...live, ...stale6]), 100n);
  const live17 = live.slice(1);
  const stale7 = [...stale6, { value: 100n, stale: true }];
  assert.equal(twap24h([...live17, ...stale7]), null);
});

test("trend ends at the latest value and steps back 12 hours at a time", () => {
  const points = Array.from({ length: 30 }, (_, i) => ({
    value: BigInt(i),
    stale: false,
  }));
  assert.deepEqual(trend7d(points), ["5", "17", "29"]);
  const week = Array.from({ length: 200 }, (_, i) => ({
    value: BigInt(i),
    stale: false,
  }));
  const trend = trend7d(week);
  assert.equal(trend.length, 14);
  assert.equal(trend.at(-1), "199");
  assert.equal(trend[0], "43");
});
