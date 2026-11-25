#!/bin/bash
# Starts one chain-facing service. Fails on a missing or unknown SERVICE so a misconfigured
# Railway service stops at once instead of idling.
set -eu

case "${SERVICE:-}" in
  relayer) cd services/api && exec node src/relayer-main.ts ;;
  indexer) cd services/indexer && exec node src/main.ts ;;
  market-keeper) cd services/market-keeper && exec node src/main.ts ;;
  *)
    echo "SERVICE must be relayer, indexer or market-keeper, got '${SERVICE:-}'" >&2
    exit 1
    ;;
esac
