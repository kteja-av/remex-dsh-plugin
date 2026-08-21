# DSH Integration Report

**Date:** 2026-08-20T14:31:39.129Z
**DSH:** @deepseek-ai/dsh (local node_modules)
**Plugin:** remex-dsh-plugin
**DSH_HOME:** /Users/krishnateja/Documents/Git projects/remex-dsh-plugin/sandbox/.dsh-home

## Summary

| Result | Count |
|--------|-------|
| PASS | 6 |
| WARN | 0 |
| FAIL | 0 |
| SKIP | 1 |

## Checks

| ID | Status | Name | Detail |
|----|--------|------|--------|
| D0 | PASS | DSH CLI installed | /Users/krishnateja/Documents/Git projects/remex-dsh-plugin/node_modules/@deepseek-ai/dsh/lib/bin.js |
| D1 | PASS | dsh plugin add (local bundle) | profile=remex-dsh-test bundle linked |
| D2 | PASS | dump-config includes remex plugin rows | memory + injector + remember + memory_search present |
| D3 | PASS | Profile overlay overrides Remex config | baseUrl=http://localhost:8000 |
| D4 | PASS | Headless profile composes remex bundle | remex-provider row present in headless dump-config |
| D4b | SKIP | Headless agent round-trip with remex bundle (mock LLM) | No LLM requests — set DEEPSEEK_API_KEY in profile settings for live headless runs |
| D5 | PASS | Remex available for DSH runtime memory I/O | {"status":"ok","dependencies":{"postgres":{"reachable":true,"pgvector":true},"redis":{"pong":true},"worker":{"heartbeat_age_seconds":0.139,"fresh":true,"stale_after_seconds":15}}} |

## Issues

_No issues recorded._