#!/usr/bin/env bash
# Creates Cloudflare resources for Babel Room and prints follow-up steps.
# Run from the repository root: bash scripts/bootstrap-cloudflare.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/apps/worker/wrangler.toml" ]]; then
  echo "Error: expected repo layout at $ROOT (apps/worker/wrangler.toml missing)." >&2
  echo "Run from the Babel Room repo root: bash scripts/bootstrap-cloudflare.sh" >&2
  exit 1
fi

declare -a WRANGLER_CMD
for candidate in "$ROOT/node_modules/.bin/wrangler" "$ROOT/apps/worker/node_modules/.bin/wrangler"; do
  if [[ -x "$candidate" ]]; then
    WRANGLER_CMD=("$candidate")
    break
  fi
done
if [[ ${#WRANGLER_CMD[@]} -eq 0 ]]; then
  if command -v npx >/dev/null 2>&1; then
    WRANGLER_CMD=(npx wrangler)
  else
    echo "Wrangler not found. From repo root run: npm install" >&2
    exit 1
  fi
fi

run_wrangler() {
  "${WRANGLER_CMD[@]}" "$@"
}

cd "$ROOT/apps/worker"

echo "==> 1. D1 database (copy database_id into apps/worker/wrangler.toml)"
run_wrangler d1 create babel-room-db || true
echo ""
echo "==> 2. R2 bucket (name must match wrangler.toml bucket_name)"
run_wrangler r2 bucket create babel-room-transcripts || true
echo ""
echo "==> 3. Apply D1 migrations (remote)"
echo "    cd apps/worker && ${WRANGLER_CMD[*]} d1 migrations apply babel-room-db --remote"
echo ""
echo "==> 4. Paste database_id into apps/worker/wrangler.toml (replace REPLACE_WITH_REAL_ID)"
echo ""
echo "==> 5. Build UI + deploy Worker (from repo root)"
echo "    npm run deploy"
echo ""
echo "Optional: Workers AI uses your account quota; enable AI in the dashboard if prompted."
