import assert from "node:assert/strict";
import { test } from "node:test";
import { type ApiMarket, toMarket, wholeTokens } from "./marketMapping.ts";

const base: ApiMarket = {
  address: `0x${"22".repeat(20)}`,
  indexLabel: "GRI-H100",
  thresholdMicroUsd: "3500000",
  closeTime: "2026-11-25T00:00:00Z",
  twapFrom: "2026-11-26T00:00:00Z",
  twapTo: "2026-11-27T00:00:00Z",
  settleableFrom: "2026-11-27T03:00:00Z",
  feeBps: 200,
  betCap: "1000000000",
  yesPool: "2500000",
  noPool: "7500000",
  status: "open",
  yesWins: null,
};
const NOW = new Date("2026-11-24T12:00:00Z");

test("wholeTokens scales by the token decimals and rounds down", () => {
  assert.equal(wholeTokens("1999999", 6), "1");
  assert.equal(wholeTokens("2000000", 6), "2");
  assert.equal(wholeTokens("5", 18), "0");
});

test("an open market is active with pools in whole tokens", () => {
  const m = toMarket(base, 6, NOW);
  assert.equal(m.status, "OPEN");
  assert.equal(m.group, "active");
  assert.equal(m.yesPool, "2");
  assert.equal(m.noPool, "7");
  assert.equal(m.winner, undefined);
  assert.equal(m.indexLabel, "GRI-H100");
});

test("a closed market becomes settling once its settle time passed", () => {
  const closed = { ...base, status: "closed" as const };
  assert.equal(toMarket(closed, 6, NOW).status, "CLOSED");
  assert.equal(
    toMarket(closed, 6, new Date("2026-11-27T03:00:00Z")).status,
    "SETTLING",
  );
});

test("a settled market names its winner, a void one has none", () => {
  const yes = toMarket({ ...base, status: "settled", yesWins: true }, 6, NOW);
  assert.equal(yes.group, "settled");
  assert.equal(yes.winner, "YES");
  const no = toMarket({ ...base, status: "settled", yesWins: false }, 6, NOW);
  assert.equal(no.winner, "NO");
  const voided = toMarket({ ...base, status: "void" }, 6, NOW);
  assert.equal(voided.group, "void");
  assert.equal(voided.winner, undefined);
});
