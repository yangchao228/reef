#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
WORKSPACE_SLUG="${REEF_WORKSPACE_SLUG:-}"
DEDUPE_WINDOW_MINUTES="${REEF_COMPENSATE_DEDUPE_WINDOW_MINUTES:-10}"

if [ -z "$WORKSPACE_SLUG" ]; then
  echo "REEF_WORKSPACE_SLUG_MISSING" >&2
  exit 1
fi

cd "$ROOT_DIR"

exec docker compose run --rm \
  -e REEF_WORKSPACE_SLUG="$WORKSPACE_SLUG" \
  compensator \
  npm run sync:compensate -- --only-failed --dedupe-window-minutes "$DEDUPE_WINDOW_MINUTES"
