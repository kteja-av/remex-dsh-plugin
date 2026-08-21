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
4. Wait ~10s for async remember.
5. **New session:** `What do you know about my work?` → expect driving/simulation recall.

Use **first-person** facts (`I work on…`, `My name is…`). The plugin rewrites them as `"The user …"` for Remex Write Gate.

### CLI verification

```bash
pnpm run test:sandbox   # Remex HTTP integration
pnpm run test:dsh       # DSH profile + dump-config
pnpm exec tsc --noEmit
pnpm test               # unit tests (52)
```

---

## Secrets and git safety

| File | Commit? | Notes |
|------|---------|-------|
| `.env.example` | Yes | Placeholders only |
| `.env` | **Never** | Your real API keys |
| `sandbox/.dsh-home/` | **Never** | DSH profiles + `.credentials.yaml` |
| `sandbox/*REPORT.md` | **Never** | Generated test output |

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
| `remex-context-injector` | `context-injector` | Pre-step `<remex_memory>` inject |
| `remex-remember` | `remember` | Post-turn async evaluate |
| `tool-memory-search` | `memory-tools` | `memory_search` tool |

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
AFTER turn        →  session/event   →  ctx.memory.save    →  POST /v1/memories:evaluate (async)
On demand         →  memory_search   →  ctx.memory.recall
```

**Fail-open read:** Remex down → empty recall, agent continues.

**Write path:** Fire-and-forget evaluate; 429/5xx logged, not thrown.

**Remember format:** Third-person user facts only (`"The user works on …"`), no assistant text in evaluate payload.

---

## Remex API

| Operation | Endpoint |
|-----------|----------|
| Health | `GET /v1/health` |
| Retrieve | `GET /v1/memories:retrieve?query=...` |
| Remember | `POST /v1/memories:evaluate` → `202 { job_id }` |

Auth headers: `X-Tenant-ID`, `X-User-ID`.

---

## Development

```
src/
├── remex-provider.ts   # ctx.memory adapter
├── context-injector.ts # pre-step inject
├── remember.ts         # async write (Write Gate facts)
├── memory-tools.ts     # memory_search
├── remex-client.ts     # HTTP client
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

MVP complete (M1–M7): provider, pre-step inject, async remember, `memory_search`, fail-open tests, full Cordis patch, sandbox + DSH integration harness.
