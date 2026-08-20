# remex-dsh-plugin

Cordis MemoryService provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) over [Remex](https://github.com/kteja-av/remex-ai) HTTP.

DSH owns the agent loop; Remex owns memory. This plugin retrieves relevant memories before inference, evaluates new memories after each turn, and exposes an explicit `memory_search` tool — without modifying either core runtime.

## Prerequisites

- Node.js 22+
- pnpm
- Remex API running (default `http://localhost:8000`)

Verify Remex health:

```bash
curl -sf http://localhost:8000/v1/health
# {"status":"ok"}
```

## Install

### Published package (when available)

```bash
dsh plugin --profile <your-profile> add @your-scope/remex-dsh-plugin
```

### Local development patch

From your DSH checkout or profile directory:

```bash
pnpm install
pnpm run build   # in remex-dsh-plugin
dsh plugin --profile <your-profile> add /absolute/path/to/remex-dsh-plugin
```

Or overlay the bundled patch manually — the package ships `cordis.patch.yml` under the `dsh.bundle.patch` field in `package.json`.

## Cordis patch

`cordis.patch.yml` mounts the full plugin stack:

| Row id | Module | Purpose |
|--------|--------|---------|
| `memory` | `remex-provider` | `ctx.memory` over Remex HTTP |
| `remex-context-injector` | `context-injector` | Pre-step `<remex_memory>` inject |
| `remex-remember` | `remember` | Post-turn async evaluate |
| `tool-memory-search` | `memory-tools` | Agent-directed `memory_search` tool |

Example override (restates every key you keep — patches replace whole config):

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
```

## Configuration

Set via each plugin row's `config` in `cordis.patch.yml` (or profile env interpolation where supported):

| Key | Module | Purpose |
|-----|--------|---------|
| `baseUrl` | remex-provider | Remex API base URL (default `http://localhost:8000`) |
| `tenantId` | remex-provider | `X-Tenant-ID` UUID |
| `userId` | remex-provider | `X-User-ID` UUID |
| `tokenBudget` | remex-provider, context-injector, memory-tools | Default retrieve token budget |
| `limit` | remex-provider, context-injector, memory-tools | Default retrieve result limit |
| `rememberType` | remex-provider, remember | Default evaluate memory type (`semantic`) |
| `enabled` | context-injector, remember, memory-tools | Toggle auto inject / remember / tool |
| `timeoutMs` | remex-provider | Outbound HTTP timeout (default 5000 ms) |

Environment variables for local dev (map into patch config in your profile):

| Variable | Maps to |
|----------|---------|
| `REMEX_BASE_URL` | `baseUrl` |
| `REMEX_TENANT_ID` | `tenantId` |
| `REMEX_USER_ID` | `userId` |

## Tools

### `memory_search`

Agent-directed recall on top of automatic pre-step injection. Calls `ctx.memory.recall(query)` and returns structured memories plus an optional `<remex_memory>` formatted block.

Parameters:

- `query` (required) — natural-language search string
- `tokenBudget` (optional) — overrides plugin default
- `limit` (optional) — max memories returned

## Development

```bash
pnpm install
pnpm test
pnpm exec tsc --noEmit
pnpm run build
```

## Architecture

- **Read path (fail-open):** `agent/pre-step` → `ctx.memory.recall` → inject `<remex_memory>` or empty context
- **Write path (non-blocking):** `session/event` → `ctx.memory.save` → `POST /v1/memories:evaluate` (202 + job_id)
- **Explicit recall:** `memory_search` tool → same `ctx.memory.recall` seam

Cross-session recall is keyed by tenant + user headers, not DSH session id.
