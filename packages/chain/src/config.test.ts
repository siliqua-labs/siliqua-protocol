import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDecimals, chains, verifiedToken } from "./config.ts";

test("the testnet token is the one matched on the explorer", () => {
  assert.equal(
    verifiedToken("testnet"),
    "0x3A37C1D137e02e04E1CC1e4a7dB0B4628C762b4e",
  );
});

test("the mainnet token is the USDG contract read from the mainnet RPC", () => {
  assert.equal(
    verifiedToken("mainnet"),
    "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  );
});

test("decimals must match what was verified", () => {
  assertDecimals("testnet", 6);
  assert.throws(() => assertDecimals("testnet", 18), /expects 6/);
  assertDecimals("mainnet", 6);
  assert.throws(() => assertDecimals("mainnet", 18), /expects 6/);
});

test("chain ids are the ones from the official docs", () => {
  assert.equal(chains.mainnet.chainId.value, 4663);
  assert.equal(chains.testnet.chainId.value, 46630);
});
