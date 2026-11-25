import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockscoutResult,
  describeVerification,
  sourcifyResult,
} from "./verification.ts";

test("sourcify: a match is verified, a null match or 404 is not", () => {
  assert.equal(sourcifyResult(200, { match: "match" }), "verified");
  assert.equal(sourcifyResult(200, { match: "exact_match" }), "verified");
  assert.equal(sourcifyResult(200, { match: null }), "not verified");
  assert.equal(sourcifyResult(404, null), "not verified");
  assert.equal(sourcifyResult(503, null), "unknown");
});

test("blockscout: partial is reported as partial, not as full", () => {
  assert.equal(
    blockscoutResult(200, { is_verified: true, is_fully_verified: false }),
    "partial",
  );
  assert.equal(
    blockscoutResult(200, { is_verified: true, is_fully_verified: true }),
    "verified",
  );
  assert.equal(blockscoutResult(200, { is_verified: false }), "not verified");
  assert.equal(blockscoutResult(504, null), "unknown");
});

test("the line names every place the source is verified", () => {
  assert.equal(
    describeVerification([
      { verifier: "Sourcify", result: "verified" },
      { verifier: "Blockscout", result: "unknown" },
    ]),
    "verified on Sourcify",
  );
  assert.equal(
    describeVerification([
      { verifier: "Sourcify", result: "not verified" },
      { verifier: "Blockscout", result: "partial" },
    ]),
    "verified on Blockscout (partial)",
  );
  assert.equal(
    describeVerification([
      { verifier: "Sourcify", result: "not verified" },
      { verifier: "Blockscout", result: "not verified" },
    ]),
    "not verified",
  );
  assert.equal(
    describeVerification([
      { verifier: "Sourcify", result: "not verified" },
      { verifier: "Blockscout", result: "unknown" },
    ]),
    "unknown, check the explorer",
  );
});
