# remex-dsh-plugin

Cordis **MemoryService** provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) over [Remex](https://github.com/kteja-av/remex-ai) HTTP.

DSH owns the agent loop; Remex owns memory. This plugin:

- **Retrieves** memories before inference (`agent/pre-step` → `<remex_memory>` inject)
- **Evaluates** new memories after each turn (`session/event`, async Write Gate)
- **Exposes** `memory_search` for agent-directed recall

---

## One-command setup

**Layout:** clone `remex-ai` and `remex-dsh-plugin` as sibling folders:

```
parent/
├── remex-ai/
└── remex-dsh-plugin/
```

**Steps:**

```bash
cd remex-dsh-plugin

# 1. Add your API key (never commit .env)
cp .env.example .env
# Edit .env → set DEEPSEEK_API_KEY=sk-...

# 2. Setup everything (Docker/Colima, Remex, plugin build, DSH web profile)
bash scripts/setup-all.sh

# 3. Start the Web UI
export DSH_HOME="$PWD/sandbox/.dsh-home"
pnpm run start:web
```

Open **http://127.0.0.1:3080** → connect a **workspace** → chat.

Equivalent npm script:

```bash
pnpm run setup    # same as bash scripts/setup-all.sh
```

### What `setup-all.sh` does

| Step | Action |
|------|--------|
| 1 | Creates `.env` from `.env.example` if missing |
| 2 | Starts Docker (Colima on macOS if needed) |
| 3 | `docker compose up` in `../remex-ai` |
| 4 | `pnpm install`, `pnpm run build`, `pnpm test` |
| 5 | Writes DSH credentials/settings from `.env` |
| 6 | `dsh plugin --profile web add` this repo |

Override remex-ai location: set `REMEX_AI_DIR` in `.env`.

---

## Verify in the Web UI

1. **Connect workspace** — required before the composer unlocks.
2. **Settings → Models** — confirm DeepSeek API key is saved.
3. **Session A:** `My name is Teja. I work on autonomous driving simulation.`
4. Wait for async remember — the Write Gate admits in ~80ms (was ~2s on first writes before the Aug 2026 perf fix), so recall is usually available within a second.
5. **New session:** `What do you know about my work?` → expect driving/simulation recall.

Use **first-person** facts (`I work on…`, `My name is…`). The plugin rewrites them as `"The user …"` for Remex Write Gate.

### CLI verification

```bash
pnpm run test:sandbox          # Remex HTTP integration → sandbox/REPORT.md
pnpm run test:dsh              # DSH profile + dump-config → sandbox/DSH-REPORT.md
pnpm run test:browser          # headless DSH Web UI verification (chromium)
pnpm run test:browser-headed   # headed DSH Web UI verification (real Chrome)
pnpm exec tsc --noEmit
pnpm test                      # unit tests (66)
```

**Headless write-gate latency harness** (engine vs plugin path, concurrency bursts):

```bash
node --experimental-strip-types sandbox/write-gate-latency.ts   # → sandbox/LATENCY-REPORT.md
```

---

## Secrets and git safety

| File | Commit? | Notes |
|------|---------|-------|
| `.env.example` | Yes | Placeholders only |
| `.env` | **Never** | Your real API keys |
| `sandbox/.dsh-home/` | **Never** | DSH profiles + `.credentials.yaml` |
| `sandbox/\*REPORT.md` | **Never** | Generated test output (`REPORT`, `DSH-REPORT`, `BROWSER-REPORT`, `LATENCY-REPORT`) |

**Important:** Do **not** put `DSH_HOME` in `.env` — DSH refuses to start. Export it in the shell:

```bash
export DSH_HOME="$PWD/sandbox/.dsh-home"
```

Optional keys in `.env`:

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | DSH agent LLM (required for Web chat) |
| `LAGUNA_API_KEY` | Optional Command Code / Laguna provider |
| `REMEX_BASE_URL` | Default `http://localhost:8000` |
| `REMEX_TENANT_ID` / `REMEX_USER_ID` | Remex auth headers |

Remex itself does **not** use DeepSeek/Laguna keys today (local encoder + local Write Gate judge).

---

## Install plugin manually (without full setup script)

```bash
pnpm install && pnpm run build
export DSH_HOME="$PWD/sandbox/.dsh-home"
node node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile web add "$PWD"
node node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --dump-config | grep remex
```

Published package (when available):

```bash
dsh plugin --profile web add @your-scope/remex-dsh-plugin
```

---

## Cordis patch

`cordis.patch.yml` mounts the full stack:

| Row id | Export | Purpose |
|--------|--------|---------|
| `memory` | `remex-provider` | `ctx.memory` — Remex HTTP adapter |
| `remex-context-injector` | `context-injector` | Pre-step `<remex_memory>` inject (+ opt-in `<remex_core_memory>`) |
| `remex-remember` | `remember` | Post-turn async evaluate |
| `tool-memory-search` | `memory-tools` | `memory_search` tool (via `defineTool`) |

The injector row accepts a `coreMemory` block (`enabled`, `baseUrl`, `tenantId`, `userId`) — disabled by default in the patch; enable it to fold M18 core-memory blocks into pre-step context.

Default Remex config in the patch:

```yaml
baseUrl: http://localhost:8000
tenantId: "00000000-0000-4000-8000-000000000001"
userId: "00000000-0000-4000-8000-000000000002"
```

---

## Architecture

```
BEFORE inference  →  agent/pre-step  →  ctx.memory.recall  →  inject <remex_memory>
                                        + core-memory blocks → inject <remex_core_memory>   (M10, opt-in)
AFTER turn        →  session/event   →  ctx.memory.save    →  POST /v1/memories:evaluate (async)
On demand         →  memory_search   →  ctx.memory.recall
```

**Fail-open read:** Remex down → empty recall, agent continues.

**Write path:** Fire-and-forget evaluate; 429/5xx logged, not thrown.

**Remember format:** Third-person user facts only (`"The user works on …"`), no assistant text in evaluate payload.

**Retrieval options:** `historical: true` passes `historical=true` to the retrieve endpoint for expired/superseded assertions (M14, opt-in).

**Core memory (M18 read):** When the injector `coreMemory.enabled` is true, the `persona` / `human` / `task_scratchpad` blocks are fetched from `GET /v1/core-memory` and folded into pre-step context as a `<remex_core_memory>` snapshot (order follows the M19 working-memory compiler priority).

**Tools:** `memory_search` is registered through `defineTool` from `@deepseek-ai/dsh-tools` (not a raw `ToolRegistrar`), so it carries a typed JSON schema + structured output renderer.

---

## Remex API

| Operation | Endpoint |
|-----------|----------|
| Health | `GET /v1/health` |
| Retrieve | `GET /v1/memories:retrieve?query=...&historical=true` |
| Remember | `POST /v1/memories:evaluate` → `202 { job_id }` |
| Job status | `GET /v1/jobs/{job_id}` → `{ status, result }` (async Write Gate) |
| Core memory | `GET /v1/core-memory` → `{ blocks[] }` |

Auth headers: `X-Tenant-ID`, `X-User-ID`.

---

## Development

```
src/
├── remex-provider.ts   # ctx.memory adapter (recall/save, historical option)
├── context-injector.ts # pre-step <remex_memory> + <remex_core_memory> inject
├── remember.ts         # async write (Write Gate facts)
├── memory-tools.ts     # memory_search via defineTool (@deepseek-ai/dsh-tools)
├── remex-client.ts     # HTTP client (retrieve, evaluate, jobs, core-memory)
├── core-memory.ts      # M18 core-memory block formatting (M19 ordering)
├── format-context.ts   # <remex_memory> XML block formatting
└── ...
```

```bash
pnpm install
pnpm test
pnpm run build
```

---

## Prerequisites

- **Node.js** 22+
- **pnpm** 11+
- **Docker** (Docker Desktop or Colima) for remex-ai
- **Sibling checkout:** `../remex-ai`
- **DeepSeek API key** for DSH Web chat (optional Laguna key for alternate LLM)

---

## Status

Compatibility baseline aligned with the current remex-ai backend (M8–M25) and the DSH `rc.8` ecosystem: `@deepseek-ai/dsh-llm` resolves to `0.1.0-rc.8` (matching `@deepseek-ai/dsh`).

### Milestone coverage

| Milestone | Remex-ai feature | Plugin status |
|-----------|------------------|---------------|
| M14 | `historical=true` retrieval of expired/superseded assertions | **Consumed (M9)** — `RecallOptions.historical` opt-in |
| M18 | Core-memory blocks (`persona`, `human`, `task_scratchpad`) | **Consumed (M10)** — opt-in pre-step `<remex_core_memory>` inject |
| M19 | Working-memory compiler ordering | **Consumed** — block ordering in `core-memory.ts` |
| M21 | Memory routing | Optional — exposed by backend, not yet consumed by provider/injector |
| M23–M25 | Zettelkasten/card retrieval + linking | Optional — exposed by backend, not yet consumed |

### Write Gate latency fix (2026-08)

Remex's Write Gate is **async**: the plugin POSTs `/v1/memories:evaluate`, gets a `202 { job_id }`, and (in verification harnesses) polls `/v1/jobs/{id}` — the plugin never blocks the agent loop. The **engine** (sibling `remex-ai`) historically paid a ~1.8–2.6s cold start on **every admitted write**, because RQ forks a fresh process per job and each forked work-horse lazily re-loaded the sentence-transformers encoder.

`remex-ai/worker/main.py` now **pre-warms the encoder + Neo4j driver in the worker parent** before the job loop forks, so every forked child inherits the warmed state. Write-gate admission latency dropped from **~2,000ms → ~25–100ms** (verified headless via `sandbox/write-gate-latency.ts` and in the DSH Web UI). The fix lives in the sibling repo and should be pulled in alongside this plugin.

### Testing surface

- 66 unit tests (`pnpm test`) across provider, client, injector, remember, memory-tools, core-memory, recall-experiment, and failure paths.
- Headless sandbox integration (`pnpm run test:sandbox`) against a live Remex stack.
- Headless + **headed** DSH Web UI verification (`test:browser`, `test:browser-headed`).
- Write-gate latency harness (`sandbox/write-gate-latency.ts`) comparing engine-only vs plugin-client path, including concurrency bursts.
