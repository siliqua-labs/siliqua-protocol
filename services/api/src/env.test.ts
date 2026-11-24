import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { toleranceFromEnv } from "./env.ts";

const original = process.env.ORACLE_TOLERANCE_BPS;
afterEach(() => {
  if (original === undefined) delete process.env.ORACLE_TOLERANCE_BPS;
  else process.env.ORACLE_TOLERANCE_BPS = original;
});

test("an unset or empty tolerance means not configured, never zero", () => {
  delete process.env.ORACLE_TOLERANCE_BPS;
  assert.equal(toleranceFromEnv(), undefined);
  process.env.ORACLE_TOLERANCE_BPS = "";
  assert.equal(toleranceFromEnv(), undefined);
});

test("a valid tolerance is returned and a bad one fails loudly", () => {
  process.env.ORACLE_TOLERANCE_BPS = "100";
  assert.equal(toleranceFromEnv(), 100);
  process.env.ORACLE_TOLERANCE_BPS = "0";
  assert.equal(toleranceFromEnv(), 0);
  process.env.ORACLE_TOLERANCE_BPS = "20000";
  assert.throws(() => toleranceFromEnv(), /0\.\.10000/);
  process.env.ORACLE_TOLERANCE_BPS = "abc";
  assert.throws(() => toleranceFromEnv(), /0\.\.10000/);
});
