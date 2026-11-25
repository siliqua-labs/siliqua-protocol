import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { botScoreText, loadNarratives } from "./narrativesView.ts";

test("bot score is a two-decimal fraction of 1", () => {
  assert.equal(botScoreText(0), "0.00");
  assert.equal(botScoreText(1205), "0.12");
  assert.equal(botScoreText(10000), "1.00");
});

function stub(daily: unknown[], ranked: unknown[]): Pool {
  const query = async (sql: string) => ({
    rows: sql.includes("from cmi_daily") ? daily : ranked,
  });
  return { query } as unknown as Pool;
}

test("stale day has null bps and no posts are loaded without a live day", async () => {
  const view = await loadNarratives(
    stub(
      [
        {
          day: "2027-01-01",
          status: "STALE",
          methodology_version: "1.0",
          narrative: null,
          value_bps: null,
        },
      ],
      [],
    ),
  );
  assert.deepEqual(view.days, [{ date: "2027-01-01", stale: true, bps: null }]);
  assert.deepEqual(view.posts, []);
});

test("live day groups values and posts, platform names are mapped", async () => {
  const view = await loadNarratives(
    stub(
      [
        {
          day: "2027-01-01",
          status: "LIVE",
          methodology_version: "1.0",
          narrative: "AGENTS",
          value_bps: 6000,
        },
        {
          day: "2027-01-01",
          status: "LIVE",
          methodology_version: "1.0",
          narrative: "OTHER",
          value_bps: 4000,
        },
      ],
      [
        {
          platform: "farcaster",
          post_id: "0xabc",
          label: "AGENTS",
          bot_score_bps: 300,
          model_hash: "h1",
          share_bps: "2500",
        },
      ],
    ),
  );
  assert.deepEqual(view.days[0]?.bps, { AGENTS: 6000, OTHER: 4000 });
  assert.equal(view.posts[0]?.rows[0]?.platform, "Farcaster");
  assert.equal(view.posts[0]?.rows[0]?.weightShareBps, 2500);
});
