import assert from "node:assert/strict";
import { test } from "node:test";
import { chainLabel } from "./chainLabel.ts";

test("testnet by default and when set", () => {
  assert.equal(chainLabel({}), "46630 · Robinhood Chain Testnet");
  assert.equal(
    chainLabel({ CHAIN_ENV: "testnet" }),
    "46630 · Robinhood Chain Testnet",
  );
});

test("the mainnet name follows CHAIN_ENV", () => {
  assert.equal(chainLabel({ CHAIN_ENV: "mainnet" }), "4663 · Robinhood Chain");
});

test("an unknown value shows nothing", () => {
  assert.equal(chainLabel({ CHAIN_ENV: "devnet" }), null);
});
