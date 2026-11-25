# Sources - GPU price providers

Survey for ROADMAP task 2.1 (PLAN 0.1). Read from official pages on 2026-11-22. Social platforms are added in a later phase.

Rules for this file:

- Every fact has an official URL. "Not found" means the page read did not say; it does not mean the answer is no.
- "Unverified" means the page could not be read or only a model summary of it was seen. Verify before use.
- Terms of service are not legal advice. The owner decides per source after review (open question A4).
- Costs are listed only as the pages state them. No cost is approved.

## Summary

None of the first-party candidates has a clear written permission to store prices and use them in a published index. Two terms are explicitly against it. The rest are silent or unreadable on the API. No source is ready to be switched on until the owner decides on the terms.

| Provider | API for prices | Key | Rate limit | Terms on index or republish | Status |
| --- | --- | --- | --- | --- | --- |
| Vast.ai | Yes, offers search | Required | Not found | Prohibits building an index or market-data product without a written agreement | Blocked by terms |
| RunPod | Yes, GPU catalog | Required | Header-reported, example 180/min | Prohibits automated access and derivative works of the Service (verbatim); other clauses seen only as a summary | Needs written permission |
| Lambda | Yes, instance types (schema unverified) | Required | About 1 request/s | No clause on price data found; part of the terms only summarized | Unverified, ask |
| TensorDock | Yes, locations and hostnodes | Required | 100/min per organization | Website terms bar scraping and republishing; API not named | Ask |
| Hyperstack | Yes, pricebook and flavors | Required | 500/min per IP | No clause on price data found; bars derivative works of the Services | Pricebook is account-specific; ask |
| Shadeform | Yes, instance types | Unclear | Not found | Terms page not readable | Unverified |
| Akash | No price API; public web table (not hourly); `/v1/providers` has capacity only | Not applicable | Not found | No license stated | Disabled in v1 unless owner approves scraping |
| io.net | Yes, CaaS hardware list | Required | Not found | Not found | Price unit unknown |
| Texel | `GET /gpus` lists open GPU ids only, no prices; prices only on the marketplace web page | Not needed for `/gpus` | Not found | No terms page found | No price API; scraping needs owner decision |
| Verda | Yes, `GET /v1/instance-types`, public without a key | Not needed | 500/min per project (authenticated); none stated for open endpoints | Clauses 1 to 8.4 do not bar automated reads or index use; clause 3.3 makes the pricing page their IP; AUP summary bars malicious scrapers and derivative works | Ask; internal testing only |
| Vultr | Not read | Unknown | Unknown | Not read | Unverified, site refused automated reads |
| getdeploying.com | Yes, aggregator | Bearer, paid | 3,000 per day | Derived products allowed, redistribution of raw data prohibited | Aggregator, not independent |
| GPUPerHour | Yes, aggregator | Documented as none | Not stated | Programmatic access requires a license | Aggregator, owner conflict of interest |
| GPUs.io | Not read | Unknown | Unknown | Not read | Unverified, all pages returned 403 |

Texel (named in the brief) is documented at https://texel.run/docs; see the Texel section. Its API has no key for prices and no stated terms, but no response schema either.

## Price semantics to settle before the methodology (2.5)

The index is USD per GPU-hour. Providers differ, so the collector must normalize and the methodology must say how:

- Per GPU or per instance: RunPod, TensorDock and Lambda list per GPU. Vast.ai `dph_total` and Hyperstack are per offer or flavor; divide by GPU count where the docs do not say.
- On-demand versus spot or interruptible: Vast.ai `type` (ondemand, bid, reserved), RunPod Secure versus Community, Hyperstack `-spot` suffix, Shadeform `rental_type`. v1 should use on-demand only (decision for open question Q-B1).
- SXM versus PCIe: usually only in the GPU name string, not a field.
- Marketplaces (Vast.ai, TensorDock, Akash) give many offers with different prices; the collector must reduce them to one number per hour (for example the median of rentable offers). That rule belongs in the methodology.
- Availability: only some providers expose stock. A listed price with no stock is not a rentable price.

## Vast.ai

- Docs: https://docs.vast.ai/api-reference/search/search-offers , https://docs.vast.ai/guides/instances/pricing.md , https://vast.ai/developers/api
- Endpoint: the reference lists `POST https://console.vast.ai/api/v0/bundles`. The developers page lists `GET https://cloud.vast.ai/api/v0/bundles/?q=...`. Live calls on 2026-11-23 with a key holding only Instances: Read returned HTTP 200 on both. The collector uses the POST form.
- Live findings (2026-11-23, not in the docs): `gpu_name` filters need spaces (`"H100 SXM"`); underscores return 0 offers. One query with `gpu_name in [...]` and `limit: 1000` returned all offers with `truncated: false`. `dph_base` divided by `num_gpus` is the per-GPU compute price (it scaled exactly with `num_gpus` on live offers); `dph_total` adds a small storage charge. Neither field is defined in the docs. The name `A100 SXM4` mixes 40GB and 80GB, and `RTX 4090` mixes 24GB and 48GB, so the collector filters by `gpu_ram`. Responses carry `X-RateLimit-Limit: 30` although the rate-limit page says no such header is set; the window is not stated.
- Collector (`workers/price-collectors`, provider `vastai`): median of verified, rentable, on-demand offers with reliability of at least 0.95 per class. The 0.95 threshold is a proposal. Off unless `COLLECTOR_VASTAI_ENABLED=true`, internal testing only until a written agreement exists.
- Auth: `Authorization: Bearer <key>`, key from https://cloud.vast.ai/manage-keys/. Free or paid account: not stated. Instances need account credit.
- Rate limit: not found.
- Fields: `dph_total` ($/hour), `min_bid` (interruptible), `gpu_name`, `num_gpus`, `gpu_ram` (MB), `geolocation`, `type` (ondemand, bid, reserved), `rentable`, `verified`. No stock count. SXM or PCIe only in `gpu_name`.
- Price meaning: listed price of one offer, hosts set their own prices. Per GPU or per instance is not stated.
- Terms (https://vast.ai/terms, version September 1, 2026): prohibited activity 10 bars using the services "to construct, publish, or maintain any index, benchmark, pricing-comparison service, market-data product" and redistributing any feed or dataset, unless a separate written agreement allows it. Prohibited activity 7 bars bulk or automated retrieval, caching and storage without written permission. The Authorized Data grant allows use only to evaluate or buy services and to inform your own pricing.
- Verdict: needs a written agreement before any use in the index.

## RunPod

- Docs: https://docs.runpod.io/api-reference-v2/catalog/list-gpu-types.md , https://docs.runpod.io/references/gpu-types . The GraphQL spec page returned 403 and was not read.
- Endpoint: `GET https://api.runpod.io/v2/catalog/gpus`, optional `include=AVAILABILITY` with `product`, and `cloud=SECURE|COMMUNITY`.
- Auth: Bearer key with scope `catalog:read`, created in the console. Free or paid: not stated.
- Rate limit: per user across all `/v2` routes, reported in `RateLimit` headers. The example policy is 180 per minute, 3,600 per hour, 43,200 per day; read the headers, do not hard-code. A live call on 2026-11-23 returned `"minute";q=180;w=60, "hour";q=7200;w=3600, "day";q=86400;w=86400`, so the docs example differs from the live policy.
- Live findings (2026-11-23, key with only the Catalog: Read scope, HTTP 200, 46 GPUs): the five ids used by the collector all exist (`NVIDIA H100 80GB HBM3`, `NVIDIA H200`, `NVIDIA B200`, `NVIDIA A100-SXM4-80GB`, `NVIDIA GeForce RTX 4090`) and match the docs. Secure and Community prices differ a lot (H100: 4.39 vs 2.69 USD per GPU-hour), so which cloud enters the index is a methodology choice; the collector uses Secure. The `A100-SXM4-40GB` id has `secure: false` and price 0.
- Fields: `price.secure`, `price.community` (USD per hour for a single GPU), `id`, `name`, `memory` (GB), `maxCount`, `availability` (NONE, LOW, MEDIUM, HIGH). SXM or PCIe only in the ID. No spot field.
- Price meaning: list price per GPU. Negotiated discounts are not reflected.
- Terms (https://www.runpod.io/legal/terms-of-service, last updated March 24, 2026): section 6 bars access "through automated or non-human means" and making "derivative works of ... any part of the Service". Section 9 restrictions on systematic retrieval and commercial use were seen only as a summary; unverified. The terms do not mention the catalog API.
- Verdict: ask RunPod in writing whether the catalog API may feed a published index.

## Lambda

- Docs: https://docs.lambda.com/api/cloud (redirected from docs.lambda.ai), pricing https://lambda.com/service/gpu-cloud/pricing
- Endpoint: `GET https://cloud.lambda.com/api/v1/instance-types`. The response schema was not reached; fields such as `price_cents_per_hour` are unverified here.
- Auth: `Authorization: Bearer <key>`, from https://cloud.lambda.com/api-keys . Free or paid: not stated.
- Rate limit: "generally limited to one request per second".
- Price meaning: the pricing page lists price per GPU per hour, excluding tax.
- Terms (https://lambda.com/legal/terms-of-service, last updated August 2025): the API falls under the Cloud Terms of Service. No clause on caching or republishing price data found. Parts were read only as a summary.
- Key: Lambda requires a payment method before it issues an API key, so the collector does not use the API. It reads the public page https://lambda.com/pricing instead (the old `/service/gpu-cloud/pricing` answers 301 to it). `robots.txt` does not disallow it.
- Page structure (read 2026-11-23): the "Instances pricing" section has four tables, one per GPU count (tabs 8x, 4x, 2x, 1x; the order is inferred from vCPU counts 208, 104, 52, 26), with price per GPU per hour before tax. Per-GPU prices differ by count (B200 SXM6: 7.79, 7.89, 7.99; H100 SXM: 4.69, 4.79, 4.89). The 1-Click Cluster tables are reserved capacity (2 weeks to 1 year, 16+ GPUs) and are not read.
- Collector (`lambda`): reads only the HGX 8-GPU plans: H100 80GB (4.59), B200 (7.69) and A100 80GB (3.19). One consistent configuration, three classes. Lambda lists no H200 or RTX 4090. Off unless `COLLECTOR_LAMBDA_ENABLED=true`.
- Verdict: usable by scraping the public page; terms have no clause on price data, but parts were read only as a summary. Ask Lambda in writing about index use.

## TensorDock

- Docs: https://dashboard.tensordock.com/api/docs/getting-started , https://dashboard.tensordock.com/api/docs/fetch-hostnodes
- Endpoints: `GET https://dashboard.tensordock.com/api/v2/locations` and `/hostnodes`.
- Auth: Bearer token from the Developer Settings page. Account is pay as you go, from 5 USD.
- Rate limit: 100 requests per minute per organization.
- Fields: `gpus[].price_per_hr` (per GPU, with separate vCPU, RAM and storage charges), `v0Name` (includes SXM or PCIe and VRAM), `max_count`, `availableCount`, location. No spot field on the pages read.
- Terms (https://docs.tensordock.com/legal-information/terms-of-service-tos.md, last updated September 24, 2024): section 5.2 bars copying, distributing, publishing or creating derivative works of information from the Platform, and using scrapers. The terms cover the website Platform and do not name the API.
- Verdict: ask whether the API is covered by section 5.2.
- Collector (`tensordock`, off by default, needs `TENSORDOCK_API_KEY`): reads `/api/v2/locations` and takes the median `price_per_hr` across locations with stock. Only `h100-sxm5-80gb` and `geforcertx4090-pcie-24gb` are mapped, because the docs show no other model ids. Its test payload follows the docs, not a live recording; after the first call with a key, check the logged unmapped ids, map A100, H200 and B200, and re-record the fixture.

## Hyperstack

- Docs: https://docs.hyperstack.cloud/docs/api-reference/get-pricebook , https://docs.hyperstack.cloud/docs/api-reference/list-flavors , https://docs.hyperstack.cloud/docs/api-reference/rate-limits
- Endpoints: `GET https://infrahub-api.nexgencloud.com/v1/pricebook` and `/v1/core/flavors`. Header `api_key`.
- Auth: key from the console API Keys page. Fee: not found.
- Rate limit: 500 requests per minute per source IP.
- Fields: the pricebook `value` is "The hourly rate your account is billed", so it can include account discounts; it has no GPU count or region. Flavors give `gpu`, `gpu_count`, `region_name`, `stock_available`. VRAM and SXM or PCIe appear only on the public pricing page.
- Price meaning: per GPU rate multiplied by GPU count gives the flavor cost. The public list price is on https://hyperstack.cloud/gpu-pricing , readable without a key.
- Terms (https://www.hyperstack.cloud/terms-and-conditions, version dated 13 January 2026): clause 6.4 bars derivation or appropriation of the Services and creating derivative works, unless agreed in writing. No clause on caching or republishing price data found.
- Public page read 2026-11-23: https://www.hyperstack.cloud/gpu-pricing is server-rendered; `robots.txt` allows all paths except preview and preference pages. The "On-Demand GPU Pricing" table lists name, VRAM, max pCPUs, max RAM and price per hour: H200 SXM 3.99, H100 SXM 3.20, A100 SXM 1.60, B200 6.00 (also NVLink, PCIe and other models, not mapped).
- Verdict: the collector (`hyperstack`) reads the public page, no key, and is off by default. It maps SXM H100 and A100 80GB, H200 141GB and B200 192GB only. Reading the page needs the same owner decision as Akash; ask Hyperstack about index use.

## Shadeform

- Docs: https://docs.shadeform.ai/api-reference/instances/instances-types.md
- Endpoint: `GET https://api.shadeform.ai/v1/instances/types`, header `X-API-KEY`. The docs say all requests need a key, but the OpenAPI operation declares no security; unverified which is true.
- Fields: `hourly_price` (integer cents, on-demand), `gpu_type`, `num_gpus`, `interconnect` (pcie or sxm), `availability[]` with `region`, `available`, `rental_type` (on_demand or spot). Per GPU or per instance is not stated.
- It aggregates 30+ clouds and says it charges the same as going direct, so it is not independent of those providers.
- Rate limit: not found. Terms: the terms URL returned 404; unverified.

## Salad

- Page: https://salad.com/pricing (redirects to `/pricing/`), read 2026-11-23. Server-rendered, no key, `robots.txt` allows all paths except `/cdn-cgi/`. No API for prices was looked for or found.
- Table "GPU instances": USD per GPU-hour, vCPU and RAM included, in four priority tiers. RTX 4090 24GB: High 0.440, Medium 0.347, Low 0.253, Lowest 0.160. The page says higher tiers are protected from preemption and Lowest is the most interruptible.
- Verdict: the collector (`salad`, off by default) reads the High tier, the closest to an on-demand price. The tier is a methodology decision for the owner. Salad rents consumer GPUs, so only RTX 4090 maps to a v1 class. Terms were not read: ask Salad about index use before go-live.

## Akash

- Page: https://akash.network/pricing/gpus/ (updated November 20, 2026; re-read 2026-11-23). No API for GPU prices is linked or named on it, and "Network Data API" is not mentioned.
- Fields: GPU model, VRAM, interface, "Avg. price / GPU-hr" in USD. No count, region, spot or availability. Next-gen GPUs (B300, B200, Vera Rubin) show "Request access" instead of a price.
- Price meaning: recent provider bids weighted by each provider's GPU count. Sample size and window are not stated. The page updates periodically, not hourly, so it is not an hourly series.
- Terms: no license or redistribution text found on the page. Footer links were not read, the terms page was not located, and `robots.txt` was not checked.
- Console API: https://akash.network/docs/api-documentation/console-api documents the managed wallet API (`x-api-key`, `POST /v1/deployments`, `GET /v1/bids?dseq=...`, `POST /v1/leases`). It does not mention `/v1/providers`; no rate limit, license or terms text found.
- `GET https://console-api.akash.network/v1/providers`: public, no key, HTTP 200, JSON array of about 4.1 MB with no pagination seen. 56 keys per provider, including `stats.gpu {active, available, pending, total}`, `gpuModels`, `uptime1d/7d/30d`, `isOnline`, `lastCheckDate`. It has no price field, only capacity and status. Only the first 40 KB was read verbatim; the provider count and GPU model fields are unverified. `/v1/swagger` is an empty stub and there are no official docs for this endpoint, so it can change without notice.
- Page read 2026-11-23: `robots.txt` allows all paths except for one scraper (Bytespider). The table is server-rendered. Priced rows: H100 80GB SXM5 (2.73), A100 80GB SXM4 (1.67), RTX 4090 24GB PCIe (0.36), plus about 20 other GPUs. H200 is absent and B200 shows "Request access". The collector (`akash`) maps only those three and rejects the page if "Prices updated" is more than 7 days old (a proposal) or in the future.
- Verdict: the collector exists and is off by default. The page updates periodically, not hourly, so it is a slow source: each 10-minute read repeats the same value until Akash updates. The index methodology must say how a repeated page value counts as "fresh". Reading the public table still needs an owner decision on scraping.

## io.net

- Docs: https://io.net/docs/reference/caas/get-hardware-list.md
- Endpoint: `GET https://api.io.solutions/enterprise/v1/io-cloud/caas/hardware`, header `x-api-key`, key must belong to an io-cloud project.
- Fields: `hardware_name`, `available`, `location`, `price`. The unit of `price` is not stated. No spot, SXM or PCIe field. Rate limit and terms: not found.
- Verdict: unit and terms must be confirmed first.

## Texel

- Docs: https://texel.run/docs , https://texel.run/api , https://texel.run/marketplace (read 2026-11-23).
- Endpoint: `GET https://texel.run/api/v1/gpus`, described as "The GPUs open to rent now. No key needed." The docs give no example request or response.
- Auth: none for `/gpus`. Other endpoints use `Authorization: Bearer txk_...`, keys made by a signed-in wallet. Whether `/gpus` is free is not stated explicitly.
- Rate limit: not found. The docs mention only a per-key daily spend cap, which does not apply to `/gpus`.
- Live call 2026-11-23 (one GET, no key, HTTP 200, `Cache-Control: no-store`): the body is `{"open": ["rtx-4090", "h100-sxm", ...]}`, a list of 28 GPU ids that are open to rent. **It has no prices.** So `GET /gpus` is availability only and cannot feed the index.
- Prices: only on https://texel.run/marketplace (web page, no documented API): name, VRAM, a listed price and a Texel price per GPU-hour. SXM or PCIe appears only in the name. No spot or on-demand distinction found. Using it means scraping.
- Price meaning: per GPU-hour, billed by the second. The Texel price is the listed price at 30% off at launch, and Serverless tiers show other hourly rates. Which of these enters the index is a methodology decision (2.5).
- Terms: no terms, privacy or data-use page found on the pages read.
- Page read 2026-11-23: server-rendered HTML, 28 listings, each "name, VRAM, Listed at $x, on Texel $y, /hr". `robots.txt` allows `/` and disallows `/api/`, so the collector reads the marketplace page and never `/api/`. All five v1 classes are listed (SXM variants).
- Two prices per GPU: "Listed" (for example H100 SXM 3.99) and "on Texel" (2.79). The second looks like a launch discount of about 30%. The collector uses the listed price so the series does not jump when the discount ends. Owner to confirm.
- Independence: the listed prices equal RunPod Secure for H200 (5.29), B200 (7.99) and RTX 4090 (0.89), and differ for H100 and A100. Texel may resell capacity at another provider's list prices. Until that is clarified, do not count it as an independent source toward the 5-source minimum.
- Verdict: no price API; the collector (`texel`) scrapes the page and is off by default. Terms are not found, so ask Texel in writing about index use. `/gpus` can serve only as an availability signal.

## Verda

- Docs: https://api.verda.com/v1/docs (OpenAPI at `/v1/openapi.json`), changelog entry 2026-03-19 states that `/v1/instance-types` and a few other endpoints are public. Read 2026-11-25.
- Terms: https://verda.com/terms-and-conditions (last updated October 30, 2026), clauses 1 to 8.4 read verbatim. No clause on scraping, republishing prices or indexes. Clause 3.3 makes the pricing page ("Service Description") their intellectual property. Schedule 1 (acceptable use) was seen only as a model summary: bars malicious scrapers and bots, derivative works of the Service, and a competing product. Verify the wording on the live page before relying on it.
- Live call 2026-11-25 (one GET, no key, HTTP 200, 84 instance types): each type has `location_prices` (FIN-01 to FIN-03) with `price_per_hour` as a string, `currency` `usd`, `gpu.number_of_gpus` and `name`. Single-GPU on-demand: B200 SXM6 180GB 9.844 / 9.844 / 9.508, H200 SXM5 141GB 7.184 / 6.701 / 6.701, H100 SXM5 80GB 5.241, A100 SXM4 80GB 2.386. Third-party blogs list far lower B200 prices; the API is the source.
- Collector (`verda`): single-GPU instances of the four SXM models only, median across locations, `CC` variants and other memory sizes ignored. Availability is a separate endpoint and is not read, so a listed price may have no stock. Off unless `COLLECTOR_VERDA_ENABLED=true`. Internal testing until Verda confirms index use in writing.

## Vultr

`https://www.vultr.com/api/` returned 403 to automated reads. Nothing about its plans endpoint, key, limits or terms is verified.

## Aggregators (listed for completeness, not preferred)

An aggregator is not independent of the providers it reads, and its terms often stop at "derived products allowed, redistribution not allowed".

- getdeploying.com: https://getdeploying.com/api , https://getdeploying.com/terms . `GET /api/gpu-offerings` with Bearer key. 100 free trial requests, then 499 USD per month or 4,990 USD per year, 3,000 requests per day. Fields include `hourly_per_gpu`, `interconnect`, `billing_type`, availability and `last_verified`. Prices are "the price the provider published when we checked". Terms section 10 allows Derived Products "and commercialize them" and bars redistributing raw API Data. It reads each provider's public pages and APIs, covering 94 providers.
- GPUPerHour: https://gpuperhour.com/terms . Its docs call the API free with no key, but its terms say "Any programmatic access to pricing data requires a commercial license agreement." The operator also runs a provider listed in the data, which is a conflict for an independence test.
- GPUs.io: every page returned 403; unverified.

## Social platforms (CMI)

Read 2026-11-24 from official documentation. Costs are as the pages state them and none is approved. "Not stated" means the pages read do not address it; it does not mean permitted. Figures marked "arithmetic" are ours, not from the docs.

| Platform | Reads by keyword | Cost as stated | Terms on storing, deriving, publishing | Status |
| --- | --- | --- | --- | --- |
| X | Recent search, filtered stream | Pay per usage, 0.005 USD per post read, cap 3 million reads per month | Redistribute Post IDs only; stored content must be kept current and deletions honored within 24h; training a foundation or frontier model is barred | Costed; ask owner |
| Farcaster | Neynar `GET /v2/farcaster/cast/search`, or a self-run Snapchain node | Neynar Free 10M credits per month (confirmed on the plans page); Scale 249 USD per month, 60M credits; measured 10 credits per cast returned by search; Snapchain needs 16 GB RAM, 4 cores, 2 TB disk | Neynar terms not readable (404); Farcaster pages state no licence | Live-tested 2026-11-25; terms unverified |
| Bluesky | `app.bsky.feed.searchPosts` on the PDS, authenticated with an app password session | No charge seen in live calls; no pricing page read | Terms of Service do not address third-party storage, derived data or scraping | Live-tested 2026-11-25; terms unverified |
| Telegram | Not clear for public channels | API free | Bars aggregating platform data to train AI models; bot terms bar collecting large datasets from public channels | Recommended not in v1 |

### X

- Docs: https://docs.x.com/x-api/getting-started/pricing , https://docs.x.com/x-api/fundamentals/rate-limits , https://docs.x.com/developer-terms/policy , https://docs.x.com/developer-terms/agreement , https://docs.x.com/developer-guidelines.md
- Pricing: "The X API uses pay-per-usage pricing with no subscriptions." Post read 0.005 USD per resource, user read 0.010 USD. "Pay-per-usage plans are capped at 3 million Post reads per monthly billing cycle." The Developer Agreement (updated April 27, 2026) still speaks of a recurring monthly subscription fee; the two pages are not reconciled. The guidelines say free tier is non-commercial only; what a free tier can read is not stated.
- Endpoints and limits: recent search 450 per 15 minutes per app, 100 results max per call; filtered stream 1 connection, 1000 rules, 250 posts per second; full-archive search 1 per second.
- Policy: "If you provide X Content to third parties, including downloadable datasets or via an API, you may only distribute Post IDs, Direct Message IDs, and/or User IDs." "If you store X Content offline, you must keep it up to date with the current state of that content on X." Agreement III.A(k) bars using the API or X Content to "fine-tune or train a foundation or frontier model"; the guidelines table marks AI or ML training on X data as prohibited except by Grok.
- Not stated: storing post text, derived labels and scores, aggregate statistics, a published index. Whether an index is a derivative work is our inference, not text. Display Requirements and the Restricted Use Cases page were not read.
- Cost arithmetic: reads cost 0.005 USD each, so 1,000 posts per day is about 150 USD per month, 10,000 per day about 1,500 USD, 3M per month (the cap) 15,000 USD. The CMI volume is not set yet.

### Farcaster

- Docs: https://docs.neynar.com/reference/what-are-the-rate-limits-on-neynar-apis.md , https://docs.neynar.com/reference/compute-units.md , https://docs.neynar.com/reference/search-casts.md , https://snapchain.farcaster.xyz/getting-started , https://snapchain.farcaster.xyz/reference/httpapi/httpapi
- Neynar plans: Free 10M credits per month at 600 requests per minute per endpoint; Scale 249 USD per month, 60M credits, 1200 per minute; Starter and Growth no longer offered to new customers. Search is 120 per minute on Free. The credit cost of search is not in the table read; hub `castsByFid` is 200 credits, channel feed 4 credits.
- Snapchain: free software, "16 GB of RAM", "4 CPU cores or vCPUs", "2 TB of free storage", a public IP with ports 3381 to 3383 open. That is more than the Railway plan in use gives; a server would be a new cost.
- Live test 2026-11-25 (read-only, query "gpu compute", `limit=5`, Free plan "Beginner", 10M credits, "Your plan" on the plans page):
  - `GET /v2/farcaster/cast/search` returns 200 with `result.casts` and `result.next.cursor`. Cast fields: `hash`, `timestamp`, `author`, `reactions`, `replies`, `channel`, `text`, `parent_hash`, `thread_hash`, `embeds`.
  - Credit cost: 12 calls at `limit=5` showed 600 credits (50 per call); a later single call at `limit=1` on a new app showed 10 credits. That fits 10 credits per cast returned, matching the "page limit" multiplier the docs list for feeds. Only `limit=1` and `limit=5` were tested; `limit=100` is expected to cost 1,000 credits per call but is not verified.
  - Budget arithmetic (from the 10 credits per cast reading): 10M credits is about 1,000,000 casts per month, about 33,000 per day. Credits, not the rate limit, are the binding cap.
  - Response header `X-RateLimit-Limit: 300`; the docs say 120 per minute for search on Free. The two are not reconciled.
  - The dashboard "API Requests" chart read 36 while about 12 calls were made from this project, and a new app showed 2 requests after 1 call. The extra requests carried no credits (credits matched our calls exactly), so they are not billed; their source is unexplained.
  - The account page showed "0 credits limit" on the Free plan; the plans page and the calls show 10M credits, so treat the label as a display quirk.
- Not read: Neynar terms of service (the page returned 404), the Neynar pricing page (different host), and any licence statement for Farcaster protocol data. Whether keyword search is on the Free plan is not stated.

### Bluesky

- Read: https://bsky.social/about/support/tos (updated 14 August 2025). The docs pages for rate limits, searchPosts and Jetstream returned redirects with empty bodies or 404, so the figures below come from live calls on 2026-11-25, not from docs.
- Live test (dedicated project account, app password, read-only calls, query "gpu compute", limit 5):
  - `public.api.bsky.app` searchPosts without a token: 403, and still 403 with a token. Search is not available there.
  - `com.atproto.server.createSession` on `bsky.social`: 200. Header `RateLimit-Policy: 10;w=86400`, so 10 logins per 86,400 s window. A collector must keep the session and renew it with the refresh token, not log in per run.
  - `app.bsky.feed.searchPosts` on `bsky.social` with the access token: 200, 5 posts, cursor present, `hitsTotal` 8237. Header `RateLimit-Policy: 3000;w=300`, so 3000 requests per 300 s.
  - Post fields: `uri`, `cid`, `author`, `indexedAt`, `likeCount`, `repostCount`, `replyCount`, `quoteCount`, `bookmarkCount`, `labels`, `record` (`text`, `createdAt`, `langs`, `facets`).
  - No cost was observed. An app password has no read-only scope; keep the account dedicated and revoke the password if it leaks.
- Terms of Service: they apply "only to social networking that happens on Bluesky"; third-party apps on the AT Protocol are governed by their own terms. They do not address third-party storage of posts, derived labels or scores, aggregate statistics, scraping, bulk collection or ML use. Deleted content: "complete deletion across the network may not always be possible."
- Next: read the docs from their source repository, or call `app.bsky.feed.searchPosts` once with a test request and read the response and headers.

### Telegram

- Docs: https://core.telegram.org/api/terms , https://telegram.org/tos/bot-developers , https://core.telegram.org/api/obtaining_api_id , https://core.telegram.org/bots/faq
- Cost: "We offer our API free of charge" (API terms 2.2). Read limits and MTProto flood-wait behaviour are not documented in the pages read.
- Access: bots receive "All messages from channels where they are a member." Whether a bot can read a public channel it has not joined is not stated. The t.me web preview is not mentioned. Reading through a user account needs an api_id from my.telegram.org, one per phone number; accounts using unofficial clients "are automatically put under observation".
- Terms: API terms 1.5 prohibit "using, accessing or aggregating data obtained from the Telegram platform to train, fine-tune" AI or ML models. Bot developer terms 4.3: "Always prohibited uses include any form of data collection aimed at creating large datasets, machine learning models and AI products, such as scraping public group or channel contents" (written for bots and Mini Apps; whether it covers user clients is not stated). The content licensing and AI scraping terms linked from 1.5 were not read.
- Verdict: Telegram is optional in CLAUDE.md. The clauses above point at the very use CMI would make, so it stays off in v1 unless the owner takes the risk after asking Telegram.

## Open questions for the owner

1. For each provider (Vast.ai, RunPod, Lambda, TensorDock, Hyperstack): send a short written request for permission to read its price API and publish an index derived from it. Vast.ai requires this explicitly.
2. Paid aggregator as a bridge (getdeploying.com, about 499 USD per month): allowed, or first-party sources only? Cost approval is the owner's.
3. May a source that only offers a public web table (Akash) be read by a collector?
4. Raw per-source prices: publish or show aggregates only? Vast.ai terms forbid even a derived index without a written agreement.
5. Texel: confirm the `/gpus` schema by live call, and ask for its data terms.
