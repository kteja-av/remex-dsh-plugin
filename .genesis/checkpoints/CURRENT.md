# CURRENT — remex-dsh-plugin

**Status:** M10 complete (final L4 APPROVE)  
**Updated:** 2026-08-27  
**Next milestone:** M11 (memory_search via `defineTool`)  
**Demo command:** `pnpm test tests/core-memory.test.ts tests/context-injector.test.ts`

## Active loop state
- active_loop: idle
- target: —
- last_gate: L4 APPROVE (final)
- last_action: final fresh-context L4 confirmed all criteria + invariants; build output regenerated
- model: grok

## Notes
- M10 core-memory read integration shipped: typed `readCoreMemory`, `<remex_core_memory>` after `<remex_memory>`, gate default off, fail-open
- Trail: L4 REJECT (ordering) → fix → re-verify APPROVE → build note resolved → final APPROVE
