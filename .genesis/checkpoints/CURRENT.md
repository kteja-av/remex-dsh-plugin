# CURRENT — remex-dsh-plugin

**Status:** M3 complete (L4 APPROVE) — ready for M4 BUILD loop  
**Updated:** 2026-08-20  
**Next milestone:** M4 — Context injector (retrieve before inference)  
**Demo command:** `pnpm test tests/context-injector.test.ts`

## Active loop state
- active_loop: idle
- target: M4
- last_gate: L4 APPROVE
- last_action: M3 demo `pnpm test tests/remex-provider.test.ts && grep -q remex-provider cordis.patch.yml` → pass
- model: composer

## Notes
- `cordis.patch.yml` mounts `@your-scope/remex-dsh-plugin/remex-provider` as `id: memory`
- Replace placeholder tenant/user UUIDs in patch config before real use
