# Sandbox Integration Report

**Date:** 2026-08-20T14:15:33.381Z
**Remex:** http://localhost:8000
**Plugin:** remex-dsh-plugin (local build)

## Summary

| Result | Count |
|--------|-------|
| PASS | 11 |
| WARN | 0 |
| FAIL | 0 |
| SKIP | 1 |

## Checks

| ID | Status | Name | Detail |
|----|--------|------|--------|
| S1 | PASS | Remex health preflight | {"status":"ok","dependencies":{"postgres":{"reachable":true,"pgvector":true},"redis":{"pong":true},"worker":{"heartbeat_age_seconds":1.698,"fresh":true,"stale_after_seconds":15}}} |
| S2 | PASS | Plugin retrieve baseline (empty ok) | memories=5 degraded=false |
| S3 | PASS | Write Gate evaluate (plugin remember format) | job1=admitted job2=admitted reason2=Candidate states a user preference or fact. |
| S4b | PASS | E2E recall with admitted factual payload | count=5 top="The user works on autonomous driving simulation." |
| S4 | PASS | Cross-session recall (work question) | count=5 top="The user works on autonomous driving simulation." |
| S5 | PASS | Recall ranking (work over dosa) | top="The user works on autonomous driving simulation." |
| S6 | PASS | memory_search → ctx.memory.recall | memories=5 formatted=true |
| S7 | PASS | Pre-step injection with live recall | messages=2 memories=5 |
| S8 | PASS | Remember reducer builds Write-Gate save candidate | The user said: Sandbox remember path check. |
| S9 | PASS | Fail-open when Remex unreachable | {"memories":[],"tokenCount":0,"degraded":false} |
| S10 | PASS | Agent continues without injection when Remex down | recall={"memories":[],"tokenCount":0,"degraded":false} messages=1 |
| S11 | SKIP | DeepSeek Harness Cordis runtime | deepseek-harness not present in workspace; HTTP + plugin modules only |

## Issues

### [INFO] Full DSH plugin mount not exercised in this sandbox
- **Area:** dsh
- **Detail:** No local deepseek-harness checkout. Validated Remex HTTP + plugin modules only. Run `dsh plugin add` manually to test Cordis patch wiring.

### [MINOR] memory_search uses raw ToolRegistrar, not @deepseek-ai/dsh-tools defineTool
- **Area:** packaging
- **Detail:** @deepseek-ai/dsh-tools depends on private npm packages. Tool shape may differ from production DSH until validated in harness.

## Environment

- Remex stack: docker compose (postgres, redis, neo4j, api, worker)
- DSH: not tested (not installed in workspace)
- Plugin tests: run separately via `pnpm test`
