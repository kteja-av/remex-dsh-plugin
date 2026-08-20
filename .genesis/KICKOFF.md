# KICKOFF — paste this to start or resume a remex-dsh-plugin session cold

> Works in any agent. Replace the skill-invocation syntax per `AGENT-ADAPTERS.md`
> (Hermes `skill_view(name=…)` · Claude Code `Skill`/`/x` · Codex `$x` · Cursor: load skills from path). The rest is identical.

```
Load skills (skill canon — always):
- agentic-swe-master          (orchestrator — routes everything)
- coding-orchestrator         (route before any code)
- modular-architecture, production-readiness, llmops-ai-agents

Read in order:
- .genesis/DONE.html                          (locked spec + definition of done + plan)
- .genesis/PLAN.md                            (milestones — currently M1..M7)
- .genesis/wiki/index.md                      (Remex provider, fail-open, Cordis patch concepts)
- .genesis/context-graph.json                 (invariants: plugin_boundary, retrieve_fail_open, write_non_blocking)
- .genesis/implementation-notes.html          (search for milestone nouns — what's LIVE now)
- .genesis/LOOPS.md                           (cheap=claude-haiku-4-5, flagship=claude-opus-4-5, budget=50000)
- .genesis/checkpoints/CURRENT.md             (where we are)

Project context:
- Build @your-scope/remex-dsh-plugin — Cordis MemoryService over Remex HTTP (retrieve pre-step, evaluate post-turn).
- Reference: dsh-mem pattern, remex-ai GET /v1/memories:retrieve?query=... (NOT q), POST /v1/memories:evaluate.
- Repo path: /Users/krishnateja/Documents/Git projects/remex-dsh-plugin

Then:
1. Pick M1 (next unstarted) or resume from CURRENT.md.
2. Run G0 EXISTENCE PRE-FLIGHT first. Verdict UNBUILT → continue. PARTIAL → revise scope.
   BUILT → halt and surface the existing artifact.
3. Run L1 BUILD per LOOPS.md exactly. Enforce G0 + all 5 gates (G1 Skill, G2 Progress,
   G3 Cost, G4 Quality, G5 Verify). Gates are COMPUTED (run the command, paste exit code), not narrated.
4. Checkpoint every iteration to .genesis/checkpoints/<milestone-id>.md.
5. Spawn L2 DEBUG / L3 RESEARCH as needed. Exit through L4 VERIFY (separate model, fresh context).
   explain-diff: off
6. On milestone done: update CURRENT.md, append a row to implementation-notes.html "what's live",
   append progress to PLAN.md.

M1 demo command (proves done):
  curl -sf http://localhost:8000/v1/health && pnpm install && pnpm exec tsc --noEmit

Stop rules: if any gate fails 3 times, stop, write what you tried to CURRENT.md, surface to the user.
Never mark a milestone done without L4 VERIFY APPROVE. Never edit DONE.html / PLAN.md without being asked.
```
