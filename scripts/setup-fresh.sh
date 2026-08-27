#!/usr/bin/env bash
# One-shot setup for a BRAND-NEW machine: boots remex-ai + remex-dsh-plugin
# + DeepSeek Harness Web profile, and lands you on a working
# http://localhost:3080 — run this once, nothing else.
#
# A brand-new person only needs:
#   1. Node.js 22+, pnpm 11+, Docker (Desktop or Colima), and curl
#   2. A DeepSeek API key (sk-...) for the Web chat LLM — BOTH the remex-ai
#      engine and this plugin must be on disk first.
#
# What it does:
#   1. Clones remex-ai (default branch `master`, which carries the current
#      Write Gate pre-warm fix) into the sibling folder if it is missing.
#   2. Creates .env from .env.example and prompts for DEEPSEEK_API_KEY if the
#      placeholder is still there.
#   3. Ensures Docker is running.
#   4. Builds + starts the remex-ai stack (postgres, redis, neo4j, api, worker)
#      and runs Alembic migrations so /v1/health reports pgvector:true.
#   5. Installs + builds this plugin and writes DSH credentials.
#   6. Mounts the plugin on the DSH web profile and verifies :8000 + :3080.
#
# Usage (from this repo root):
#   bash scripts/setup-fresh.sh
#
# Overrides:
#   REMEX_AI_DIR=<path>     use/make an engine checkout elsewhere (default ../remex-ai)
#   DEEPSEEK_API_KEY=sk-... skip the prompt (also honored via .env)
#   REMEX_AI_REF=<ref>      engine git ref to fetch (default: master)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(dirname "$ROOT")"
REMEX_AI="${REMEX_AI_DIR:-$PARENT/remex-ai}"
REMEX_AI_URL="${REMEX_AI_URL:-https://github.com/kteja-av/remex-ai.git}"
REMEX_AI_REF="${REMEX_AI_REF:-master}"
DSH_HOME="${DSH_HOME:-$ROOT/sandbox/.dsh-home}"
DSH_BIN="$ROOT/node_modules/@deepseek-ai/dsh/lib/bin.js"
DSH_WEB_PORT="${DSH_WEB_PORT:-3080}"
REMEX_HEALTH="${REMEX_BASE_URL:-http://localhost:8000}/v1/health"

log() { printf '==> %s\n' "$*"; }
ok()   { printf '    ✓ %s\n' "$*"; }
info() { printf '    · %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1 (install $1 and re-run)"
}

ensure_env_file() {
  if [[ ! -f "$ROOT/.env" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    ok "created .env from .env.example"
  fi
}

prompt_api_key() {
  # Only prompt when no usable key is configured yet.
  local usable=no
  grep -qE '^DEEPSEEK_API_KEY=.+' "$ROOT/.env" 2>/dev/null \
    && ! grep -qE '^DEEPSEEK_API_KEY=.*(your-|changeme|placeholder)' "$ROOT/.env" 2>/dev/null \
    && usable=yes
  grep -qE '^LAGUNA_API_KEY=.+' "$ROOT/.env" 2>/dev/null \
    && ! grep -qE '^LAGUNA_API_KEY=.*(your-|changeme|placeholder)' "$ROOT/.env" 2>/dev/null \
    && usable=yes
  [[ "$usable" == "yes" ]] && return 0

  log "No usable API key found in .env — the Web chat needs a model provider."
  if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
    # Env override wins; write it into .env so setup-dsh-credentials picks it up.
    printf 'DEEPSEEK_API_KEY=%s\n' "$DEEPSEEK_API_KEY" >> "$ROOT/.env"
    ok "using DEEPSEEK_API_KEY from the environment"
    return 0
  fi
  read -rp "Paste your DeepSeek API key (sk-...) now, or press Enter to skip credentials: " key
  key="${key%%[[:space:]]*}"
  if [[ -n "$key" ]]; then
    printf 'DEEPSEEK_API_KEY=%s\n' "$key" >> "$ROOT/.env"
    ok "saved DEEPSEEK_API_KEY to .env"
  else
    info "Skipping credentials — the Web UI will still boot, but chat needs a key (add it to .env and re-run: pnpm run setup:credentials)."
  fi
}

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    ok "Docker is running"
    return 0
  fi
  log "Docker is not running."
  if command -v colima >/dev/null 2>&1; then
    log "Starting Colima…"
    colima start
  fi
  docker info >/dev/null 2>&1 \
    || die "Docker could not be started. Open Docker Desktop (or: colima start) and re-run."
  ok "Docker is running"
}

ensure_or_clone_remex() {
  if [[ -d "$REMEX_AI/.git" ]]; then
    log "Using existing remex-ai at $REMEX_AI"
    (cd "$REMEX_AI" && git fetch origin 2>/dev/null || true)
    return 0
  fi
  log "remex-ai not found at $REMEX_AI — cloning from $REMEX_AI_URL (branch $REMEX_AI_REF)"
  git clone --branch "$REMEX_AI_REF" --single-branch "$REMEX_AI_URL" "$REMEX_AI"
  ok "cloned remex-ai"
}

start_remex() {
  log "Building + starting remex-ai stack (first run pulls images and takes several minutes)"
  (cd "$REMEX_AI" && docker compose up -d --wait --build)

  log "Applying database migrations (alembic upgrade head)"
  # Idempotent: re-running on a migrated DB is a no-op. Fail loudly if the
  # app role / pgvector extensions are not yet applied.
  docker compose -f "$REMEX_AI/docker-compose.yml" run --rm api alembic upgrade head

  log "Waiting for remex health"
  local deadline=$((SECONDS + 120))
  while ! curl -sf "$REMEX_HEALTH" >/dev/null 2>&1; do
    [[ $SECONDS -lt $deadline ]] || die "remex-ai health check timed out at $REMEX_HEALTH"
    sleep 3
  done
  ok "remex-ai is healthy at $REMEX_HEALTH"
}

setup_plugin() {
  log "Installing plugin dependencies and building"
  (cd "$ROOT" && pnpm install && pnpm run build)
  ok "plugin built"
}

setup_dsh_profile() {
  export DSH_HOME
  export DSH_TELEMETRY_DISABLED=1
  mkdir -p "$DSH_HOME"
  [[ -f "$DSH_BIN" ]] || die "DSH CLI missing — run pnpm install in $ROOT (step: setup_plugin)"

  node --experimental-strip-types "$ROOT/sandbox/setup-dsh-credentials.ts"
  ok "wrote DSH credentials to $DSH_HOME/.credentials.yaml"

  log "Mounting remex-dsh-plugin on the DSH web profile"
  node "$DSH_BIN" plugin --profile web add "$ROOT"
  node "$DSH_BIN" --profile web --dump-config | grep -E 'remex-provider|remex-remember' >/dev/null \
    || die "plugin mount check failed (remex rows not in web profile)"
  ok "plugin mounted on web profile"
}

start_web_and_verify() {
  log "Starting DSH Web UI on :$DSH_WEB_PORT"
  node "$DSH_BIN" web --host 127.0.0.1 --port "$DSH_WEB_PORT" >"$DSH_HOME/web.log" 2>&1 &
  local pid=$!
  local deadline=$((SECONDS + 60))
  while [[ $SECONDS -lt $deadline ]]; do
    if curl -sf -o /dev/null "http://127.0.0.1:$DSH_WEB_PORT"; then
      ok "DSH Web is up at http://127.0.0.1:$DSH_WEB_PORT (pid $pid)"
      return 0
    fi
    sleep 3
  done
  die "DSH Web did not come up on :$DSH_WEB_PORT — see $DSH_HOME/web.log"
}

main() {
  log "remex-dsh-plugin fresh setup (root=$ROOT)"
  need_cmd node
  need_cmd pnpm
  need_cmd curl
  need_cmd git
  need_cmd docker

  ensure_env_file
  prompt_api_key
  # shellcheck disable=SC1091
  [[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a

  ensure_docker
  ensure_or_clone_remex
  start_remex
  setup_plugin
  setup_dsh_profile
  start_web_and_verify

  cat <<EOF

========================================================================
 Setup complete — open http://127.0.0.1:$DSH_WEB_PORT
========================================================================
 1. Connect a workspace folder.
 2. Settings → Models → confirm your API key is saved.
 3. Chat: "My name is Teja. I work on autonomous driving simulation."
 4. New session: "What do you know about my work?" → expect work recall.

 Remex engine: $REMEX_HEALTH
 DSH Web:      http://127.0.0.1:$DSH_WEB_PORT
 DSH home:     $DSH_HOME

 Optional verification (while web is running, in a new terminal):
   export DSH_HOME="$DSH_HOME"
   pnpm run test:sandbox       # Remex HTTP integration
   pnpm run test:browser       # headless DSH Web check
   pnpm run test:browser-headed# headed DSH Web check (visible Chrome)
========================================================================
EOF
}

main "$@"