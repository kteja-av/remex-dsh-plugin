# Write-Gate Latency Report

**Date:** 2026-08-27T16:25:04.233Z
**Remex:** http://localhost:8000
**Concurrency burst:** 5

## Notes

- Engine-only jobs POST `/v1/memories:evaluate` then poll `/v1/jobs/{id}` directly (no plugin).
- Live config: no NIM/Gemini judge → `LocalRuleJudge`; `EXTRACTION_ENABLED=false`, `RECONCILIATION_ENABLED=false`.

## Jobs

| idx | label | enqueue ms | poll ms | total ms | status | outcome |
|-----|-------|-----------|---------|----------|--------|---------|
| 0 | warmup | 5.0 | 486.0 | 491.0 | finished | admitted |
| 1 | seq | 5.8 | 492.5 | 498.3 | finished | admitted |
| 2 | seq | 2.5 | 503.4 | 505.9 | finished | admitted |
| 3 | seq | 4.2 | 494.0 | 498.2 | finished | admitted |
| 0 | burst | 0.0 | 490.1 | 490.1 | finished | rejected |
| 1 | burst | 0.0 | 60.9 | 60.9 | finished | rejected |
| 2 | burst | 0.0 | 119.1 | 119.1 | finished | rejected |
| 3 | burst | 0.0 | 119.6 | 119.6 | finished | rejected |
| 4 | burst | 0.0 | 490.3 | 490.3 | finished | rejected |
| 0 | admit-burst | 0.0 | 498.1 | 498.1 | finished | rejected |
| 1 | admit-burst | 0.0 | 497.2 | 497.2 | finished | rejected |
| 2 | admit-burst | 0.0 | 499.0 | 499.0 | finished | rejected |
| 3 | admit-burst | 0.0 | 495.8 | 495.8 | finished | rejected |
| 4 | admit-burst | 0.0 | 499.7 | 499.7 | finished | rejected |
| 0 | plugin-good (plugin client) | 2.7 | 483.3 | 486.1 | finished | admitted |
| 1 | plugin-good (plugin client) | 4.0 | 492.5 | 496.5 | finished | admitted |
