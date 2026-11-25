import assert from "node:assert/strict";
import { test } from "node:test";
import { narrativeNames } from "./narrativeNames.ts";

test("narratives keep the api order and OTHER goes last", () => {
  assert.deepEqual(
    narrativeNames({ OTHER: 2145, AI_AGENTS: 2810, GPU_SUPPLY: 407 }),
    ["AI_AGENTS", "GPU_SUPPLY", "OTHER"],
  );
});

test("a day without OTHER lists only its narratives and none is invented", () => {
  assert.deepEqual(narrativeNames({ AI_AGENTS: 10000 }), ["AI_AGENTS"]);
  assert.deepEqual(narrativeNames({}), []);
});
