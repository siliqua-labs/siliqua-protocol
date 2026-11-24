#!/bin/bash
# Runs the three Python workers side by side. If any one stops, stop all and exit non-zero so the
# platform restarts the container: a half-running pipeline would publish stale data unnoticed.
set -u

python -m price_collectors &
python -m index_engine &
python -m siliqua_watchdog &

wait -n
status=$?
echo "a worker exited with status ${status}; stopping the others" >&2
kill 0 2>/dev/null
exit 1
