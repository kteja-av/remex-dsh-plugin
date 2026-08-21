# remex-dsh-plugin

Cordis MemoryService provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) over [Remex](https://github.com/kteja-av/remex-ai) HTTP.

DSH owns the agent loop; Remex owns memory. This out-of-tree plugin:

- **Retrieves** relevant memories before inference (`agent/pre-step`)
- **Evaluates** new memories after each turn (`session/event`, async)
- **Exposes** an explicit `memory_search` tool for agent-directed recall

It does not modify DSH core or Remex internals. Pattern follows [dsh-mem](https://github.com/Jelee0145/dsh-mem): Service Definition + Provider + Consumers, mounted via `cordis.patch.yml`.

## Prerequisites

- Node.js 22+
- pnpm
- Remex API running (default `http://localhost:8000`)

Verify Remex health:

```bash
curl -sf http://localhost:8000/v1/health
# {"status":"ok"}
```

## Quick start

```bash
# In remex-dsh-plugin
pnpm install
pnpm test && pnpm exec tsc --noEmit
pnpm run build

# Add to a DSH profile (local path or published package)
dsh plugin --profile <your-profile> add /absolute/path/to/remex-dsh-plugin
```

Set tenant/user UUIDs in `cordis.patch.yml` (or your profile overlay) before running agents against Remex.

## Install

### Published package

```bash
dsh plugin --profile <your-profile> add @your-scope/remex-dsh-plugin
```

### Local development

```bash
pnpm install
pnpm run build
dsh plugin --profile <your-profile> add /absolute/path/to/remex-dsh-plugin
```

The package bundles `cordis.patch.yml` via `package.json` → `dsh.bundle.patch`. You can also copy or extend that patch in your profile's own `cordis.patch.yml` overlay.

## Cordis patch

`cordis.patch.yml` mounts the full stack:

| Row id | Export | Purpose |
|--------|--------|---------|
| `memory` | `remex-provider` | `ctx.memory` — Remex HTTP adapter |
| `remex-context-injector` | `context-injector` | Pre-step `<remex_memory>` inject |
| `remex-remember` | `remember` | Post-turn async evaluate enqueue |
| `tool-memory-search` | `memory-tools` | `memory_search` tool |

Example (override restates every key you keep — patches replace whole row config):

```yaml
- insert:
    - id: memory
      name: "@your-scope/remex-dsh-plugin/remex-provider"
      config:
        baseUrl: http://localhost:8000
        tenantId: "00000000-0000-4000-8000-000000000001"
        userId: "00000000-0000-4000-8000-000000000002"
        tokenBudget: 512
        limit: 5
        rememberType: semantic
    - id: remex-context-injector
      name: "@your-scope/remex-dsh-plugin/context-injector"
      config:
        enabled: true
        tokenBudget: 512
        limit: 5
    - id: remex-remember
      name: "@your-scope/remex-dsh-plugin/remember"
      config:
        enabled: true
        rememberType: semantic
    - id: tool-memory-search
      name: "@your-scope/remex-dsh-plugin/memory-tools"
      config:
        enabled: true
        tokenBudget: 512
        limit: 5
```

## Configuration

Per-row `config` in `cordis.patch.yml`:

| Key | Module(s) | Purpose |
|-----|-----------|---------|
| `baseUrl` | remex-provider | Remex API base URL (default `http://localhost:8000`) |
| `tenantId` | remex-provider | `X-Tenant-ID` UUID |
| `userId` | remex-provider | `X-User-ID` UUID |
| `tokenBudget` | remex-provider, context-injector, memory-tools | Default retrieve token budget |
| `limit` | remex-provider, context-injector, memory-tools | Default retrieve result limit |
| `rememberType` | remex-provider, remember | Evaluate memory type (default `semantic`) |
| `enabled` | context-injector, remember, memory-tools | Toggle auto inject / remember / tool |
| `timeoutMs` | remex-provider | Outbound HTTP timeout (default 5000 ms) |

Environment variables for local dev (map into patch config in your profile):

| Variable | Maps to |
|----------|---------|
| `REMEX_BASE_URL` | `baseUrl` |
| `REMEX_TENANT_ID` | `tenantId` |
| `REMEX_USER_ID` | `userId` |

## Remex API

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| Health | `GET /v1/health` | No auth |
| Retrieve | `GET /v1/memories:retrieve?query=...` | Uses `query` param (not `q`); auth headers required |
| Remember | `POST /v1/memories:evaluate` | Returns `202 { job_id }`; never poll on hot path |

Auth headers on every authenticated call: `X-Tenant-ID`, `X-User-ID`. DSH `MessageId` values map to Remex `source_turn_ids` as deterministic UUID v5.

## Architecture

```
BEFORE inference  →  agent/pre-step  →  ctx.memory.recall  →  inject <remex_memory>
AFTER turn        →  session/event   →  ctx.memory.save    →  POST /v1/memories:evaluate (async)
On demand         →  memory_search   →  ctx.memory.recall
```

**Fail-open read path:** When Remex is down, times out, or returns `degraded: true`, retrieve returns empty context — the agent continues without injected memory.

**Non-blocking write path:** Evaluate is fire-and-forget after `turn/end`; 429/5xx are logged, not thrown to the agent loop.

**Cross-session recall:** Scoped by tenant + user headers, not DSH session id.

## Tools

### `memory_search`

Agent-directed recall when automatic pre-step injection is insufficient. Delegates to `ctx.memory.recall(query)`.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | yes | Natural-language search string |
| `tokenBudget` | no | Overrides plugin default |
| `limit` | no | Max memories returned |

Returns structured memories and, when non-empty, a `<remex_memory>` formatted block.

### Remember path and Write Gate

Post-turn evaluate sends **third-person user facts** (e.g. `"The user works on …"`) derived from durable user messages. Assistant reply text is omitted from the evaluate payload (assistant message IDs remain in `source_turn_ids` for provenance). Remex Write Gate rejects candidates containing `"assistant"` or not starting with `"The user"`.

## Package layout

```
src/
├── memory.ts           # Abstract MemoryService seam
├── remex-client.ts     # HTTP client (retrieve, evaluate, health)
├── remex-provider.ts   # RemexMemoryProvider (ctx.memory)
├── identity.ts         # MessageId → UUID v5 + auth headers
├── format-context.ts   # <remex_memory> block builder
├── context-injector.ts # agent/pre-step consumer
├── remember.ts         # session/event async write (Write Gate–friendly facts)
├── memory-tools.ts     # memory_search tool
└── index.ts            # Re-exports
```

## Development

```bash
pnpm install
pnpm test                  # 52 tests
pnpm exec tsc --noEmit
pnpm run build             # emits lib/
pnpm run test:sandbox      # live Remex HTTP checks
pnpm run test:dsh          # DSH plugin add + dump-config
```

Key test suites:

| File | Covers |
|------|--------|
| `tests/remex-client.test.ts` | HTTP client, timeouts, API shapes |
| `tests/remex-provider.test.ts` | Fail-open recall, evaluate delegate |
| `tests/context-injector.test.ts` | Pre-step inject, dedupe |
| `tests/remember.test.ts` | Async evaluate enqueue |
| `tests/failure.test.ts` | Remex down → empty recall, agent continues |
| `tests/integration/recall-experiment.test.ts` | Cross-session recall script |
| `tests/memory-tools.test.ts` | memory_search → ctx.memory.recall |

## Status

MVP complete (M1–M7): provider, pre-step inject, async remember, `memory_search`, fail-open tests, and full Cordis patch packaging.
