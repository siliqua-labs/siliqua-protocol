import type { Address, Hex } from "viem";

export const WEEK_SECONDS = 7 * 24 * 3600;
// Mirrors RangeMarket.SETTLE_DELAY; settle() reverts before twapTo plus this.
export const SETTLE_DELAY_SECONDS = 3 * 3600;
// A market still open this long after it became settleable means settle keeps failing.
export const SETTLE_ALERT_SECONDS = 3600;
// Markets must stay open for betting at least this long, or the week is skipped.
export const MIN_BETTING_SECONDS = 24 * 3600;

export const STATUS_OPEN = 0;
export const STATUS_SETTLED = 1;

export type MarketState = {
  address: Address;
  indexId: Hex;
  closeTime: number;
  twapTo: number;
  status: number;
  expiresAt: number;
  feeUnswept: bigint;
};

export type KeeperChain = {
  blockTime(): Promise<number>;
  listMarkets(): Promise<MarketState[]>;
  latestValue(indexId: Hex): Promise<bigint>;
  createMarket(
    indexId: Hex,
    threshold: bigint,
    closeTime: number,
  ): Promise<Hex>;
  settle(market: Address): Promise<Hex>;
  sweepFees(market: Address): Promise<Hex>;
};

export type KeeperConfig = {
  indexId: Hex;
  // Any past or future close time of the weekly series; later ones are anchor + k weeks.
  closeAnchor: number;
};

export type Logger = {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
  error(fields: object, message: string): void;
};

/** First weekly close time that still leaves bettors at least MIN_BETTING_SECONDS. */
export function nextCloseTime(now: number, anchor: number): number {
  const earliest = now + MIN_BETTING_SECONDS;
  if (anchor >= earliest) return anchor;
  const weeks = Math.ceil((earliest - anchor) / WEEK_SECONDS);
  return anchor + weeks * WEEK_SECONDS;
}

export function settleable(market: MarketState, now: number): boolean {
  return (
    market.status === STATUS_OPEN &&
    now >= market.twapTo + SETTLE_DELAY_SECONDS &&
    now < market.expiresAt
  );
}

/**
 * One pass. A failing transaction is logged and does not stop the other actions: a market that
 * cannot settle must not stop fee sweeps or the next weekly market.
 */
export async function keepOnce(
  chain: KeeperChain,
  config: KeeperConfig,
  log: Logger,
): Promise<void> {
  const now = await chain.blockTime();
  const markets = await chain.listMarkets();

  for (const market of markets) {
    if (settleable(market, now)) {
      await attempt(log, "settle", market.address, () =>
        chain.settle(market.address),
      );
      if (now >= market.twapTo + SETTLE_DELAY_SECONDS + SETTLE_ALERT_SECONDS) {
        log.error(
          { market: market.address, expiresAt: market.expiresAt },
          "market past its settle time and still open",
        );
      }
    } else if (market.status === STATUS_OPEN && now >= market.expiresAt) {
      log.error(
        { market: market.address },
        "market expired unsettled; stakers must refund",
      );
    }
    if (market.status === STATUS_SETTLED && market.feeUnswept > 0n) {
      await attempt(log, "sweepFees", market.address, () =>
        chain.sweepFees(market.address),
      );
    }
  }

  const closeTime = nextCloseTime(now, config.closeAnchor);
  const exists = markets.some(
    (m) => m.indexId === config.indexId && m.closeTime === closeTime,
  );
  if (!exists) {
    await attempt(log, "createMarket", String(closeTime), async () => {
      // Default policy: threshold is the latest finalized value, so the question is "higher
      // or not than now". Pending owner confirmation (plan open question).
      const threshold = await chain.latestValue(config.indexId);
      return chain.createMarket(config.indexId, threshold, closeTime);
    });
  }
}

async function attempt(
  log: Logger,
  action: string,
  target: string,
  run: () => Promise<Hex>,
): Promise<void> {
  try {
    const tx = await run();
    log.info({ action, target, tx }, "keeper action sent");
  } catch (error) {
    log.error(
      {
        action,
        target,
        error: error instanceof Error ? error.message : String(error),
      },
      "keeper action failed",
    );
  }
}
