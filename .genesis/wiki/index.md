# Wiki Index — remex-dsh-plugin

The project knowledge base. Same schema as the agentic-swe-kit wiki: concept pages in `concepts/`,
each with frontmatter and ≥2 `[[wikilinks]]`. The L3 RESEARCH loop writes here; G0 reads here first.

> **Read this file before any milestone (G0 step 1).** Pick candidate pages by name-matching the
> milestone's nouns, then drill in. The wiki is what prevents rebuilding work that already exists.

## Entities (the things this system has)

- [[concepts/MemoryService]] — abstract recall/save seam; swap Remex vs in-memory without touching DSH consumers
- [[concepts/RemexMemoryProvider]] — Cordis `memory` service over HTTP
- [[concepts/ContextInjector]] — `agent/pre-step` waterfall consumer for retrieve-before-inference
- [[concepts/IdentityMapping]] — tenant/user headers + MessageId → UUID v5 for provenance

## Concepts (how it works)

- [[concepts/FailOpenRetrieve]] — read path returns empty context when Remex unavailable
- [[concepts/AsyncEvaluateWrite]] — POST /v1/memories:evaluate after turn; never block reply
- [[concepts/RemexMemoryBlock]] — `<remex_memory>` formatting and dedupe on tool continuations
- [[concepts/CordisPatchMount]] — mount provider via `cordis.patch.yml` profile overlay

## Sources (research distilled by L3)

- `docs/Remex_DSH_Plugin_Plan.md` — authoritative repo layout, API contract, milestone order (user plan)
- `docs/Deepseek_Harness_plugin_with_remex.md` — integration narrative and MVP vertical slice
- [dsh-mem](https://github.com/Jelee0145/dsh-mem) — reference Cordis MemoryService + patch pattern
- [remex-ai routes_retrieve.py](https://github.com/remex-ai/remex-ai) — `query` param (not `q`), degraded flag

## Seeded from agentic-swe-kit

Relevant global concept pages for this project's phases (pointers only — read on demand):

- `$AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/_pre-consolidation/Plugin-Architecture-A-design-pattern-where-low-level-detail-modules-UI-database-.md` — out-of-tree plugin vs core fork (Phase 1)
- `$AGENTIC_SWE_WIKI_ROOT/clean-architecture/concepts/Dependency-Rule.md` — adapter/domain dependency direction (Phase 1)
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Timeouts.md` — every Remex HTTP call bounded (Phase 3, 12)
- `$AGENTIC_SWE_WIKI_ROOT/release-it/concepts/Circuit-Breaker.md` — fail-open retrieve under outage (Phase 12)
- `$AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/RAG-Architecture.md` — retrieval injection, token budget (Phase 6)
- `$AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/_pre-consolidation/Tool-Use-Pattern-Agent-calls-external-functions-search-calculator-run-code-send-.md` — memory_search tool (Phase 7)
- `$AGENTIC_SWE_WIKI_ROOT/llmops-ai-agents/concepts/_pre-consolidation/Tenant-Context-Isolation-Thread-local-or-request-scoped-tenant-binding-that-auto.md` — X-Tenant-ID / X-User-ID (Phase 11)
- `$AGENTIC_SWE_WIKI_ROOT/distributed-systems/overview.md` — HTTP boundary between DSH runtime and Remex CMIS (Phase 1, 12)
- `$AGENTIC_SWE_WIKI_ROOT/security-engineering/overview.md` — threat model for untrusted user content in memory blocks (Phase 11)
