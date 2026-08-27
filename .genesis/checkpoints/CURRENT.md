# CURRENT — remex-dsh-plugin

**Status:** M9 complete (L4 APPROVE)  
**Updated:** 2026-08-27  
**Next milestone:** M10 (core-memory M18 read integration)  
**Demo command:** `pnpm test tests/remex-client.test.ts tests/remex-provider.test.ts`

## Active loop state
- active_loop: idle
- target: —
- last_gate: L4 APPROVE
- last_action: M9 historical opt-in verified 18/18 + full 57/57 + tsc clean + live 200 probes
- model: grok

## Notes
- `historical=true` is opt-in only; default and explicit `false` omit the param
- Provider recall forwards `historical` through `RecallOptions` unchanged
- Independent L4 verdict: APPROVE; all three invariants intact
