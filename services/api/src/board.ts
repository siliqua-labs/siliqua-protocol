import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Address } from "viem";
import {
  type OracleDomain,
  parseSignedReport,
  ReportRejected,
  type SignedReport,
  signerOf,
} from "./report.ts";

export type ReportBoardConfig = {
  domain: OracleDomain;
  operators: ReadonlySet<Address>;
};

export type StoreOutcome =
  | "accepted"
  | "duplicate"
  | "slot_conflict"
  | "nonce_reused";

const MAX_REPORTS_PER_POST = 16;

export async function storeReport(
  pool: Pool,
  operator: Address,
  signed: SignedReport,
): Promise<StoreOutcome> {
  const { report, signature } = signed;
  const params = [
    report.indexId,
    report.timestamp.toString(),
    operator,
    report.value.toString(),
    report.sources,
    report.methodologyVersion,
    report.nonce.toString(),
    signature,
  ];
  const inserted = await pool.query(
    `insert into oracle_reports
       (index_id, slot_ts, operator, value, sources, methodology_version, nonce, signature)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict do nothing
     returning id`,
    params,
  );
  if (inserted.rows.length > 0) return "accepted";

  const existing = await pool.query<{ signature: string }>(
    "select signature from oracle_reports where operator = $1 and index_id = $2 and slot_ts = $3",
    [operator, report.indexId, report.timestamp.toString()],
  );
  const row = existing.rows[0];
  if (!row) return "nonce_reused";
  return row.signature === signature ? "duplicate" : "slot_conflict";
}

type BoardRow = {
  operator: string;
  value: string;
  sources: number;
  methodology_version: string;
  status: string;
  received_at: Date;
  relay_tx: string | null;
};

export function registerReportBoard(
  app: FastifyInstance,
  pool: Pool,
  config: ReportBoardConfig | undefined,
): void {
  app.post<{ Body: { reports?: unknown } }>(
    "/v1/reports",
    async (request, reply) => {
      if (!config) {
        return reply.code(503).send({
          error: {
            code: "board_disabled",
            message: "Report board is not configured",
          },
        });
      }
      const list = request.body?.reports;
      if (
        !Array.isArray(list) ||
        list.length === 0 ||
        list.length > MAX_REPORTS_PER_POST
      ) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message: `reports must be an array of 1..${MAX_REPORTS_PER_POST} entries`,
          },
        });
      }

      const results = [];
      for (const raw of list) {
        try {
          const signed = parseSignedReport(raw);
          const operator = await signerOf(config.domain, signed);
          if (!config.operators.has(operator)) {
            throw new ReportRejected(
              "unknown_signer",
              `${operator} is not an operator`,
            );
          }
          const outcome = await storeReport(pool, operator, signed);
          results.push({ operator, outcome });
        } catch (error) {
          if (!(error instanceof ReportRejected)) throw error;
          results.push({
            outcome: "rejected",
            code: error.code,
            message: error.message,
          });
        }
      }
      return { results };
    },
  );

  app.get<{ Querystring: { indexId?: string; timestamp?: string } }>(
    "/v1/reports",
    async (request, reply) => {
      const { indexId, timestamp } = request.query;
      if (
        !indexId ||
        !/^0x[0-9a-fA-F]{64}$/.test(indexId) ||
        !timestamp ||
        !/^\d{1,20}$/.test(timestamp)
      ) {
        return reply.code(400).send({
          error: {
            code: "bad_request",
            message:
              "indexId (bytes32 hex) and timestamp (seconds) are required",
          },
        });
      }
      const rows = await pool.query<BoardRow>(
        `select operator, value::text as value, sources, methodology_version::text as methodology_version,
                status, received_at, relay_tx
           from oracle_reports where index_id = $1 and slot_ts = $2 order by received_at`,
        [indexId.toLowerCase(), timestamp],
      );
      return {
        indexId: indexId.toLowerCase(),
        timestamp,
        reports: rows.rows.map((row) => ({
          operator: row.operator,
          value: row.value,
          sources: row.sources,
          methodologyVersion: Number(row.methodology_version),
          status: row.status,
          receivedAt: row.received_at.toISOString(),
          relayTx: row.relay_tx,
        })),
      };
    },
  );
}
