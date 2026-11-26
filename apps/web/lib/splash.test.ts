import assert from "node:assert/strict";
import { test } from "node:test";
import { SPLASH_SCRIPT } from "./splash.ts";

test("the splash shows on the first load of a tab and is hidden after that", () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  };
  const load = () => {
    const splash = { hidden: false };
    new Function("sessionStorage", "document", SPLASH_SCRIPT)(storage, {
      getElementById: () => splash,
    });
    return splash.hidden;
  };
  assert.equal(load(), false);
  assert.equal(load(), true);
  assert.equal(load(), true);
});
