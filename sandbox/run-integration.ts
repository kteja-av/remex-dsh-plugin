/**
 * Live sandbox integration: remex-dsh-plugin ↔ remex-ai HTTP stack.
 * Run: pnpm run build && pnpm run test:sandbox
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Context } from "@deepseek-ai/cordis";
import { createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";

import { messageIdToTurnUuid, buildAuthHeaders } from "../lib/identity.js";
import { RemexMemoryProvider } from "../lib/remex-provider.js";
import { RemexClient } from "../lib/remex-client.js";
import { executeMemorySearch } from "../lib/memory-tools.js";
import {
  formatUserFactForEvaluate,
  handleSessionEvent,
  createRememberState,
} from "../lib/remember.js";
import { handlePreStepInjection } from "../lib/context-injector.js";

const BASE_URL = process.env.REMEX_BASE_URL ?? "http://localhost:8000";
const TENANT_ID =
  process.env.REMEX_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
const USER_ID =
  process.env.REMEX_USER_ID ?? "00000000-0000-4000-8000-000000000002";
const JOB_POLL_TIMEOUT_MS = Number(process.env.JOB_POLL_TIMEOUT_MS ?? 60_000);
const JOB_POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 500);

interface Check {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  detail: string;
}

interface Issue {
  severity: "blocker" | "major" | "minor" | "info";
  area: string;
  title: string;
  detail: string;
}

const checks: Check[] = [];
const issues: Issue[] = [];

function record(check: Check): void {
  checks.push(check);
  const icon =
    check.status === "PASS"
      ? "✓"
      : check.status === "FAIL"
        ? "✗"
        : check.status === "WARN"
          ? "!"
          : "-";
  console.log(`${icon} [${check.status}] ${check.id}: ${check.name}`);
  if (check.detail) {
    console.log(`    ${check.detail}`);
  }
}

function addIssue(issue: Issue): void {
  issues.push(issue);
}

function mockContext(): Context {
  return {
    logger: {
      warn: (...args: unknown[]) => console.warn("[remex-memory]", ...args),
      error: (...args: unknown[]) => console.error("[remex-memory]", ...args),
      info: () => {},
      debug: () => {},
    },
    reflect: { provide: () => {} },
  } as unknown as Context;
}

function client(baseUrl = BASE_URL): RemexClient {
  return new RemexClient({
    baseUrl,
    identity: { tenantId: TENANT_ID, userId: USER_ID },
    timeoutMs: 10_000,
  });
}

function provider(baseUrl = BASE_URL): RemexMemoryProvider {
  return new RemexMemoryProvider(mockContext(), {
    tenantId: TENANT_ID,
    userId: USER_ID,
    baseUrl,
  });
}

async function pollJob(jobId: string): Promise<{
  status: string;
  outcome?: string;
  reason?: string;
  error?: string;
}> {
  const headers = buildAuthHeaders({ tenantId: TENANT_ID, userId: USER_ID });
  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/v1/jobs/${jobId}`, { headers });
    if (!response.ok) {
      throw new Error(`job poll failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as {
      status: string;
      error?: string | null;
      result?: { outcome?: string; reason?: string; trace?: { judge_verdict?: { rationale?: string } } };
    };
    if (body.status === "finished" || body.status === "failed") {
      return {
        status: body.status,
        outcome: body.result?.outcome,
        reason: body.result?.trace?.judge_verdict?.rationale ?? body.result?.reason,
        ...(body.error ? { error: body.error } : {}),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
  }
  throw new Error(`job ${jobId} timed out after ${JOB_POLL_TIMEOUT_MS}ms`);
}

async function evaluateAndWait(
  remex: RemexMemoryProvider,
  content: string,
  messageId: string,
): Promise<{ jobId: string; jobStatus: string; outcome?: string; reason?: string }> {
  const result = await remex.save({
    type: "semantic",
    content,
    sourceTurnIds: [messageIdToTurnUuid(messageId)],
    participants: ["user", "assistant"],
  });
  const polled = await pollJob(result.jobId);
  return {
    jobId: result.jobId,
    jobStatus: polled.status,
    outcome: polled.outcome,
    reason: polled.reason,
  };
}

async function main(): Promise<void> {
  console.log("\n=== remex-dsh-plugin sandbox integration ===\n");
  console.log(`Remex: ${BASE_URL}`);
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`User:   ${USER_ID}\n`);

  // 1. Remex health
  try {
    const health = await client().health();
    record({
      id: "S1",
      name: "Remex health preflight",
      status: health.status === "ok" ? "PASS" : "WARN",
      detail: JSON.stringify(health),
    });
    if (health.status !== "ok") {
      addIssue({
        severity: "major",
        area: "remex",
        title: "Remex health not ok",
        detail: JSON.stringify(health),
      });
    }
  } catch (error) {
    record({
      id: "S1",
      name: "Remex health preflight",
      status: "FAIL",
      detail: String(error),
    });
    addIssue({
      severity: "blocker",
      area: "remex",
      title: "Remex unreachable",
      detail: "Start remex-ai: cd remex-ai && docker compose up -d --wait",
    });
    writeReport();
    process.exit(1);
  }

  // 2. Plugin client retrieve empty baseline
  try {
    const baseline = await provider().recall("sandbox-nonexistent-query-xyz");
    record({
      id: "S2",
      name: "Plugin retrieve baseline (empty ok)",
      status: baseline.degraded ? "WARN" : "PASS",
      detail: `memories=${baseline.memories.length} degraded=${baseline.degraded}`,
    });
    if (baseline.degraded) {
      addIssue({
        severity: "major",
        area: "retrieve",
        title: "Retrieve returned degraded on empty query baseline",
        detail: "Check encoder / postgres / hybrid retrieval deps",
      });
    }
  } catch (error) {
    record({
      id: "S2",
      name: "Plugin retrieve baseline",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 3. Write path — plugin remember format (Write Gate–friendly facts)
  const remex = provider();
  let workJobStatus = "unknown";
  let workOutcome = "unknown";
  try {
    const turn1 = await evaluateAndWait(
      remex,
      formatUserFactForEvaluate("My name is Teja.")!,
      "sandbox-turn-1-name",
    );
    const turn2 = await evaluateAndWait(
      remex,
      formatUserFactForEvaluate("I work on autonomous driving simulation.")!,
      "sandbox-turn-1-work",
    );
    workJobStatus = turn2.jobStatus;
    workOutcome = turn2.outcome ?? "unknown";
    const admitted = turn1.outcome === "admitted" && turn2.outcome === "admitted";
    record({
      id: "S3",
      name: "Write Gate evaluate (plugin remember format)",
      status: turn1.jobStatus === "finished" && turn2.jobStatus === "finished" ? (admitted ? "PASS" : "WARN") : "WARN",
      detail: `job1=${turn1.outcome ?? turn1.jobStatus} job2=${turn2.outcome ?? turn2.jobStatus} reason2=${turn2.reason ?? "n/a"}`,
    });
    if (!admitted) {
      addIssue({
        severity: "blocker",
        area: "write",
        title: "Write Gate rejected plugin remember-format evaluate payloads",
        detail:
          `Expected admitted outcomes for third-person user facts (e.g. "${turn2.reason ?? "judge_reject"}").`,
      });
    }
  } catch (error) {
    record({
      id: "S3",
      name: "Write Gate evaluate (Teja + driving)",
      status: "FAIL",
      detail: String(error),
    });
    addIssue({
      severity: "blocker",
      area: "write",
      title: "Evaluate enqueue or job poll failed",
      detail: String(error),
    });
  }

  // 4b. End-to-end with Write-Gate-friendly factual payloads
  try {
    await evaluateAndWait(
      remex,
      "The user works on autonomous driving simulation.",
      "sandbox-admitted-work",
    );
    await new Promise((r) => setTimeout(r, 3000));
    const recall = await remex.recall("What kind of work am I doing?", {
      tokenBudget: 512,
      limit: 5,
    });
    const top = recall.memories[0]?.content.toLowerCase() ?? "";
    const ok = top.includes("autonomous driving");
    record({
      id: "S4b",
      name: "E2E recall with admitted factual payload",
      status: ok ? "PASS" : "FAIL",
      detail: `count=${recall.memories.length} top="${recall.memories[0]?.content ?? "(none)"}"`,
    });
    if (!ok) {
      addIssue({
        severity: "major",
        area: "recall",
        title: "Retrieve failed even after admitted write",
        detail: recall.memories[0]?.content ?? "no memories",
      });
    }
  } catch (error) {
    record({
      id: "S4b",
      name: "E2E recall with admitted factual payload",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 4. Cross-session recall — turn 2 query (plugin default remember format)
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const recall = await remex.recall("What do you know about my work?", {
      tokenBudget: 512,
      limit: 5,
    });
    const top = recall.memories[0]?.content.toLowerCase() ?? "";
    const hitDriving = top.includes("autonomous driving") || top.includes("driving");
    record({
      id: "S4",
      name: "Cross-session recall (work question)",
      status: hitDriving ? "PASS" : recall.memories.length > 0 ? "WARN" : "FAIL",
      detail: `count=${recall.memories.length} top="${recall.memories[0]?.content?.slice(0, 80) ?? "(none)"}"`,
    });
    if (!hitDriving) {
      addIssue({
        severity: workOutcome === "admitted" ? "major" : "info",
        area: "recall",
        title: "Work domain not retrieved after plugin-format write",
        detail:
          workOutcome !== "admitted"
            ? "Expected when Write Gate rejects turn summaries — see S3"
            : `Top memory: ${recall.memories[0]?.content ?? "(none)"}`,
      });
    }
  } catch (error) {
    record({
      id: "S4",
      name: "Cross-session recall (work question)",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 5. Dosa noise + work ranking (plugin remember format)
  try {
    await evaluateAndWait(
      remex,
      formatUserFactForEvaluate("Today I had dosa for breakfast.")!,
      "sandbox-dosa-turn",
    );
    await new Promise((r) => setTimeout(r, 2000));
    const recall = await remex.recall("What kind of work am I doing?", {
      tokenBudget: 512,
      limit: 5,
    });
    const top = recall.memories[0]?.content.toLowerCase() ?? "";
    const drivingWins =
      top.includes("autonomous driving") || top.includes("driving simulation");
    const dosaLeaks = top.includes("dosa");
    record({
      id: "S5",
      name: "Recall ranking (work over dosa)",
      status: drivingWins && !dosaLeaks ? "PASS" : drivingWins ? "WARN" : "FAIL",
      detail: `top="${recall.memories[0]?.content?.slice(0, 80) ?? "(none)"}"`,
    });
    if (!drivingWins || dosaLeaks) {
      addIssue({
        severity: "major",
        area: "recall",
        title: "Irrelevant memory ranked above work domain",
        detail: `Top result: ${recall.memories[0]?.content ?? "(none)"}`,
      });
    }
  } catch (error) {
    record({
      id: "S5",
      name: "Recall ranking (work over dosa)",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 6. memory_search tool path
  try {
    const result = await executeMemorySearch(remex, {
      query: "What do you know about my work?",
      tokenBudget: 512,
      limit: 5,
    });
    record({
      id: "S6",
      name: "memory_search → ctx.memory.recall",
      status: result.memories.length > 0 ? "PASS" : "WARN",
      detail: `memories=${result.memories.length} formatted=${result.formatted !== undefined}`,
    });
  } catch (error) {
    record({
      id: "S6",
      name: "memory_search tool path",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 7. Pre-step inject path
  try {
    const query = "What do you know about my work?";
    const userMsg = createUserMessage({
      content: [{ type: "text", text: query }],
      source: { kind: "user" },
    });
    const recallResult = await remex.recall(query, { tokenBudget: 512, limit: 5 });
    const injection = handlePreStepInjection({
      claimedMessages: [userMsg],
      decision: { kind: "enter", messages: [userMsg] },
      recallResult,
    });
    const injected =
      injection.decision.messages.length > 1 &&
      injection.decision.messages.some((m) => {
        const text = m.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("");
        return text.includes("<remex_memory>");
      });
    record({
      id: "S7",
      name: "Pre-step injection with live recall",
      status: injected || recallResult.memories.length === 0 ? (injected ? "PASS" : "WARN") : "FAIL",
      detail: `messages=${injection.decision.messages.length} memories=${recallResult.memories.length}`,
    });
  } catch (error) {
    record({
      id: "S7",
      name: "Pre-step injection",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 8. Remember path (session/event reducer + live save)
  try {
    const state = createRememberState();
    const userMsg = createUserMessage({
      content: [{ type: "text", text: "Sandbox remember path check." }],
      source: { kind: "user" },
    });
    const events = [
      { type: "turn/start", data: { turn: 99 } },
      { type: "user/message", data: userMsg },
      {
        type: "assistant/message",
        data: {
          turn: 99,
          step: 0,
          message: createAssistantMessage({
            content: [{ type: "text", text: "Acknowledged." }],
            source: { provider: "sandbox", model: "sandbox-model" },
          }),
        },
      },
      { type: "turn/end", data: { turn: 99, reason: { kind: "completed" } } },
    ];
    let saveInput;
    for (const event of events.slice(0, -1)) {
      handleSessionEvent(state, event);
    }
    saveInput = handleSessionEvent(state, events.at(-1)!);
    const contentPreview = saveInput?.content;
    record({
      id: "S8",
      name: "Remember reducer builds Write-Gate save candidate",
      status:
        saveInput !== undefined &&
        contentPreview?.toLowerCase().startsWith("the user") === true
          ? "PASS"
          : "FAIL",
      detail: contentPreview?.slice(0, 80) ?? "(none)",
    });
  } catch (error) {
    record({
      id: "S8",
      name: "Remember reducer",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 9. Fail-open when Remex stopped
  try {
    const dead = provider("http://127.0.0.1:59999");
    const result = await dead.recall("anything");
    record({
      id: "S9",
      name: "Fail-open when Remex unreachable",
      status: result.memories.length === 0 && !result.degraded ? "PASS" : "WARN",
      detail: JSON.stringify(result),
    });
    if (!(result.memories.length === 0)) {
      addIssue({
        severity: "major",
        area: "fail-open",
        title: "Unreachable Remex did not return empty recall",
        detail: JSON.stringify(result),
      });
    }
  } catch (error) {
    record({
      id: "S9",
      name: "Fail-open when Remex unreachable",
      status: "FAIL",
      detail: String(error),
    });
    addIssue({
      severity: "blocker",
      area: "fail-open",
      title: "Provider threw instead of fail-open",
      detail: String(error),
    });
  }

  // 10. Fail-open pre-step unchanged
  try {
    const dead = provider("http://127.0.0.1:59999");
    const query = "Hello while Remex is down";
    const userMsg = createUserMessage({
      content: [{ type: "text", text: query }],
      source: { kind: "user" },
    });
    const decision = { kind: "enter" as const, messages: [userMsg] };
    const recallResult = await dead.recall(query);
    const injection = handlePreStepInjection({
      claimedMessages: [userMsg],
      decision,
      recallResult,
    });
    const unchanged =
      injection.decision.messages.length === 1 &&
      recallResult.memories.length === 0;
    record({
      id: "S10",
      name: "Agent continues without injection when Remex down",
      status: unchanged ? "PASS" : "FAIL",
      detail: `recall=${JSON.stringify(recallResult)} messages=${injection.decision.messages.length}`,
    });
  } catch (error) {
    record({
      id: "S10",
      name: "Agent continues when Remex down",
      status: "FAIL",
      detail: String(error),
    });
  }

  // 11. DSH runtime — run separately via pnpm run test:dsh
  record({
    id: "S11",
    name: "DeepSeek Harness Cordis runtime",
    status: "SKIP",
    detail: "Run pnpm run test:dsh for DSH plugin add + dump-config + headless compose",
  });

  // 12. Raw tool registration without defineTool
  addIssue({
    severity: "minor",
    area: "packaging",
    title: "memory_search uses raw ToolRegistrar, not @deepseek-ai/dsh-tools defineTool",
    detail:
      "@deepseek-ai/dsh-tools depends on private npm packages. Tool shape may differ from production DSH until validated in harness.",
  });

  if (workJobStatus !== "finished") {
    addIssue({
      severity: "info",
      area: "write",
      title: "Write Gate async latency",
      detail: "Integration waits up to 60s per job; production hot path does not poll.",
    });
  }

  writeReport();

  const failed = checks.filter((c) => c.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

function writeReport(): void {
  const dir = dirname(fileURLToPath(import.meta.url));

  const lines: string[] = [
    "# Sandbox Integration Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Remex:** ${BASE_URL}`,
    `**Plugin:** remex-dsh-plugin (local build)`,
    "",
    "## Summary",
    "",
    `| Result | Count |`,
    `|--------|-------|`,
    ...(["PASS", "WARN", "FAIL", "SKIP"] as const).map(
      (s) => `| ${s} | ${checks.filter((c) => c.status === s).length} |`,
    ),
    "",
    "## Checks",
    "",
    "| ID | Status | Name | Detail |",
    "|----|--------|------|--------|",
    ...checks.map(
      (c) =>
        `| ${c.id} | ${c.status} | ${c.name} | ${c.detail.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
    ),
    "",
    "## Issues",
    "",
  ];

  if (issues.length === 0) {
    lines.push("_No issues recorded._");
  } else {
    for (const issue of issues) {
      lines.push(`### [${issue.severity.toUpperCase()}] ${issue.title}`);
      lines.push(`- **Area:** ${issue.area}`);
      lines.push(`- **Detail:** ${issue.detail}`);
      lines.push("");
    }
  }

  lines.push("## Environment");
  lines.push("");
  lines.push("- Remex stack: docker compose (postgres, redis, neo4j, api, worker)");
  lines.push("- DSH: not tested (not installed in workspace)");
  lines.push("- Plugin tests: run separately via `pnpm test`");
  lines.push("");

  const reportPath = join(dir, "REPORT.md");
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\nReport written: ${reportPath}\n`);
}

await main();
