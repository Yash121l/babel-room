#!/usr/bin/env bash
# Free common Babel Room dev ports (macOS / Linux; lsof required).
set -euo pipefail
PORTS=(5173 8787 8788)
for p in "${PORTS[@]}"; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti ":$p" 2>/dev/null || true)
    if [[ -n "${pids:-}" ]]; then
      echo "free-dev-ports: killing PIDs on port $p: $pids"
      kill -9 $pids 2>/dev/null || true
    fi
  else
    echo "free-dev-ports: lsof not found; skip port $p" >&2
  fi
done
echo "free-dev-ports: done (${PORTS[*]})"
