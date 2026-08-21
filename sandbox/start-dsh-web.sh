#!/usr/bin/env bash
# Start DSH Web UI with remex plugin profile.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DSH_HOME="${DSH_HOME:-$ROOT/sandbox/.dsh-home}"
export DSH_TELEMETRY_DISABLED=1
cd "$ROOT"
exec node node_modules/@deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 3080 "$@"
