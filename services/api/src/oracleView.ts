import type { Pool } from "pg";
import { type Hex, keccak256, toHex } from "viem";

// Same order as SiliquaOracle.Reason.
export const REJECTION_REASONS = [
  "unknown index",
  "bad timestamp",
  "window closed",
  "window not open",
  "unknown signer",
  "value out of range",
  "bad methodology",
  "too few sources",
  "duplicate operator",
  "nonce used",
] as const;

const SLOTS_SHOWN = 24;
const REJECTIONS_SHOWN = 20;
const BPS = 10_000n;

export type OracleOperator = {
  address: string;
  active: boolean;
  lastSignedAt: string | null;
  reports24h: number;
};

export type OracleSlotValue = {
  operator: string;
  valueMicroUsd: string;
  kept: boolean;
  gapBps: number;
  // Signed: positive means above the slot median.
  deviationBps: number;
};

export type OracleSlot = {
  indexId: string;
  indexLabel: string;
  slot: string;
  values: OracleSlotValue[];
  medianMicroUsd: string;
  maxGapBps: number;
  finalizedValueMicroUsd: string | null;
  keptCount: number | null;
};

export type OracleRejection = {
  indexLabel: string;
  slot: string;
  operator: string;
  reason: string;
  at: string;
};

export type OracleView = {
  isSample: false;
  toleranceBps: number;
  operators: OracleOperator[];
  slots: OracleSlot[];
  rejections: OracleRejection[];
};

/** Labels for the index ids the contract knows only as keccak256 of the name. */
export function indexLabels(names: string[]): Map<string, string> {
  return new Map(names.map((name) => [keccak256(toHex(name)), name]));
}

function median(sorted: bigint[]): bigint {
  const n = sorted.length;
  const mid = sorted[Math.floor(n / 2)] as bigint;
  if (n % 2 === 1) return mid;
  return (((sorted[n / 2 - 1] as bigint) + mid + 1n) / 2n) as bigint;
}

const iso = (unixSeconds: string | number) =>
  new Date(Number(unixSeconds) * 1000).toISOString().replace(".000Z", "Z");

type ValueRow = {
  index_id: Hex;
  slot_ts: string;
  operator: string;
  value: string;
};

export async function loadOracleView(
  pool: Pool,
  toleranceBps: number,
  labels: Map<string, string>,
): Promise<OracleView> {
  const label = (indexId: string) =>
    labels.get(indexId) ?? `${indexId.slice(0, 10)}...`;

  const operators = await pool.query<{
    operator: string;
    added: boolean;
    last_signed: Date | null;
    reports_24h: number;
  }>(
    `with latest as (
       select distinct on (operator) operator, added
         from oracle_operator_changes order by operator, block_number desc, log_index desc
     ), activity as (
       select operator, max(block_time) as last_signed,
              count(*) filter (where block_time > now() - interval '24 hours')::int as reports_24h
         from oracle_operator_values group by operator
     )
     select l.operator, l.added, a.last_signed, coalesce(a.reports_24h, 0) as reports_24h
       from latest l left join activity a using (operator) order by l.operator`,
  );

  const recent = await pool.query<{ index_id: Hex; slot_ts: string }>(
    `select index_id, slot_ts::text from oracle_operator_values
      group by index_id, slot_ts order by slot_ts desc, index_id limit $1`,
    [SLOTS_SHOWN],
  );
  const keys = recent.rows;
  const indexIds = keys.map((k) => k.index_id);
  const slotTs = keys.map((k) => k.slot_ts);

  const values = await pool.query<ValueRow>(
    `select v.index_id, v.slot_ts::text, v.operator, v.value::text
       from oracle_operator_values v
       join unnest($1::text[], $2::bigint[]) as k(index_id, slot_ts)
         on k.index_id = v.index_id and k.slot_ts = v.slot_ts
      order by v.slot_ts desc, v.operator`,
    [indexIds, slotTs],
  );
  const finalized = await pool.query<{
    index_id: Hex;
    slot_ts: string;
    value: string;
    kept_count: number;
  }>(
    `select s.index_id, s.slot_ts::text, s.value::text, s.kept_count
       from oracle_slots s
       join unnest($1::text[], $2::bigint[]) as k(index_id, slot_ts)
         on k.index_id = s.index_id and k.slot_ts = s.slot_ts`,
    [indexIds, slotTs],
  );
  const finalizedByKey = new Map(
    finalized.rows.map((row) => [`${row.index_id}:${row.slot_ts}`, row]),
  );

  const slots: OracleSlot[] = keys.map((key) => {
    const rows = values.rows.filter(
      (row) => row.index_id === key.index_id && row.slot_ts === key.slot_ts,
    );
    const sorted = rows
      .map((row) => BigInt(row.value))
      .sort((a, b) => (a < b ? -1 : 1));
    const center = median(sorted);
    const tolerance = BigInt(toleranceBps);
    let maxGap = 0;
    const slotValues = rows.map((row) => {
      const value = BigInt(row.value);
      const distance = value > center ? value - center : center - value;
      const gapBps = Number((distance * BPS) / center);
      const deviationBps = value >= center ? gapBps : -gapBps;
      maxGap = Math.max(maxGap, gapBps);
      return {
        operator: row.operator,
        valueMicroUsd: row.value,
        // The contract's rule: strictly more than the tolerance from the median is dropped.
        kept: distance * BPS <= center * tolerance,
        gapBps,
        deviationBps,
      };
    });
    const done = finalizedByKey.get(`${key.index_id}:${key.slot_ts}`);
    return {
      indexId: key.index_id,
      indexLabel: label(key.index_id),
      slot: iso(key.slot_ts),
      values: slotValues,
      medianMicroUsd: String(center),
      maxGapBps: maxGap,
      finalizedValueMicroUsd: done ? done.value : null,
      keptCount: done ? done.kept_count : null,
    };
  });

  const rejections = await pool.query<{
    index_id: Hex;
    slot_ts: string;
    operator: string;
    reason: number;
    block_time: Date;
  }>(
    `select index_id, slot_ts::text, operator, reason, block_time
       from oracle_rejections order by block_number desc, log_index desc limit $1`,
    [REJECTIONS_SHOWN],
  );

  return {
    isSample: false,
    toleranceBps,
    operators: operators.rows.map((row) => ({
      address: row.operator,
      active: row.added,
      lastSignedAt: row.last_signed ? row.last_signed.toISOString() : null,
      reports24h: row.reports_24h,
    })),
    slots,
    rejections: rejections.rows.map((row) => ({
      indexLabel: label(row.index_id),
      slot: iso(row.slot_ts),
      operator: row.operator,
      reason: REJECTION_REASONS[row.reason] ?? `reason ${row.reason}`,
      at: row.block_time.toISOString(),
    })),
  };
}
