#!/usr/bin/env bash
# Free local Wrangler / Vite dev ports (macOS / Linux with lsof).
# From repo root: bash scripts/free-dev-ports.sh
set -euo pipefail
for port in 8787 8788 5173; do
  for pid in $(lsof -ti "tcp:${port}" 2>/dev/null || true); do
    if [[ -n "${pid}" ]]; then
      echo "Port ${port}: killing PID ${pid}"
      kill -9 "${pid}" 2>/dev/null || true
    fi
  done
done
echo "Done (checked 8787, 8788, 5173)."
