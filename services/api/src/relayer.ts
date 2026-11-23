import type { Pool } from "pg";
import type { Hex } from "viem";
import type { Report } from "./report.ts";

export const LATE_WINDOW_SECONDS = 3 * 3600;
// After a slot ends the relayer waits this long for the slower operators before it sends what it
// has: one batch over all values gives the contract the whole evidence at once.
export const STRAGGLER_GRACE_SECONDS = 10 * 60;
// Send whatever is there when this little of the late window is left.
export const LAST_CHANCE_SECONDS = 30 * 60;

export type OracleChain = {
  indexPeriod(indexId: Hex): Promise<number>;
  /** Sends one `submit` and returns its hash once mined successfully; throws on revert. */
  submit(reports: Report[], signatures: Hex[]): Promise<Hex>;
  slotFinalized(indexId: Hex, timestamp: bigint): Promise<boolean>;
};

export type RelayerConfig = {
  expectedOperators: number;
  now: () => number; // unix seconds
};

export type RelayerLog = {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
};

type PendingRow = {
  id: string;
  index_id: Hex;
  slot_ts: string;
  value: string;
  sources: number;
  methodology_version: string;
  nonce: string;
  signature: Hex;
};

export type RelayResult = {
  submitted: number;
  waiting: number;
  expired: number;
};

type Slot = { indexId: Hex; timestamp: bigint; rows: PendingRow[] };

function toReport(row: PendingRow): Report {
  return {
    indexId: row.index_id,
    timestamp: BigInt(row.slot_ts),
    value: BigInt(row.value),
    sources: row.sources,
    methodologyVersion: Number(row.methodology_version),
    nonce: BigInt(row.nonce),
  };
}

/** One pass: expire what can no longer be accepted, send what is ready, leave the rest. */
export async function relayOnce(
  pool: Pool,
  chain: OracleChain,
  config: RelayerConfig,
  log: RelayerLog,
): Promise<RelayResult> {
  const pending = await pool.query<PendingRow>(
    `select id::text, index_id, slot_ts::text, value::text, sources,
            methodology_version::text, nonce::text, signature
       from oracle_reports where status = 'pending' order by index_id, slot_ts, id`,
  );

  const slots = new Map<string, Slot>();
  for (const row of pending.rows) {
    const key = `${row.index_id}:${row.slot_ts}`;
    const slot = slots.get(key) ?? {
      indexId: row.index_id,
      timestamp: BigInt(row.slot_ts),
      rows: [],
    };
    slot.rows.push(row);
    slots.set(key, slot);
  }

  const now = config.now();
  const ready: PendingRow[] = [];
  const expiredIds: string[] = [];
  let waiting = 0;

  for (const slot of slots.values()) {
    const period = await chain.indexPeriod(slot.indexId);
    const opensAt = Number(slot.timestamp) + period;
    const closesAt = opensAt + LATE_WINDOW_SECONDS;
    if (now > closesAt) {
      expiredIds.push(...slot.rows.map((row) => row.id));
      log.warn(
        { indexId: slot.indexId, timestamp: String(slot.timestamp) },
        "reports missed the late window",
      );
      continue;
    }
    const complete = slot.rows.length >= config.expectedOperators;
    const graceOver = now >= opensAt + STRAGGLER_GRACE_SECONDS;
    const lastChance = now >= closesAt - LAST_CHANCE_SECONDS;
    if (now >= opensAt && (complete || graceOver || lastChance)) {
      ready.push(...slot.rows);
    } else {
      waiting += slot.rows.length;
    }
  }

  if (expiredIds.length > 0) {
    await pool.query(
      "update oracle_reports set status = 'expired' where id = any($1::bigint[])",
      [expiredIds],
    );
  }

  if (ready.length > 0) {
    const hash = await chain.submit(
      ready.map(toReport),
      ready.map((row) => row.signature),
    );
    await pool.query(
      "update oracle_reports set status = 'relayed', relayed_at = now(), relay_tx = $2 where id = any($1::bigint[])",
      [ready.map((row) => row.id), hash],
    );
    log.info({ hash, reports: ready.length }, "relayed batch");
  }
  return { submitted: ready.length, waiting, expired: expiredIds.length };
}

/**
 * Slots we relayed whose late window is over and that the oracle did not finalize. Returned so
 * the caller can raise an alert; the chain is the authority on what finalized.
 */
export async function unfinalizedSlots(
  pool: Pool,
  chain: OracleChain,
  now: number,
  lookbackSeconds = 24 * 3600,
): Promise<Array<{ indexId: Hex; timestamp: bigint }>> {
  const relayed = await pool.query<{ index_id: Hex; slot_ts: string }>(
    `select distinct index_id, slot_ts::text from oracle_reports
      where status = 'relayed' and slot_ts > $1`,
    [now - lookbackSeconds - LATE_WINDOW_SECONDS - 86400],
  );
  const missing = [];
  for (const row of relayed.rows) {
    const timestamp = BigInt(row.slot_ts);
    const period = await chain.indexPeriod(row.index_id);
    const closesAt = Number(timestamp) + period + LATE_WINDOW_SECONDS;
    if (now <= closesAt || now - closesAt > lookbackSeconds) continue;
    if (!(await chain.slotFinalized(row.index_id, timestamp))) {
      missing.push({ indexId: row.index_id, timestamp });
    }
  }
  return missing;
}
