# Railway deployment (v1, two services)

Both services build from the repository root: leave Root Directory empty and point each service at its Dockerfile with a service variable.

| Service  | `RAILWAY_DOCKERFILE_PATH` | Runs                                   | Port |
| -------- | ------------------------- | -------------------------------------- | ---- |
| `api`    | `deploy/Dockerfile.api`   | `services/api` (HTTP)                  | `PORT` injected by Railway; generate a domain by hand |
| `worker` | `deploy/Dockerfile.worker`| price collector, index engine, watchdog in one container (`deploy/worker.sh`) | none |

If any of the three workers exits, `worker.sh` stops the others and exits non-zero so Railway restarts the container.

## Variables

- `api`: `DATABASE_URL` (Supabase pooler string).
- `worker`: `DATABASE_URL`, provider keys that are enabled, optional `COLLECT_INTERVAL_SECONDS`, `ENGINE_INTERVAL_SECONDS`, `WATCHDOG_*`, `ALERT_WEBHOOK_URL`.
- Never commit values. Railway config-as-code is deprecated, so nothing here uses it.

## Not deployed yet

`indexer`, `market-keeper`, the relayer and `oracle-node` wait for the testnet contract deployment. They run from the same repository and need their own services when the time comes.

## Check after each deploy

`GET /v1/indexes` answers 200. The worker log shows `run done` from the collector and no `exited with status` line.
