import type { Pool, PoolClient } from "pg";
import type { Hex } from "viem";
import type { IndexedLog } from "./events.ts";

export type IndexerChain = {
  headNumber(): Promise<bigint>;
  /** Hash of the canonical block at this height right now, or null if there is none. */
  blockHash(blockNumber: bigint): Promise<Hex | null>;
  /** Block timestamp in unix seconds. */
  blockTime(blockNumber: bigint): Promise<number>;
  logs(from: bigint, to: bigint): Promise<IndexedLog[]>;
};

export type IndexerConfig = {
  name: string;
  startBlock: bigint;
  confirmations: bigint;
  maxRange: bigint;
  // How many recent block hashes to keep for finding a fork point.
  keepBlocks: bigint;
};

export type IndexerLog = {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
};

export type PassResult = {
  from: bigint;
  to: bigint;
  events: number;
  reorgedTo: bigint | null;
};

type State = { block_number: string; block_hash: Hex };

const EVENT_TABLES = [
  "oracle_operator_values",
  "oracle_rejections",
  "oracle_slots",
  "oracle_operator_changes",
] as const;

async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * If the block we last indexed is no longer canonical, unwind to the newest block whose hash still
 * matches and delete everything above it. Returns the block we are now at, or null if no reorg.
 */
async function unwindIfReorged(
  pool: Pool,
  chain: IndexerChain,
  config: IndexerConfig,
  state: State | undefined,
  log: IndexerLog,
): Promise<bigint | null> {
  if (!state) return null;
  const cursor = BigInt(state.block_number);
  if ((await chain.blockHash(cursor)) === state.block_hash) return null;

  const stored = await pool.query<{ block_number: string; block_hash: Hex }>(
    "select block_number::text, block_hash from chain_blocks where block_number <= $1 order by block_number desc",
    [cursor.toString()],
  );
  let ancestor: { number: bigint; hash: Hex } | null = null;
  for (const row of stored.rows) {
    const number = BigInt(row.block_number);
    if ((await chain.blockHash(number)) === row.block_hash) {
      ancestor = { number, hash: row.block_hash };
      break;
    }
  }
  if (!ancestor) {
    // Hashes are kept only for the last `keepBlocks`. If nothing was pruned yet, everything
    // indexed is inside that window, so unwinding to before the start block is exact.
    if (cursor - config.startBlock >= config.keepBlocks) {
      throw new Error(
        `reorg deeper than the ${config.keepBlocks} blocks kept: no stored block matches the chain below ${cursor}`,
      );
    }
    await withTransaction(pool, async (client) => {
      for (const table of EVENT_TABLES)
        await client.query(`delete from ${table}`);
      await client.query("delete from chain_blocks");
      await client.query("delete from indexer_state where name = $1", [
        config.name,
      ]);
    });
    log.warn(
      { from: String(cursor) },
      "chain reorganized past every stored block, reindexing from the start block",
    );
    return config.startBlock - 1n;
  }
  const fork = ancestor;
  await withTransaction(pool, async (client) => {
    for (const table of EVENT_TABLES) {
      await client.query(`delete from ${table} where block_number > $1`, [
        fork.number.toString(),
      ]);
    }
    await client.query("delete from chain_blocks where block_number > $1", [
      fork.number.toString(),
    ]);
    await client.query(
      "update indexer_state set block_number = $2, block_hash = $3 where name = $1",
      [config.name, fork.number.toString(), fork.hash],
    );
  });
  log.warn(
    { from: String(cursor), to: String(fork.number) },
    "chain reorganized, unwound indexed events",
  );
  return fork.number;
}

/** One pass: unwind a reorg if there is one, then index the next range of blocks. */
export async function indexOnce(
  pool: Pool,
  chain: IndexerChain,
  config: IndexerConfig,
  log: IndexerLog,
): Promise<PassResult> {
  const stateRows = await pool.query<State>(
    "select block_number::text, block_hash from indexer_state where name = $1",
    [config.name],
  );
  const state = stateRows.rows[0];
  const reorgedTo = await unwindIfReorged(pool, chain, config, state, log);

  const cursor =
    reorgedTo ?? (state ? BigInt(state.block_number) : config.startBlock - 1n);
  const head = (await chain.headNumber()) - config.confirmations;
  const from = cursor + 1n;
  if (head < from) return { from, to: cursor, events: 0, reorgedTo };
  const to =
    head < from + config.maxRange - 1n ? head : from + config.maxRange - 1n;

  const logs = await chain.logs(from, to);
  const toHash = await chain.blockHash(to);
  if (!toHash) throw new Error(`block ${to} disappeared while indexing`);

  // The logs and the hash of `to` come from separate calls. If the chain moved in between, the
  // logs could belong to a fork that no longer exists; refuse and let the next pass redo it.
  const times = new Map<bigint, number>();
  for (const entry of logs) {
    if (times.has(entry.blockNumber)) continue;
    if ((await chain.blockHash(entry.blockNumber)) !== entry.blockHash) {
      throw new Error(
        `chain changed while reading block ${entry.blockNumber}, retrying next pass`,
      );
    }
    times.set(entry.blockNumber, await chain.blockTime(entry.blockNumber));
  }

  await withTransaction(pool, async (client) => {
    for (const entry of logs) {
      await insertEvent(client, entry, times.get(entry.blockNumber) as number);
    }
    // Blocks that carried events, and the end of the range, are the fork points we can return to.
    const known = new Map<bigint, Hex>(
      logs.map((e) => [e.blockNumber, e.blockHash]),
    );
    known.set(to, toHash);
    for (const [number, hash] of known) {
      await client.query(
        "insert into chain_blocks (block_number, block_hash) values ($1, $2) on conflict (block_number) do update set block_hash = excluded.block_hash",
        [number.toString(), hash],
      );
    }
    await client.query(
      `insert into indexer_state (name, block_number, block_hash) values ($1, $2, $3)
       on conflict (name) do update set block_number = excluded.block_number, block_hash = excluded.block_hash`,
      [config.name, to.toString(), toHash],
    );
    await client.query("delete from chain_blocks where block_number < $1", [
      (to - config.keepBlocks).toString(),
    ]);
  });
  if (logs.length > 0) {
    log.info(
      { from: String(from), to: String(to), events: logs.length },
      "indexed events",
    );
  }
  return { from, to, events: logs.length, reorgedTo };
}

async function insertEvent(
  client: PoolClient,
  entry: IndexedLog,
  blockTime: number,
): Promise<void> {
  const at = new Date(blockTime * 1000);
  const base = [entry.blockNumber.toString(), entry.logIndex, entry.blockHash];
  const event = entry.event;
  switch (event.kind) {
    case "value":
      await client.query(
        `insert into oracle_operator_values
           (block_number, log_index, block_hash, tx_hash, block_time, index_id, slot_ts, operator,
            value, sources, methodology_version, nonce, counted)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          ...base,
          entry.txHash,
          at,
          event.indexId,
          event.timestamp.toString(),
          event.operator.toLowerCase(),
          event.value.toString(),
          event.sources,
          event.methodologyVersion,
          event.nonce.toString(),
          event.counted,
        ],
      );
      return;
    case "rejected":
      await client.query(
        `insert into oracle_rejections
           (block_number, log_index, block_hash, tx_hash, block_time, index_id, slot_ts, operator, reason)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          ...base,
          entry.txHash,
          at,
          event.indexId,
          event.timestamp.toString(),
          event.operator.toLowerCase(),
          event.reason,
        ],
      );
      return;
    case "finalized":
      await client.query(
        `insert into oracle_slots
           (block_number, log_index, block_hash, block_time, index_id, slot_ts, value,
            kept_count, submitted_count, methodology_version)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ...base,
          at,
          event.indexId,
          event.timestamp.toString(),
          event.value.toString(),
          event.keptCount,
          event.submittedCount,
          event.methodologyVersion,
        ],
      );
      return;
    case "operator":
      await client.query(
        `insert into oracle_operator_changes
           (block_number, log_index, block_hash, block_time, operator, added)
         values ($1, $2, $3, $4, $5, $6)`,
        [...base, at, event.operator.toLowerCase(), event.added],
      );
      return;
  }
}
