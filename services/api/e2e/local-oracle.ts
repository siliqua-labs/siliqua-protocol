// Local end-to-end run of the oracle path (roadmap 3.6), no public chain involved:
//   operator signatures -> report board (api) -> relayer -> anvil -> indexer -> Postgres.
//
// Needs: `forge build` in contracts/, anvil on PATH, local Postgres (docker compose up -d) and
//   DATABASE_URL=postgresql://... pnpm --filter @siliqua/api e2e
// The run lives in its own schema and drops it afterwards.
//
// The signers here are viem accounts with anvil's public development keys. The Python
// `oracle-node` replaces them once its dependency is approved (roadmap 3.3).

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";
import {
  type Abi,
  type Address,
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { oracleLogs } from "../../indexer/src/chain.ts";
import { indexOnce } from "../../indexer/src/indexer.ts";
import { buildApp } from "../src/app.ts";
import { oracleChain } from "../src/chain.ts";
import { relayOnce } from "../src/relayer.ts";
import { type Report, typedDataFor } from "../src/report.ts";

const PORT = 18545;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 31337;
// Anvil's documented development keys. They hold nothing outside a local anvil.
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;
const admin = privateKeyToAccount(KEYS[0]);
const op1 = privateKeyToAccount(KEYS[1]);
const op2 = privateKeyToAccount(KEYS[2]);
const op3 = privateKeyToAccount(KEYS[3]);
const op4 = privateKeyToAccount(KEYS[4]);
const GRI_H100 = keccak256(toHex("GRI-H100"));
const METHODOLOGY = 10_000;
const HOUR = 3600;
// Slot grid start: an hour boundary after the chain's current time, set once anvil is up.
let BASE = 0;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const schema = `e2e_oracle_${process.pid}`;

const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/out/SiliquaOracle.sol/SiliquaOracle.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { abi: Abi; bytecode: { object: Hex } };

const chainDef = defineChain({
  id: CHAIN_ID,
  name: "anvil-local",
  nativeCurrency: { name: "native", symbol: "NATIVE", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({
  chain: chainDef,
  transport: http(RPC),
});
const walletClient = createWalletClient({
  account: admin,
  chain: chainDef,
  transport: http(RPC),
});
const testClient = createTestClient({
  chain: chainDef,
  mode: "anvil",
  transport: http(RPC),
});

async function startAnvil(): Promise<ChildProcess> {
  const child = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await publicClient.getBlockNumber();
      return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  child.kill();
  throw new Error("anvil did not start");
}

async function setClock(unixSeconds: number): Promise<void> {
  await testClient.setNextBlockTimestamp({ timestamp: BigInt(unixSeconds) });
  await testClient.mine({ blocks: 1 });
}

async function send(
  oracle: Address,
  functionName: string,
  args: unknown[],
): Promise<void> {
  const hash = await walletClient.writeContract({
    account: admin,
    address: oracle,
    abi: artifact.abi,
    functionName,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${functionName} reverted`);
}

async function main(): Promise<void> {
  const anvil = await startAnvil();
  const root = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await root.query(`create schema ${schema}`);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
    max: 4,
  });

  try {
    for (const file of ["0002_oracle_reports.sql", "0003_oracle_events.sql"]) {
      await pool.query(
        readFileSync(
          new URL(`../../../db/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
    const head = await publicClient.getBlock();
    BASE = (Math.floor(Number(head.timestamp) / HOUR) + 2) * HOUR;
    await setClock(BASE);

    // ---- deploy and configure
    const deployHash = await walletClient.deployContract({
      account: admin,
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [admin.address, admin.address, 2, METHODOLOGY],
    });
    const deployed = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
    });
    const oracle = deployed.contractAddress as Address;
    for (const operator of [op1, op2, op3])
      await send(oracle, "addOperator", [operator.address]);
    await send(oracle, "registerIndex", [GRI_H100, HOUR, 6, 5, 100]);
    console.log(`oracle ${oracle} deployed at block ${deployed.blockNumber}`);

    // ---- services
    const operators = new Set<Address>(
      [op1, op2, op3].map((a) => a.address.toLowerCase() as Address),
    );
    const domain = { chainId: CHAIN_ID, oracle };
    const app = await buildApp(pool, { reportBoard: { domain, operators } });
    const chain = oracleChain({
      rpcUrl: RPC,
      chainId: CHAIN_ID,
      oracle,
      relayerKey: KEYS[0],
    });
    const clock = { now: 0 };
    const relayerConfig = { expectedOperators: 3, now: () => clock.now };
    const quiet = { info() {}, warn() {} };
    const indexer = {
      chain: oracleLogs({ rpcUrl: RPC, chainId: CHAIN_ID, oracle }),
      config: {
        name: "e2e",
        startBlock: deployed.blockNumber,
        confirmations: 0n,
        maxRange: 1000n,
        keepBlocks: 256n,
      },
    };
    const catchUp = async () => {
      while (true) {
        const pass = await indexOnce(
          pool,
          indexer.chain,
          indexer.config,
          quiet,
        );
        if (pass.to < pass.from) return;
      }
    };

    let nonce = 1n;
    const post = async (
      account: typeof op1,
      slot: number,
      value: bigint,
      sources = 6,
    ) => {
      const report: Report = {
        indexId: GRI_H100,
        timestamp: BigInt(slot),
        value,
        sources,
        methodologyVersion: METHODOLOGY,
        nonce: nonce++,
      };
      const signature = await account.signTypedData(
        typedDataFor(domain, report),
      );
      const response = await app.inject({
        method: "POST",
        url: "/v1/reports",
        payload: {
          reports: [
            {
              report: {
                ...report,
                timestamp: report.timestamp.toString(),
                value: report.value.toString(),
                nonce: report.nonce.toString(),
              },
              signature,
            },
          ],
        },
      });
      assert.equal(response.statusCode, 200);
      return response.json().results[0] as { outcome: string; code?: string };
    };
    const relay = async (at: number) => {
      await setClock(at);
      clock.now = at;
      return relayOnce(pool, chain, relayerConfig, quiet);
    };
    const slotRow = async (slot: number) => {
      const rows = await pool.query(
        "select value::text, kept_count, submitted_count from oracle_slots where slot_ts = $1",
        [slot],
      );
      return rows.rows[0] as
        | { value: string; kept_count: number; submitted_count: number }
        | undefined;
    };

    // ---- A: three operators agree
    const slotA = BASE;
    for (const [account, value] of [
      [op1, 3_520_000n],
      [op2, 3_523_000n],
      [op3, 3_530_000n],
    ] as const) {
      assert.equal((await post(account, slotA, value)).outcome, "accepted");
    }
    assert.equal((await relay(slotA + HOUR)).submitted, 3);
    await catchUp();
    assert.deepEqual(await slotRow(slotA), {
      value: "3523000",
      kept_count: 3,
      submitted_count: 3,
    });
    console.log("A  three agree            -> 3523000, 3 kept");

    // ---- B: one outlier is dropped but still recorded as that operator's value
    const slotB = BASE + HOUR;
    for (const [account, value] of [
      [op1, 3_520_000n],
      [op2, 3_523_000n],
      [op3, 3_700_000n],
    ] as const) {
      await post(account, slotB, value);
    }
    await relay(slotB + HOUR);
    await catchUp();
    assert.deepEqual(await slotRow(slotB), {
      value: "3521500",
      kept_count: 2,
      submitted_count: 3,
    });
    const outlier = await pool.query(
      "select value::text from oracle_operator_values where slot_ts = $1 and operator = $2",
      [slotB, op3.address.toLowerCase()],
    );
    assert.equal(outlier.rows[0]?.value, "3700000");
    console.log(
      "B  one outlier            -> 3521500, 2 kept, outlier value on record",
    );

    // ---- C: one operator offline; the relayer waits for it, then goes without it
    const slotC = BASE + 2 * HOUR;
    await post(op1, slotC, 3_520_001n);
    await post(op2, slotC, 3_523_000n);
    assert.equal(
      (await relay(slotC + HOUR)).submitted,
      0,
      "waits for the third operator",
    );
    assert.equal(
      (await relay(slotC + HOUR + 600)).submitted,
      2,
      "goes after the grace period",
    );
    await catchUp();
    assert.deepEqual(await slotRow(slotC), {
      value: "3521501",
      kept_count: 2,
      submitted_count: 2,
    });
    console.log(
      "C  operator offline       -> 3521501 from two values (half up)",
    );

    // ---- D: key rotation; the old key is refused, the new one is accepted
    await send(oracle, "removeOperator", [op3.address]);
    await send(oracle, "addOperator", [op4.address]);
    operators.delete(op3.address.toLowerCase() as Address);
    operators.add(op4.address.toLowerCase() as Address);
    const slotD = BASE + 3 * HOUR;
    await post(op1, slotD, 3_600_000n);
    await post(op2, slotD, 3_601_000n);
    assert.equal(
      (await post(op3, slotD, 3_602_000n)).code,
      "unknown_signer",
      "old key refused by the board",
    );
    assert.equal((await post(op4, slotD, 3_602_000n)).outcome, "accepted");
    await relay(slotD + HOUR);
    await catchUp();
    assert.deepEqual(await slotRow(slotD), {
      value: "3601000",
      kept_count: 3,
      submitted_count: 3,
    });
    console.log(
      "D  key rotation           -> 3601000, old key refused, new key counted",
    );

    // ---- late window: a report after the three hours is expired, never sent
    const slotE = BASE + 4 * HOUR;
    await post(op1, slotE, 3_600_000n);
    assert.equal((await relay(slotE + HOUR + 3 * HOUR + 1)).expired, 1);
    console.log("E  too late               -> expired by the relayer");

    // ---- the spread gate from events only: (max - min) / median per slot, under 0.5%
    const spread = await pool.query(
      `select slot_ts, (max(value) - min(value)) / percentile_cont(0.5) within group (order by value) as spread
         from oracle_operator_values group by slot_ts order by slot_ts`,
    );
    for (const row of spread.rows) {
      const pct = Number(row.spread) * 100;
      console.log(
        `   slot ${row.slot_ts} spread ${pct.toFixed(3)}%${pct > 0.5 ? "  (above 0.5%)" : ""}`,
      );
    }
    assert.ok(
      Number(spread.rows[0].spread) < 0.005,
      "slot A is inside the 0.5% gate",
    );

    // ---- a rejection is on chain too
    const rejected = await pool.query(
      "select count(*)::int as n from oracle_rejections",
    );
    console.log(`rejections on chain: ${rejected.rows[0].n}`);
    console.log("local oracle end-to-end: all scenarios passed");
  } finally {
    await pool.end();
    await root.query(`drop schema ${schema} cascade`);
    await root.end();
    anvil.kill();
  }
}

await main();
