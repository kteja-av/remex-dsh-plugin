# CURRENT — remex-dsh-plugin

**Status:** Genesis complete — ready for M1 BUILD loop  
**Updated:** 2026-08-20  
**Next milestone:** M1 — Baseline verification + package skeleton  
**Demo command:** `curl -sf http://localhost:8000/v1/health && pnpm install && pnpm exec tsc --noEmit`

## Genesis checklist
- [x] DONE.html §1 cognitive job (G0)
- [x] .genesis/ scaffolded (G1)
- [x] context-graph.json — 9 nodes, 13 edges, 3 invariants (G2)
- [x] wiki/index.md seeded from agentic-swe-kit (G3)
- [x] DONE.html §2 definition of done from phase gates (G4)
- [x] PLAN.md — 7 milestones with demo commands (G5)
- [x] KICKOFF.md filled (G6)

## Notes
- User plans live in cmis-memory: `Remex_DSH_Plugin_Plan.md`, `Deepseek_Harness_plugin_with_remex.md`
- remex-ai sibling expected at ../remex-ai for Phase 0 health check
- Chosen architecture: out-of-tree Cordis plugin (Approach A in PLAN.md brainstorm)
