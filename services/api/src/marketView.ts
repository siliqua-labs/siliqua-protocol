import type { Pool } from "pg";
import type { Hex } from "viem";

const isoSeconds = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");

// Mirrors RangeMarket.SETTLE_DELAY and VoidReason order.
const SETTLE_DELAY_SECONDS = 3 * 3600;
export const VOID_REASONS = [
  "stale oracle",
  "empty winning side",
  "expired",
] as const;
const BPS = 10_000n;

export type MarketStatus = "open" | "closed" | "settled" | "void";

export type MarketView = {
  address: string;
  indexLabel: string;
  // Index units: micro USD per GPU-hour for GRI.
  thresholdMicroUsd: string;
  closeTime: string;
  twapFrom: string;
  twapTo: string;
  settleableFrom: string;
  feeBps: number;
  // Token base units. The token's decimals() is read on chain by the client, not stored here.
  betCap: string;
  yesPool: string;
  noPool: string;
  bettors: number;
  // Share of the pool on YES, as the contract computes it: 5000 when the pools are empty.
  impliedYesBps: number;
  // open: bets accepted. closed: no more bets, not yet settled. A closed market stays closed
  // until someone calls settle(), so this is derived from time and the outcome event.
  status: MarketStatus;
  twapMicroUsd: string | null;
  yesWins: boolean | null;
  voidReason: string | null;
};

type Row = {
  market: string;
  index_id: Hex;
  threshold: string;
  close_time: string;
  twap_from: string;
  twap_to: string;
  fee_bps: number;
  bet_cap: string;
  yes_pool: string;
  no_pool: string;
  bettors: number;
  voided: boolean | null;
  twap_value: string | null;
  yes_wins: boolean | null;
  void_reason: number | null;
};

export function impliedYesBps(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  return total === 0n ? 5000 : Number((yesPool * BPS) / total);
}

function toView(
  row: Row,
  now: number,
  label: (indexId: string) => string,
): MarketView {
  const closeTime = Number(row.close_time);
  const twapTo = Number(row.twap_to);
  let status: MarketStatus;
  if (row.voided === null) status = now < closeTime ? "open" : "closed";
  else status = row.voided ? "void" : "settled";
  return {
    address: row.market,
    indexLabel: label(row.index_id),
    thresholdMicroUsd: row.threshold,
    closeTime: isoSeconds(closeTime),
    twapFrom: isoSeconds(Number(row.twap_from)),
    twapTo: isoSeconds(twapTo),
    settleableFrom: isoSeconds(twapTo + SETTLE_DELAY_SECONDS),
    feeBps: row.fee_bps,
    betCap: row.bet_cap,
    yesPool: row.yes_pool,
    noPool: row.no_pool,
    bettors: row.bettors,
    impliedYesBps: impliedYesBps(BigInt(row.yes_pool), BigInt(row.no_pool)),
    status,
    twapMicroUsd: row.twap_value,
    yesWins: row.yes_wins,
    voidReason:
      row.void_reason === null
        ? null
        : (VOID_REASONS[row.void_reason] ?? `reason ${row.void_reason}`),
  };
}

const SELECT = `
  select m.market, m.index_id, m.threshold::text, m.close_time::text, m.twap_from::text,
         m.twap_to::text, m.fee_bps, m.bet_cap::text,
         coalesce(b.yes_pool, 0)::text as yes_pool, coalesce(b.no_pool, 0)::text as no_pool,
         coalesce(b.bettors, 0)::int as bettors,
         o.voided, o.twap_value::text, o.yes_wins, o.void_reason
    from markets m
    left join (
      select market,
             sum(amount) filter (where yes) as yes_pool,
             sum(amount) filter (where not yes) as no_pool,
             count(distinct account) as bettors
        from market_bets group by market
    ) b on b.market = m.market
    left join market_outcomes o on o.market = m.market`;

export async function listMarkets(
  pool: Pool,
  labels: Map<string, string>,
  now: number,
): Promise<MarketView[]> {
  const label = (id: string) => labels.get(id) ?? `${id.slice(0, 10)}...`;
  const result = await pool.query<Row>(
    `${SELECT} order by m.close_time desc, m.market`,
  );
  return result.rows.map((row) => toView(row, now, label));
}

export async function findMarket(
  pool: Pool,
  address: string,
  labels: Map<string, string>,
  now: number,
): Promise<MarketView | null> {
  const label = (id: string) => labels.get(id) ?? `${id.slice(0, 10)}...`;
  const result = await pool.query<Row>(`${SELECT} where m.market = $1`, [
    address.toLowerCase(),
  ]);
  const row = result.rows[0];
  return row ? toView(row, now, label) : null;
}
