#!/bin/sh
# Run from the repo root: sh .githooks/test-commit-msg.sh
hook="$(dirname "$0")/commit-msg"
tmp=$(mktemp)
failures=0

expect() {
  want="$1"; shift
  printf '%s\n' "$*" > "$tmp"
  sh "$hook" "$tmp" >/dev/null 2>&1
  got=$?
  if [ "$want" = "accept" ] && [ "$got" -ne 0 ] || [ "$want" = "reject" ] && [ "$got" -eq 0 ]; then
    echo "FAIL ($want): $*"
    failures=$((failures + 1))
  fi
}

expect accept "feat(index): add MAD floor to outlier bound"
expect accept "fix: stop counting stale hours twice"
expect accept "chore(deps)!: drop unused dependency"
expect accept "Merge branch 'main'"
expect reject "added stuff"
expect reject "feat: add parser

Co-Authored-By: Claude <noreply@anthropic.com>"
expect reject "feat: add parser

Co-authored-by: Copilot <x@example.com>"
expect reject "feat: add parser

Generated with Claude Code"
expect reject "fix: tweak thing, written by AI"

rm -f "$tmp"
if [ "$failures" -ne 0 ]; then
  echo "$failures test(s) failed"
  exit 1
fi
echo "commit-msg hook tests passed"
