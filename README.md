# remex-dsh-plugin

Cordis MemoryService provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) over [Remex](https://github.com/kteja-av/remex-ai) HTTP.

DSH owns the agent loop; Remex owns memory. This plugin retrieves relevant memories before inference and asynchronously evaluates new memories after each turn — without modifying either core runtime.

## Prerequisites

- Node.js 22+
- pnpm
- Remex API running (default `http://localhost:8000`)

Verify Remex health:

```bash
curl -sf http://localhost:8000/v1/health
# {"status":"ok"}
```

## Install (development)

```bash
pnpm install
pnpm exec tsc --noEmit
```

## Cordis patch

The bundle ships `cordis.patch.yml` for DSH profile overlay. Provider mount is added in milestone M3.

## Configuration (MVP)

| Key | Purpose |
|-----|---------|
| `remex.baseUrl` | Remex API base URL (default `http://localhost:8000`) |
| `remex.tenantId` / `remex.userId` | UUID strings for `X-Tenant-ID` / `X-User-ID` |

## Status

M1 — package skeleton with pinned `@deepseek-ai/cordis` (^4.0.1, aligned with [dsh-mem](https://github.com/Jelee0145/dsh-mem)).
