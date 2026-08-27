# CURRENT — remex-dsh-plugin

**Status:** M8 complete (compatibility baseline + dependency alignment)  
**Updated:** 2026-08-27  
**Next milestone:** M9 (historical retrieve opt-in)  
**Demo command:** `pnpm install && pnpm test && pnpm exec tsc --noEmit && pnpm run test:sandbox`

## Active loop state
- active_loop: idle
- target: M8
- last_gate: L4 APPROVE
- last_action: dsh-llm → 0.1.0-rc.8; unit 52/52; tsc clean; sandbox 10 PASS / 1 WARN / 1 SKIP / 0 FAIL
- model: grok

## Notes
- `@deepseek-ai/dsh-llm` now resolves `0.1.0-rc.8`, matching `@deepseek-ai/dsh` rc.8
- No `src/**` or wire-contract changes; M8 is dependency + docs alignment only
- README Status documents remex-ai M8–M25 compatibility and optional (not-yet-consumed) M14/M18/M21/M23–M25 features
