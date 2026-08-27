# PLAN — remex-dsh-plugin

The machine-parseable implementation plan. Mirrors the milestone table in `DONE.html` (DONE.html is the
human/visual view; this is the one loops read). Sliced so each milestone ships in one L1 BUILD pass.

> Slicing rule: a milestone must have (a) a single clear outcome, (b) an exact **demo command** that
> proves it, and (c) a freeze boundary of files it may touch. If you can't write the demo command,
> the milestone is too vague — split it.

---

## Brainstorm (G0.5 — fill before slicing milestones)

### Approach A — Out-of-tree Cordis plugin (dsh-mem pattern)
TypeScript sibling package implementing `MemoryService` + `cordis.patch.yml` overlay. DSH owns the agent loop; Remex owns memory over HTTP. Retrieve on `agent/pre-step`, evaluate on `session/event`.
- Strengths: No fork of DSH or Remex; swappable provider; matches DSH plugin-first architecture; fail-open read isolated in adapter.
- Weaknesses: Must track Cordis/DSH preview API churn; patch path friction for local dev.

### Approach B — Fork DeepSeek Harness and embed Remex calls in core
Patch DSH session/context code to call Remex directly from harness internals.
- Strengths: Fewer indirection layers; potentially simpler local debugging.
- Weaknesses: Tight coupling to fast-moving preview codebase; hard to publish or swap memory backends; violates Remex/DSH separation goal.

### Approach C — In-process memory stub with optional Remex sync
Ship a local in-memory provider first; background sync to Remex.
- Strengths: Agent works offline; faster initial iteration without Docker.
- Weaknesses: Two sources of truth; sync/consistency complexity; cross-session recall only as good as sync; fights Remex as system-of-record.

### Chosen: Approach A — Matches spec, dsh-mem reference, and “DSH owns agent, Remex owns memory” without modifying either core runtime.

---

## Milestones

### M1 — Baseline verification + package skeleton
- **Outcome:** Remex health + DSH vanilla build verified; empty TS package with pinned Cordis/DSH deps, `cordis.patch.yml` stub, vitest/tsc wired.
- **Phase (swe-master):** Phase 0 (Cognitive) + Phase 1 (Architecture)
- **Files / freeze boundary:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `cordis.patch.yml`, `README.md`, `src/index.ts`
- **Demo command:** `curl -sf http://localhost:8000/v1/health && pnpm install && pnpm exec tsc --noEmit`
- **Success criteria:** Health returns `{"status":"ok"}`; package installs; tsc passes on skeleton.
- **Loops:** L1, L4
- **Skills:** canon + tdd + modular-architecture
- **Token budget:** 50000

### M2 — Remex HTTP client + unit tests
- **Outcome:** `remex-client.ts` implements health, retrieve (`query` param), evaluate (202 + job_id); mocked fetch tests match FastAPI response shapes.
- **Phase:** Phase 3 (Backend/API) + Phase 12 (Reliability)
- **Files:** `src/remex-client.ts`, `src/identity.ts`, `tests/remex-client.test.ts`
- **Demo command:** `pnpm test tests/remex-client.test.ts`
- **Success criteria:** All client tests green; timeouts configured; retrieve maps `degraded` and empty on error internally caught by provider layer next milestone.
- **Loops:** L1, L4
- **Skills:** canon + tdd + production-readiness
- **Token budget:** 50000

### M3 — MemoryService provider + Cordis mount
- **Outcome:** `memory.ts` abstract service; `remex-provider.ts` registered as Cordis `memory`; patch YAML mounts provider.
- **Phase:** Phase 1 + Phase 6
- **Files:** `src/memory.ts`, `src/remex-provider.ts`, `cordis.patch.yml`, `tests/remex-provider.test.ts`
- **Demo command:** `pnpm test tests/remex-provider.test.ts && grep -q remex-provider cordis.patch.yml`
- **Success criteria:** Provider recall/save delegate to client; fail-open empty recall on thrown errors; patch references provider path.
- **Loops:** L1, L4
- **Skills:** canon + tdd + modular-architecture
- **Token budget:** 50000

### M4 — Context injector (retrieve before inference)
- **Outcome:** `context-injector.ts` on `agent/pre-step`: await `next()`, recall from last user message, inject `<remex_memory>` via `format-context.ts` with dedupe fingerprint.
- **Phase:** Phase 6 (Memory) + Phase 5 (LLM context)
- **Files:** `src/context-injector.ts`, `src/format-context.ts`, `tests/context-injector.test.ts`
- **Demo command:** `pnpm test tests/context-injector.test.ts`
- **Success criteria:** Waterfall folds injected message after claimed batch; dedupe skips identical recall on tool continuations.
- **Loops:** L1, L3, L4
- **Skills:** canon + tdd + llmops-ai-agents
- **Token budget:** 50000

### M5 — Async remember path
- **Outcome:** `remember.ts` listens `session/event`, enqueues `POST /v1/memories:evaluate` without awaiting job completion; UUID v5 `source_turn_ids`.
- **Phase:** Phase 4 (Workflow) + Phase 12
- **Files:** `src/remember.ts`, `tests/remember.test.ts`
- **Demo command:** `pnpm test tests/remember.test.ts`
- **Success criteria:** Evaluate called once per durable turn; hot path never awaits job poll; 429 logged not thrown.
- **Loops:** L1, L4
- **Skills:** canon + tdd + distributed-systems
- **Token budget:** 50000

### M6 — Cross-session recall + fail-open integration tests
- **Outcome:** Controlled Teja/driving/dosa experiment script; `failure.test.ts` proves empty retrieve when Remex API stopped.
- **Phase:** Phase 9 (Eval) + Phase 12
- **Files:** `tests/failure.test.ts`, `tests/integration/recall-experiment.test.ts` (or script)
- **Demo command:** `pnpm test tests/failure.test.ts`
- **Success criteria:** Agent continues with empty memory when api down; cross-session recall test documents expected behavior (manual or scripted).
- **Loops:** L1, L3, L4
- **Skills:** canon + tdd + production-readiness
- **Token budget:** 50000

### M7 — memory_search tool + packaging docs
- **Outcome:** `memory-tools.ts` registers explicit recall tool; README with patch install; full test suite + typecheck clean.
- **Phase:** Phase 7 (Tooling) + Phase 17 (DX)
- **Files:** `src/memory-tools.ts`, `README.md`, `tests/memory-tools.test.ts`
- **Demo command:** `pnpm test && pnpm exec tsc --noEmit`
- **Success criteria:** Tool calls `ctx.memory.recall`; README documents env config and `dsh plugin` / local patch flow.
- **Loops:** L1, L2, L4
- **Skills:** canon + tdd + llmops-ai-agents
- **Token budget:** 50000

### M8 — Compatibility baseline + dependency alignment (remex-ai M8–M25)
- **Outcome:** The plugin's dependencies and docs are aligned with the current remex-ai backend (M8–M25) and the DSH `rc.8` ecosystem. Existing provider, injector, remember, and `memory_search` paths are proven unchanged against the current remex-ai HTTP surface without touching the wire contract.
- **Phase:** Phase 0 (Cognitive) + Phase 12 (Reliability)
- **Files / freeze boundary:** `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `README.md`, `sandbox/run-integration.ts`
- **Demo command:** `pnpm install && pnpm test && pnpm exec tsc --noEmit && pnpm run test:sandbox`
- **Success criteria:** `@deepseek-ai/dsh-llm` resolves to `0.1.0-rc.8` (matching `@deepseek-ai/dsh`); all unit tests pass with zero source changes outside the freeze boundary; sandbox integration passes health, evaluate, job poll, and cross-session recall against current remex-ai; README "Status" section reflects M8–M25 compatibility and notes which features remain optional integrations.
- **Loops:** L1, L4
- **Skills:** canon + tdd + production-readiness
- **Token budget:** 50000

### M9 — Historical retrieve opt-in
- **Outcome:** The retrieve seam exposes an optional `historical` flag forwarded as the M14 `historical=true` query param, letting callers explicitly request expired/superseded assertions while the default active-only behavior is preserved.
- **Phase:** Phase 6 (Memory) + Phase 12 (Reliability)
- **Files / freeze boundary:** `src/remex-client.ts`, `src/memory.ts`, `src/remex-provider.ts`, `tests/remex-client.test.ts`, `tests/remex-provider.test.ts`
- **Demo command:** `pnpm test tests/remex-client.test.ts tests/remex-provider.test.ts`
- **Success criteria:** `historical=true` is emitted only when the caller opts in; the param is omitted from the query string by default; provider recall passes `historical` through `RecallOptions` unchanged; all existing client/provider tests remain green.
- **Loops:** L1, L4
- **Skills:** canon + tdd + production-readiness
- **Token budget:** 50000

### M10 — Core memory (M18) read integration
- **Outcome:** The plugin reads the tenant/user core-memory blocks (`persona`, `human`, `task_scratchpad`) from the remex-ai M18 endpoints and folds a bounded, owner-scoped working-memory block into the pre-step context alongside the episodic/semantic recall block.
- **Phase:** Phase 6 (Memory) + Phase 5 (LLM context)
- **Files / freeze boundary:** `src/remex-client.ts` (core-memory read methods), `src/core-memory.ts` (new), `src/context-injector.ts`, `src/format-context.ts`, `cordis.patch.yml`, `tests/core-memory.test.ts`, `tests/context-injector.test.ts`
- **Demo command:** `pnpm test tests/core-memory.test.ts tests/context-injector.test.ts`
- **Success criteria:** `GET /v1/core-memory` is parsed into typed blocks with version, content, and source turns; a `coreMemoryEnabled` config gate defaults off so existing behavior is unchanged; when enabled, the pre-step injection adds a distinct `<remex_core_memory>` block after `<remex_memory>`; core-memory read failures fail open and never block the agent; the Cordis patch exposes the new config without changing default tenant/user wiring.
- **Loops:** L1, L4
- **Skills:** canon + tdd + llmops-ai-agents
- **Token budget:** 50000

### M11 — memory_search via `defineTool`
- **Outcome:** `memory_search` is registered through the canonical `@deepseek-ai/dsh-tools` `defineTool` helper instead of the raw `ToolRegistrar` seam, matching the production DSH tool contract while preserving the existing recall-backed execute path.
- **Phase:** Phase 7 (Tooling) + Phase 17 (DX)
- **Files / freeze boundary:** `src/memory-tools.ts`, `package.json`, `tests/memory-tools.test.ts`
- **Demo command:** `pnpm test tests/memory-tools.test.ts && pnpm exec tsc --noEmit`
- **Success criteria:** the tool registers with the same name and JSON schema via `defineTool`; `executeMemorySearch` behavior is unchanged; `@deepseek-ai/dsh-tools` is added as a dependency at `^0.1.0-rc.8`; typecheck is clean against the new tool definition types.
- **Loops:** L1, L4
- **Skills:** canon + tdd + llmops-ai-agents
- **Token budget:** 50000

---

## Progress (loops append here on milestone completion — newest last)

- **M11 — memory_search via `defineTool` · DONE 2026-08-27.** L1 BUILD (2 iters) → G4 computed
  green (`pnpm test tests/memory-tools.test.ts && pnpm exec tsc --noEmit` 7/7 exit 0; full
  `pnpm test` 66/66 exit 0; `pnpm run build` exit 0) → L4 VERIFY APPROVE (separate fresh-context
  subagent; all 4 success criteria + 3 invariants held; caret spec note resolved in iter 2).
  Live: `memory_search` registered via canonical `@deepseek-ai/dsh-tools` `defineTool` (same
  name/schema, output contract + render, cancellation-aware execute); raw `ToolRegistrar` seam
  removed; duplicate Cordis event augmentations removed in favor of canonical dsh-agent/dsh-session
  types.
- **M10 — Core memory (M18) read integration · DONE 2026-08-27.** L1 BUILD (2 iters) → G4 computed
  green (`pnpm test tests/core-memory.test.ts tests/context-injector.test.ts` 18/18 exit 0; full
  `pnpm test` 66/66 exit 0; `pnpm exec tsc --noEmit` exit 0) → L4 REJECT (core block folded before
  recall) → iter 2 `foldAfterLastRecall` fix + ordering regression test → L4 re-verify APPROVE
  (separate fresh-context subagent; all 5 success criteria + 3 invariants held). Live:
  `RemexClient.readCoreMemory` typed M18 parse, `src/core-memory.ts` distinct
  `<remex_core_memory>` block (persona→human→task_scratchpad), `coreMemory.enabled` gate default
  off in `cordis.patch.yml`, fail-open read.
- **M9 — Historical retrieve opt-in · DONE 2026-08-27.** L1 BUILD (1 iter) → G4 computed green
  (`pnpm test tests/remex-client.test.ts tests/remex-provider.test.ts` 18/18 exit 0; full
  `pnpm test` 57/57 exit 0; `pnpm exec tsc --noEmit` exit 0; live remex-ai M25 probe
  `historical=true` and default both 200) → L4 VERIFY APPROVE (separate fresh-context subagent;
  all 4 success criteria + 3 invariants held; falsification probes passed). Live:
  `RecallOptions.historical` → `RetrieveInput.historical` → `historical=true` query param,
  strict opt-in (`=== true`), omitted by default/explicit `false`.
- **M8 — Compatibility baseline + dependency alignment (remex-ai M8–M25) · DONE 2026-08-27.** L1 BUILD
  (1 iter) → G4 computed green (`pnpm install` exit 0 with `@deepseek-ai/dsh-llm` → 0.1.0-rc.8;
  `pnpm test` 52/52 exit 0; `pnpm exec tsc --noEmit` exit 0; `pnpm run test:sandbox` 10 PASS /
  1 WARN / 1 SKIP / 0 FAIL exit 0 vs remex-ai M25 stack) → L4 VERIFY APPROVE (in-session fresh
  check; no wire-contract or `src/**` changes). Live: dsh-llm rc.8 dependency + lockfile,
  README Status for M8–M25 compatibility and optional M14/M18/M21/M23–M25 integrations.
