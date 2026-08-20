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

---

## Progress (loops append here on milestone completion — newest last)

- _(none yet — first loop fills this)_
