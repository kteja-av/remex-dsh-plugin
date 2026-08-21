# Sandbox

Integration harnesses live here. See the [root README](../README.md) for the one-command setup.

```bash
# From repo root (recommended)
cp .env.example .env    # add your API keys
bash scripts/setup-all.sh
```

| Script | Purpose |
|--------|---------|
| `pnpm run test:sandbox` | Live Remex HTTP checks → `sandbox/REPORT.md` (gitignored) |
| `pnpm run test:dsh` | DSH plugin wiring → `sandbox/DSH-REPORT.md` (gitignored) |
| `pnpm run start:web` | Start DSH Web UI on http://127.0.0.1:3080 |
| `pnpm run setup:credentials` | Write `$DSH_HOME/.credentials.yaml` from `.env` |

**Never commit:** `.env`, `sandbox/.dsh-home/`, or generated `*REPORT.md` files.
