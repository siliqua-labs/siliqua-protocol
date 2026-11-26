# GRI methodology v1.0

Status: draft for owner review. Items marked **Proposed** are not in the owner decisions (PLAN 2.3) and need confirmation before they are frozen. Everything else restates a binding decision.

## 1. What the index is

GRI is the market price of renting one GPU for one hour, in USD per GPU-hour, one value per hour per class.

- Unit: USD per GPU-hour. Published with 6 decimals; stored as an integer count of micro-USD (`value * 10^6`).
- Arithmetic: integers or `Decimal`. No floats anywhere in the index path.
- Time: UTC. Hour `H` covers `[H:00:00, H+1:00:00)`.
- Functions are pure and deterministic. The same inputs and the same package version give the same output.

## 2. Classes

One class is one SKU. PCIe and other variants are excluded in v1.

| Class | SKU |
| --- | --- |
| h100 | H100 80GB SXM |
| h200 | H200 SXM |
| b200 | B200 |
| a100 | A100 80GB |
| 4090 | RTX 4090 24GB |

The SKU table is versioned and published with the methodology. A GPU name that does not match exactly one SKU is dropped and logged, never guessed.

## 3. What counts as a source quote

A source is one provider. Its quote for a class must be:

- On-demand, no commitment. Spot, interruptible, reserved and bid prices are excluded.
- In USD per GPU-hour. A node or instance price is divided by the GPU count only when the price covers the GPUs alone or the provider lists a per-GPU price. Otherwise the quote is dropped.
- Rentable: a listed price with no stock is not a quote, where the provider exposes availability.

Marketplaces (many offers, host-set prices) count as one source. Their quote is the median of reliable on-demand offers for the class. A median of an even count is the mean of the two middle values, rounded half up.

**Proposed:** a source's hourly quote is the median of its valid observations inside the hour. A source is present in an hour if it has at least one valid observation. The collector runs every 10 minutes, so up to 6 observations per hour.

## 4. Hourly computation

Inputs: one quote per source for the class and hour.

1. Compute the median `m` of the quotes (even count: mean of the two middle values, rounded half up).
2. Compute `MAD = median(|x - m|)`.
3. Compute the bound `b = 3 * max(1.4826 * MAD, 0.01 * m)`. Use `1.4826 = 14826 / 10000` as an exact rational.
4. Drop every quote with `|x - m| > b`. A quote exactly at the bound is kept.
5. Count the remaining quotes: `valid_sources`.
6. If `valid_sources < 5`, the hour is **not published** for that class and is marked stale. The minimum is checked after the outlier filter (owner decision 2026-11-23, replacing the PLAN N1 default of 5 before and 4 after).
7. Otherwise GRI is the weighted median of the kept quotes (decision 2026-11-26). With equal weights this is the median: the middle value, or for an even count the mean of the two middle values, rounded half up to the micro-USD.

The 1% floor in step 3 keeps the bound meaningful when `MAD = 0`.

## 5. Weights

All sources have `w = 1` in v1. The weight function is selected by the methodology version, so a later version can change it without changing this one. The weight of each source is stored with its input (`gri_inputs.weight`).

## 6. Staleness and publication

- A class below the minimum in an hour is not published for that hour. No carried-forward value is shown as live.
- Every response carries `methodologyVersion`, `valid_sources` and a status:
  - `LIVE`: at least 5 sources survive the outlier filter and a value is published.
  - `INSUFFICIENT_SOURCES`: at least one source quoted in the hour, but fewer than 5 survive. No value.
  - `STALE`: no source quoted at all in the hour. No value.
  Both non-live statuses count as stale hours in the TWAP (section 7).
- An hour is computed only after it has ended. A stored hour is never rewritten, so a late observation does not change a published value. Recomputing the same inputs with the same package version gives the same `input_hash`.
- Each hourly value stores `input_hash`, computed over the normalised inputs, the methodology version and the package version.
- Per-source raw prices are displayed only where the source's terms allow it; otherwise only the aggregate is shown, marked on `/methodology`. See `docs/sources.md`.

## 7. TWAP for markets

The settlement value is the 24-hour TWAP of hourly GRI over the market's TWAP window.

- Empty hours (class not published) are skipped and counted as stale. They do not enter the average.
- The TWAP is the mean of the published hourly values in the window, rounded half up to the micro-USD.
- If the cumulative stale time in the window exceeds 6 hours, the market is void and fully refunded. Cumulative, not contiguous.
- `TWAP > threshold` is YES. Equal is NO.

## 8. Limits

- Sources are self-reported listings, not executed trades. A listed price can differ from what a renter pays.
- Provider terms on storing and republishing price data are unresolved for several sources. See `docs/sources.md`.
- The oracle in v1 has three operators, all from one team, on an allowlist. There is no stake and no slashing. This limit is stated on `/oracle` and `/methodology`.
- Fewer than 5 valid sources in a class means no value, not a lower-quality value.

## 9. Changes

A new methodology version takes effect no earlier than 14 days after it is announced, enforced in code. The package version that implements a version is recorded with each value.

## 10. Open items

1. Per-source hourly quote and presence rule (section 3, Proposed).
2. Age and display of the latest value when the current hour is stale.
3. Whether a quote exactly at the bound is kept (this draft keeps it).
