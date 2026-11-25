#!/bin/bash
# The api runs in front. The indexer and relayer are optional helpers in the same container, each
# restarted on its own when it stops, so a failure there never takes the api down. If the api
# itself exits the container exits and the platform restarts it (the helpers die with it).
set -u

RESTART_DELAY_SECONDS=10

supervise() {
  local name=$1 dir=$2
  while true; do
    (cd "$dir" && node src/"$3")
    echo "${name} exited with status $?; restarting in ${RESTART_DELAY_SECONDS}s" >&2
    sleep "$RESTART_DELAY_SECONDS"
  done
}

if [ "${RUN_INDEXER:-}" = "true" ]; then
  supervise indexer /app/services/indexer main.ts &
fi
if [ "${RUN_RELAYER:-}" = "true" ]; then
  supervise relayer /app/services/api relayer-main.ts &
fi

cd /app/services/api
exec node src/main.ts
