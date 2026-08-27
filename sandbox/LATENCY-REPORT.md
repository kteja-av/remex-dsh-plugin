# Write-Gate Latency Report

**Date:** 2026-08-27T16:46:50.282Z
**Remex:** http://localhost:8000
**Concurrency burst:** 5

## Notes

- Engine-only jobs POST `/v1/memories:evaluate` then poll `/v1/jobs/{id}` directly (no plugin).
- Live config: no NIM/Gemini judge → `LocalRuleJudge`; `EXTRACTION_ENABLED=false`, `RECONCILIATION_ENABLED=false`.

## Jobs

| idx | label | enqueue ms | poll ms | total ms | status | outcome |
|-----|-------|-----------|---------|----------|--------|---------|
| 0 | warmup | 8.5 | 490.5 | 498.9 | finished | admitted |
| 1 | seq | 4.9 | 489.6 | 494.5 | finished | admitted |
| 2 | seq | 4.2 | 503.7 | 507.9 | finished | admitted |
| 3 | seq | 4.6 | 493.3 | 498.0 | finished | admitted |
| 0 | burst | 0.0 | 490.0 | 490.0 | finished | rejected |
| 1 | burst | 0.0 | 491.3 | 491.3 | finished | rejected |
| 2 | burst | 0.0 | 491.4 | 491.4 | finished | rejected |
| 3 | burst | 0.0 | 489.0 | 489.0 | finished | rejected |
| 4 | burst | 0.0 | 490.0 | 490.0 | finished | rejected |
| 0 | admit-burst | 0.0 | 175.9 | 175.9 | finished | rejected |
| 1 | admit-burst | 0.0 | 177.7 | 177.7 | finished | rejected |
| 2 | admit-burst | 0.0 | 120.2 | 120.2 | finished | rejected |
| 3 | admit-burst | 0.0 | 66.3 | 66.3 | finished | rejected |
| 4 | admit-burst | 0.0 | 119.7 | 119.7 | finished | rejected |
| 0 | plugin-good (plugin client) | 2.1 | 297.9 | 300.0 | finished | admitted |
| 1 | plugin-good (plugin client) | 4.3 | 494.9 | 499.2 | finished | admitted |
