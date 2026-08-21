# Sandbox — plugin + Remex + DSH integration

Isolated live test harness for `remex-dsh-plugin` against [remex-ai](https://github.com/kteja-av/remex-ai) and [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Prerequisites

1. Remex stack up:

```bash
cd ../remex-ai
docker compose up -d --wait
curl -sf http://localhost:8000/v1/health
```

2. Plugin + DSH CLI:

```bash
cd ../remex-dsh-plugin
pnpm install   # includes @deepseek-ai/dsh devDependency
pnpm run build
```

## Run

**Remex HTTP integration (S1–S11):**

```bash
pnpm run test:sandbox
```

**DSH profile + Cordis wiring (D0–D5):**

```bash
pnpm run test:dsh
```

Optional env (see `.env.example`):

```bash
REMEX_BASE_URL=http://localhost:8000 \
REMEX_TENANT_ID=00000000-0000-4000-8000-000000000001 \
REMEX_USER_ID=00000000-0000-4000-8000-000000000002 \
pnpm run test:sandbox
```

Manual DSH install into a profile:

```bash
export DSH_HOME="$PWD/sandbox/.dsh-home"
node node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile remex add "$PWD"
node node_modules/@deepseek-ai/dsh/lib/bin.js --profile remex --dump-config
```

## Output

| Script | Report |
|--------|--------|
| `test:sandbox` | `sandbox/REPORT.md` |
| `test:dsh` | `sandbox/DSH-REPORT.md` |

## Scope

| In scope | Out of scope |
|----------|----------------|
| Remex HTTP (health, evaluate, retrieve, jobs) | Full DSH Web UI manual session |
| Plugin modules (provider, injector, remember, tools) | `@deepseek-ai/dsh-tools` defineTool validation |
| DSH `plugin add`, `dump-config`, headless compose | Production load testing |
| Fail-open against dead Remex port | |
