import type { Pool } from "pg";
import { numericToMicro } from "./money.ts";
import { HISTORY_HOURS, HOUR_MS, type HourRow } from "./series.ts";
import type { IndexStatus } from "./types.ts";

export type GpuClass = { id: string; sku: string };

export type InputRow = {
  sourceId: string;
  priceMicro: bigint;
  kept: boolean;
  hour: Date;
};

type HourlyRecord = {
  hour: Date;
  value: string | null;
  valid_sources: number;
  status: IndexStatus;
  methodology_version: string;
};

export type HourlyWindow = {
  rows: HourRow[];
  priorValue: bigint | null;
  methodologyVersion: string | null;
};

export function indexIdFor(gpuClassId: string): string {
  return `gri-${gpuClassId}`;
}

export async function listGpuClasses(pool: Pool): Promise<GpuClass[]> {
  const result = await pool.query<GpuClass>(
    "select id, sku from gpu_classes order by id",
  );
  return result.rows;
}

export async function loadWindow(
  pool: Pool,
  gpuClassId: string,
): Promise<HourlyWindow> {
  const indexId = indexIdFor(gpuClassId);
  const latest = await pool.query<{ hour: Date }>(
    "select max(hour) as hour from gri_hourly where index_id = $1",
    [indexId],
  );
  const end = latest.rows[0]?.hour;
  if (!end) return { rows: [], priorValue: null, methodologyVersion: null };
  const from = new Date(end.getTime() - (HISTORY_HOURS - 1) * HOUR_MS);
  const hourly = await pool.query<HourlyRecord>(
    `select hour, value::text as value, valid_sources, status, methodology_version
       from gri_hourly where index_id = $1 and hour >= $2 order by hour`,
    [indexId, from],
  );
  const prior = await pool.query<{ value: string }>(
    `select value::text as value from gri_hourly
      where index_id = $1 and hour < $2 and value is not null
      order by hour desc limit 1`,
    [indexId, from],
  );
  const priorValue = prior.rows[0] ? numericToMicro(prior.rows[0].value) : null;
  const rows = hourly.rows.map((row) => ({
    hour: row.hour,
    valueMicro: row.value === null ? null : numericToMicro(row.value),
    validSources: row.valid_sources,
    status: row.status,
  }));
  const methodologyVersion = hourly.rows.at(-1)?.methodology_version ?? null;
  return { rows, priorValue, methodologyVersion };
}

export async function loadInputs(
  pool: Pool,
  gpuClassId: string,
  hour: Date,
): Promise<InputRow[]> {
  const result = await pool.query<{
    source_id: string;
    price: string;
    kept: boolean;
  }>(
    `select source_id, price::text as price, kept
       from gri_inputs where index_id = $1 and hour = $2 order by source_id`,
    [indexIdFor(gpuClassId), hour],
  );
  return result.rows.map((row) => ({
    sourceId: row.source_id,
    priceMicro: numericToMicro(row.price),
    kept: row.kept,
    hour,
  }));
}

export async function currentMethodology(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ methodology_version: string }>(
    "select methodology_version from gri_hourly order by hour desc limit 1",
  );
  return result.rows[0]?.methodology_version ?? null;
}
