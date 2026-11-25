import type { Pool } from "pg";

const DAYS = 30;
const POSTS_PER_NARRATIVE = 3;
const LOOKBACK_DAYS = 7;
const PLATFORM_NAMES: Record<string, "X" | "Farcaster" | "Bluesky"> = {
  x: "X",
  farcaster: "Farcaster",
  bluesky: "Bluesky",
};

export type NarrativesView = {
  methodologyVersion: string | null;
  isSample: false;
  days: {
    date: string;
    stale: boolean;
    bps: Record<string, number> | null;
  }[];
  posts: {
    narrative: string;
    rows: {
      platform: "X" | "Farcaster" | "Bluesky";
      postId: string;
      label: string;
      botScore: string;
      modelHash: string;
      weightShareBps: number;
    }[];
  }[];
};

export function botScoreText(bps: number): string {
  const hundredths = Math.floor(bps / 100);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

export async function loadNarratives(pool: Pool): Promise<NarrativesView> {
  const daily = await pool.query<{
    day: string;
    status: "LIVE" | "STALE";
    methodology_version: string;
    narrative: string | null;
    value_bps: number | null;
  }>(
    `select to_char(d.day, 'YYYY-MM-DD') as day, d.status, d.methodology_version,
            v.narrative, v.value_bps
       from (select * from cmi_daily order by day desc limit $1) d
       left join cmi_daily_values v on v.day = d.day
      order by d.day, v.narrative`,
    [DAYS],
  );
  const byDay = new Map<string, NarrativesView["days"][number]>();
  for (const row of daily.rows) {
    let entry = byDay.get(row.day);
    if (!entry) {
      entry = {
        date: row.day,
        stale: row.status === "STALE",
        bps: row.status === "STALE" ? null : {},
      };
      byDay.set(row.day, entry);
    }
    if (entry.bps && row.narrative && row.value_bps !== null) {
      entry.bps[row.narrative] = row.value_bps;
    }
  }
  const days = [...byDay.values()];
  const methodologyVersion = daily.rows.at(-1)?.methodology_version ?? null;

  // Top posts come from the 7-day window ending with the latest published day, ranked by
  // credibility alone. The time decay lives in the Python index package and is not repeated here,
  // so the share is the post's part of its narrative's credibility, not of the published weight.
  const latest = days.filter((d) => !d.stale).at(-1);
  if (!latest) return { methodologyVersion, isSample: false, days, posts: [] };
  const ranked = await pool.query<{
    platform: string;
    post_id: string;
    label: string;
    bot_score_bps: number;
    model_hash: string;
    share_bps: string;
  }>(
    `select platform, post_id, label, bot_score_bps, model_hash, share_bps from (
       select platform, post_id, label, bot_score_bps, model_hash,
              floor(credibility_bps * 10000.0
                    / nullif(sum(credibility_bps) over (partition by label), 0))::text as share_bps,
              row_number() over (partition by label order by credibility_bps desc, platform, post_id) as rank
         from social_posts
        where created_at >= ($1::date + 1 - $2::int) and created_at < ($1::date + 1)
          and credibility_bps > 0
     ) ranked
     where rank <= $3 order by label, rank`,
    [latest.date, LOOKBACK_DAYS, POSTS_PER_NARRATIVE],
  );
  const byLabel = new Map<string, NarrativesView["posts"][number]>();
  for (const row of ranked.rows) {
    const platform = PLATFORM_NAMES[row.platform];
    if (!platform) throw new Error(`unknown platform ${row.platform}`);
    let group = byLabel.get(row.label);
    if (!group) {
      group = { narrative: row.label, rows: [] };
      byLabel.set(row.label, group);
    }
    group.rows.push({
      platform,
      postId: row.post_id,
      label: row.label,
      botScore: botScoreText(row.bot_score_bps),
      modelHash: row.model_hash,
      weightShareBps: Number(row.share_bps),
    });
  }
  return {
    methodologyVersion,
    isSample: false,
    days,
    posts: [...byLabel.values()],
  };
}
