import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeRevert,
  estimatePayout,
  formatUnitsText,
  parseStake,
  remainingCap,
} from "./tradeMath.ts";

test("parseStake accepts exact decimals and rejects the rest", () => {
  assert.equal(parseStake("12.5", 6), 12_500_000n);
  assert.equal(parseStake(" 3 ", 6), 3_000_000n);
  assert.equal(parseStake("0.000001", 6), 1n);
  assert.equal(parseStake("0.0000001", 6), null);
  assert.equal(parseStake("0", 6), null);
  assert.equal(parseStake("-1", 6), null);
  assert.equal(parseStake("1e3", 6), null);
  assert.equal(parseStake("", 6), null);
});

test("estimatePayout matches the contract formula", () => {
  // Winners 100 (we add 100 -> 200), losers 100, fee 2% -> pool 298; our half is 149.
  assert.equal(estimatePayout(100n, 100n, 100n, 200), 149n);
  // Nobody on the other side: stake back, no fee.
  assert.equal(estimatePayout(100n, 0n, 0n, 200), 100n);
  // Rounds down.
  assert.equal(estimatePayout(1n, 2n, 1n, 0), 1n);
});

test("remainingCap counts both sides and never goes negative", () => {
  assert.equal(remainingCap(1000n, 300n, 200n), 500n);
  assert.equal(remainingCap(1000n, 600n, 400n), 0n);
  assert.equal(remainingCap(1000n, 900n, 400n), 0n);
});

test("formatUnitsText trims trailing zeros", () => {
  assert.equal(formatUnitsText(12_500_000n, 6), "12.5");
  assert.equal(formatUnitsText(3_000_000n, 6), "3");
  assert.equal(formatUnitsText(1n, 6), "0.000001");
});

test("known reverts have a message, unknown ones do not", () => {
  assert.match(describeRevert("CapExceeded") ?? "", /cap/);
  assert.equal(describeRevert("Whatever"), null);
  assert.equal(describeRevert(undefined), null);
});
