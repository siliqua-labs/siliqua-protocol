import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { type ReportBoardConfig, registerReportBoard } from "./board.ts";
import { findMarket, listMarkets } from "./marketView.ts";
import { isoSeconds, medianMicro } from "./money.ts";
import { loadNarratives } from "./narrativesView.ts";
import { indexLabels, loadOracleView } from "./oracleView.ts";
import {
  buildSeries,
  buildSnapshot,
  toHistoryPoints,
  twap24h,
} from "./series.ts";
import {
  currentMethodology,
  listGpuClasses,
  loadInputs,
  loadWindow,
} from "./store.ts";
import type {
  ApiError,
  IndexDetailResponse,
  IndexListResponse,
} from "./types.ts";

// Used only when nothing has been published yet, so every response still names a version.
const DEFAULT_METHODOLOGY = "1.0";

function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

// Awaiting the plugin matters: rate-limit only covers routes added after it has loaded.
export async function buildApp(
  pool: Pool,
  options: {
    rateLimitPerMinute?: number;
    reportBoard?: ReportBoardConfig;
    // Per-index tolerance is on chain; the page needs the GRI value to mark dropped values.
    oracleToleranceBps?: number;
  } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(rateLimit, {
    max: options.rateLimitPerMinute ?? 60,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) =>
      Object.assign(new Error(`Too many requests, retry in ${context.after}`), {
        statusCode: 429,
      }),
  });

  // Public read-only data: GET is open to any origin, nothing else is allowed.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("access-control-allow-origin", "*");
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(errorBody("not_found", "No such route")),
  );

  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "request failed");
      return reply
        .code(500)
        .send(errorBody("internal_error", "Internal error"));
    }
    const code = status === 429 ? "rate_limited" : "bad_request";
    return reply
      .code(status)
      .send(
        errorBody(code, error instanceof Error ? error.message : "Bad request"),
      );
  });

  app.get("/health", async () => {
    await pool.query("select 1");
    return { status: "ok" };
  });

  app.get("/v1/indexes", async (): Promise<IndexListResponse> => {
    const classes = await listGpuClasses(pool);
    const indexes = [];
    let methodologyVersion =
      (await currentMethodology(pool)) ?? DEFAULT_METHODOLOGY;
    for (const gpuClass of classes) {
      const window = await loadWindow(pool, gpuClass.id);
      if (window.methodologyVersion)
        methodologyVersion = window.methodologyVersion;
      indexes.push(
        buildSnapshot({
          slug: gpuClass.id,
          gpuClass: gpuClass.sku,
          methodologyVersion: window.methodologyVersion ?? methodologyVersion,
          latest: window.rows.at(-1),
          series: buildSeries(window.rows, window.priorValue),
        }),
      );
    }
    return { methodologyVersion, isSample: false, indexes };
  });

  app.get<{ Params: { slug: string } }>(
    "/v1/indexes/:slug",
    async (request, reply) => {
      const gpuClass = (await listGpuClasses(pool)).find(
        (c) => c.id === request.params.slug,
      );
      if (!gpuClass) {
        return reply.code(404).send(errorBody("not_found", "Unknown index"));
      }
      const window = await loadWindow(pool, gpuClass.id);
      const methodologyVersion =
        window.methodologyVersion ??
        (await currentMethodology(pool)) ??
        DEFAULT_METHODOLOGY;
      const series = buildSeries(window.rows, window.priorValue);
      const latest = window.rows.at(-1);
      const inputs = latest
        ? await loadInputs(pool, gpuClass.id, latest.hour)
        : [];
      const kept = inputs
        .filter((input) => input.kept)
        .map((input) => input.priceMicro);
      const body: IndexDetailResponse = {
        methodologyVersion,
        isSample: false,
        index: buildSnapshot({
          slug: gpuClass.id,
          gpuClass: gpuClass.sku,
          methodologyVersion,
          latest,
          series,
        }),
        history: {
          endAt: series.endAt ? isoSeconds(series.endAt) : null,
          points: toHistoryPoints(series.points),
        },
        reportingSources: inputs.length,
        sources: inputs.map((input) => ({
          name: input.sourceId,
          priceMicroUsd: String(input.priceMicro),
          included: input.kept,
          // Inputs are stored per hour, not per fetch: the hour is the freshest time we can state.
          fetchedAt: isoSeconds(input.hour),
        })),
        medianMicroUsd: kept.length > 0 ? String(medianMicro(kept)) : null,
        twap24hMicroUsd: (() => {
          const twap = twap24h(series.points);
          return twap === null ? null : String(twap);
        })(),
      };
      return body;
    },
  );

  app.get("/v1/narratives", () => loadNarratives(pool));

  registerReportBoard(app, pool, options.reportBoard);

  app.get("/v1/oracle", async (_request, reply) => {
    const toleranceBps = options.oracleToleranceBps;
    if (toleranceBps === undefined) {
      return reply
        .code(503)
        .send(
          errorBody(
            "oracle_not_configured",
            "ORACLE_TOLERANCE_BPS is not set on this deployment",
          ),
        );
    }
    const classes = await listGpuClasses(pool);
    const labels = indexLabels(classes.map((c) => `GRI-${c.id.toUpperCase()}`));
    return loadOracleView(pool, toleranceBps, labels);
  });

  const marketLabels = async () =>
    indexLabels(
      (await listGpuClasses(pool)).map((c) => `GRI-${c.id.toUpperCase()}`),
    );
  const unixNow = () => Math.floor(Date.now() / 1000);

  app.get("/v1/markets", async () => ({
    markets: await listMarkets(pool, await marketLabels(), unixNow()),
  }));

  app.get<{ Params: { address: string } }>(
    "/v1/markets/:address",
    async (request, reply) => {
      const { address } = request.params;
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return reply
          .code(400)
          .send(
            errorBody(
              "bad_address",
              "Market address must be 0x and 40 hex digits",
            ),
          );
      }
      const market = await findMarket(
        pool,
        address,
        await marketLabels(),
        unixNow(),
      );
      if (!market) {
        return reply
          .code(404)
          .send(errorBody("market_not_found", `No market at ${address}`));
      }
      return market;
    },
  );

  return app;
}
