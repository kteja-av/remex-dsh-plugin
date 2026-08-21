#!/usr/bin/env bash
# One-shot local setup: remex-ai + remex-dsh-plugin + DeepSeek Harness Web profile.
#
# Usage (from repo root):
#   cp .env.example .env   # add your DEEPSEEK_API_KEY first
#   bash scripts/setup-all.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMEX_AI="${REMEX_AI_DIR:-$(dirname "$ROOT")/remex-ai}"
DSH_HOME="${DSH_HOME:-$ROOT/sandbox/.dsh-home}"
DSH_BIN="$ROOT/node_modules/@deepseek-ai/dsh/lib/bin.js"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_env_file() {
  if [[ ! -f "$ROOT/.env" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    log "Created .env from .env.example — edit DEEPSEEK_API_KEY before using the Web UI"
  fi
}

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if command -v colima >/dev/null 2>&1; then
    log "Starting Colima (Docker)…"
    colima start
  fi
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop or run: colima start"
}

start_remex() {
  [[ -d "$REMEX_AI" ]] || die "remex-ai not found at $REMEX_AI (set REMEX_AI_DIR in .env)"
  log "Starting remex-ai at $REMEX_AI"
  (cd "$REMEX_AI" && docker compose up -d --wait)
  curl -sf "${REMEX_BASE_URL:-http://localhost:8000}/v1/health" >/dev/null \
    || die "Remex health check failed after docker compose up"
  log "Remex is healthy"
}

setup_plugin() {
  log "Installing plugin dependencies and building"
  cd "$ROOT"
  pnpm install
  pnpm run build
  pnpm test
}

setup_dsh_profile() {
  export DSH_HOME
  export DSH_TELEMETRY_DISABLED=1
  mkdir -p "$DSH_HOME"
  [[ -f "$DSH_BIN" ]] || die "DSH CLI missing — run pnpm install in $ROOT"

  if { grep -qE '^DEEPSEEK_API_KEY=.+' "$ROOT/.env" 2>/dev/null \
      && ! grep -qE '^DEEPSEEK_API_KEY=.*(your-|changeme|placeholder)' "$ROOT/.env" 2>/dev/null; } \
    || { grep -qE '^LAGUNA_API_KEY=.+' "$ROOT/.env" 2>/dev/null \
      && ! grep -qE '^LAGUNA_API_KEY=.*(your-|changeme|placeholder)' "$ROOT/.env" 2>/dev/null; }; then
    log "Writing DSH credentials and settings from .env"
    node --experimental-strip-types "$ROOT/sandbox/setup-dsh-credentials.ts"
  else
    log "Skipping DSH credentials (add DEEPSEEK_API_KEY to .env, then re-run or: pnpm run setup:credentials)"
  fi

  log "Mounting remex-dsh-plugin on DSH web profile"
  node "$DSH_BIN" plugin --profile web add "$ROOT"
  log "Composed config check:"
  node "$DSH_BIN" --profile web --dump-config | grep -E 'remex-provider|remex-remember' || true
}

main() {
  log "remex-dsh-plugin setup (root=$ROOT)"
  need_cmd node
  need_cmd pnpm
  need_cmd curl
  need_cmd docker

  ensure_env_file
  # shellcheck disable=SC1091
  [[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

  ensure_docker
  start_remex
  setup_plugin
  setup_dsh_profile

  cat <<EOF

Setup complete.

  export DSH_HOME="$DSH_HOME"
  pnpm run start:web

Then open http://127.0.0.1:3080
  1. Connect a workspace folder
  2. Settings → Models → confirm API key
  3. Chat: "My name is Teja. I work on autonomous driving simulation."
  4. New session: "What do you know about my work?"

Optional verification:
  pnpm run test:sandbox
  pnpm run test:dsh

EOF
}

main "$@"
