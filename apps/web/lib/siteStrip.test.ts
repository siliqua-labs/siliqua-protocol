import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_STRIP, siteStrip, TESTNET_STRIP } from "./siteStrip.ts";

const live = {
  API_BASE_URL: "https://api.example",
  CHAIN_ENV: "testnet",
  RPC_URL: "https://rpc.example",
  FACTORY_ADDRESS: "0xcfEe04038808EbC3EcB67a6350D909198C6D37B0",
};

test("sample strip without an api or without the chain variables", () => {
  assert.equal(siteStrip({}), SAMPLE_STRIP);
  assert.equal(siteStrip({ ...live, API_BASE_URL: undefined }), SAMPLE_STRIP);
  assert.equal(siteStrip({ ...live, FACTORY_ADDRESS: "" }), SAMPLE_STRIP);
  assert.equal(siteStrip({ ...live, RPC_URL: undefined }), SAMPLE_STRIP);
  assert.equal(siteStrip({ ...live, CHAIN_ENV: undefined }), SAMPLE_STRIP);
});

test("testnet strip when markets are live on the testnet", () => {
  assert.equal(siteStrip(live), TESTNET_STRIP);
});

test("no strip on mainnet until its wording is decided", () => {
  assert.equal(siteStrip({ ...live, CHAIN_ENV: "mainnet" }), null);
});

test("an unknown chain env claims nothing live and does not throw", () => {
  assert.equal(siteStrip({ ...live, CHAIN_ENV: "devnet" }), SAMPLE_STRIP);
});
