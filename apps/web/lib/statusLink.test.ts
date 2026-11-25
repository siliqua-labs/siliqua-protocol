import assert from "node:assert/strict";
import { test } from "node:test";
import { splitStatusLink } from "./statusLink.ts";

test("a trailing URL is split from its text", () => {
  assert.deepEqual(splitStatusLink("Confirmed: https://x.example/tx/0xab"), {
    text: "Confirmed:",
    url: "https://x.example/tx/0xab",
  });
});

test("text without a URL is left alone", () => {
  assert.deepEqual(splitStatusLink("Confirm in your wallet."), {
    text: "Confirm in your wallet.",
    url: null,
  });
  assert.deepEqual(splitStatusLink(""), { text: "", url: null });
});
