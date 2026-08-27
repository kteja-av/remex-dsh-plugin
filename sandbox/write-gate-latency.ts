/**
 * Headless write-gate latency measurement against the live remex-ai engine.
 *
 * Isolates WHERE the lag lives:
 *   A) Engine-only: raw HTTP POST /v1/memories:evaluate -> poll /v1/jobs/{id}
 *      (bypasses the plugin entirely). Measures remex-ai write-gate latency.
 *   B) Plugin client: RemexClient.save() (the exact call the plugin makes).
 *   C) Concurrency: N sequential submissions observed end-to-end, to detect
 *      the single-RQ-worker serialization / queue backlog.
 *
 * Run: node --experimental-strip-types sandbox/write-gate-latency.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RemexClient } from "../lib/remex-client.js";

const BASE_URL = process.env.REMEX_BASE_URL ?? "http://localhost:8000";
const TENANT_ID =
  process.env.REMEX_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
const USER_ID =
  process.env.REMEX_USER_ID ?? "00000000-0000-4000-8000-000000000002";
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 120_000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 50);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);

const headers = {
  "content-type": "application/json",
  "X-Tenant-ID": TENANT_ID,
  "X-User-ID": USER_ID,
} as const;

interface TimedJob {
  index: number;
  label: string;
  enqueueMs: number;
  completeMs: number;
  totalMs: number;
  status: string;
  outcome?: string;
}

const results: TimedJob[] = [];

function uuid(): string {
  return "00000000-0000-4000-8000-" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
}

async function enqueueRaw(content: string, sourceId: string): Promise<string> {
  const started = performance.now();
  const res = await fetch(`${BASE_URL}/v1/memories:evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "semantic",
      content,
      source_turn_ids: [sourceId],
      participants: ["user", "assistant"],
    }),
  });
  const enqueueMs = performance.now() - started;
  if (!res.ok) {
    throw new Error(`evaluate enqueue failed ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { job_id: string };
  return body.job_id;
}

async function pollJob(jobId: string): Promise<{ status: string; outcome?: string; reason?: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/v1/jobs/${jobId}`, {
      headers: { "X-Tenant-ID": TENANT_ID, "X-User-ID": USER_ID },
    });
    if (!res.ok) {
      throw new Error(`job poll failed ${res.status}`);
    }
    const job = (await res.json()) as {
      status: string;
      result?: { outcome?: string; reason?: string; trace?: { judge_verdict?: { rationale?: string } } };
    };
    if (job.status === "finished" || job.status === "failed") {
      return {
        status: job.status,
        outcome: job.result?.outcome,
        reason: job.result?.trace?.judge_verdict?.rationale ?? job.result?.reason,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`job ${jobId} timed out after ${POLL_TIMEOUT_MS}ms`);
}

/** Engine's own measured latency for the most recent write spans (latency_ms). */
async function latestSpanLatency(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE_URL}/v1/observability/spans`, {
      headers: { "X-Tenant-ID": TENANT_ID, "X-User-ID": USER_ID },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { spans?: Array<{ name?: string; latency_ms?: number }> };
    const writes = (body.spans ?? []).filter((s) => s.name === "write_gate:evaluate");
    if (writes.length === 0) return null;
    return writes[writes.length - 1]?.latency_ms ?? null;
  } catch {
    return null;
  }
}

async function measureSingle(label: string, content: string, index: number): Promise<void> {
  const sourceId = uuid();
  const t0 = performance.now();
  const jobId = await enqueueRaw(content, sourceId);
  const enqueueMs = performance.now() - t0;
  const t1 = performance.now();
  const { status, outcome, reason } = await pollJob(jobId);
  const completeMs = performance.now() - t1;
  const totalMs = performance.now() - t0;
  const spanMs = await latestSpanLatency();
  results.push({ index, label, enqueueMs, completeMs, totalMs, status, outcome });
  const line = `     job #${index} [${label}] enqueue=${enqueueMs.toFixed(1)}ms poll=${completeMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms engineSpan=${spanMs ?? "?"}ms -> ${status}/${outcome ?? "n/a"}${reason ? ` (${reason})` : ""}`;
  console.log(line);
}

async function measurePluginClient(label: string, content: string, index: number): Promise<void> {
  const client = new RemexClient({
    baseUrl: BASE_URL,
    identity: { tenantId: TENANT_ID, userId: USER_ID },
    timeoutMs: 10_000,
  });
  const sourceId = uuid();
  const t0 = performance.now();
  const res = await client.evaluate({
    type: "semantic",
    content,
    sourceTurnIds: [sourceId],
    participants: ["user", "assistant"],
  });
  const enqueueMs = performance.now() - t0;
  const t1 = performance.now();
  const { status, outcome } = await pollJob(res.jobId);
  const completeMs = performance.now() - t1;
  const totalMs = performance.now() - t0;
  const spanMs = await latestSpanLatency();
  results.push({ index, label: `${label} (plugin client)`, enqueueMs, completeMs, totalMs, status, outcome });
  const line = `     job #${index} [${label} plugin-client] enqueue=${enqueueMs.toFixed(1)}ms poll=${completeMs.toFixed(1)}ms TOTAL=${totalMs.toFixed(1)}ms engineSpan=${spanMs ?? "?"}ms -> ${status}/${outcome ?? "n/a"}`;
  console.log(line);
}

function summarize(): void {
  const zeros = results.filter((r) => r.totalMs < 1000);
  const slow = results.filter((r) => r.totalMs >= 1000);
  console.log("\n=== LATENCY SUMMARY ===");
  console.log(`Jobs run: ${results.length}`);
  if (results.length === 0) return;
  const avg = results.reduce((a, r) => a + r.totalMs, 0) / results.length;
  const max = Math.max(...results.map((r) => r.totalMs));
  const p50 = [...results].sort((a, b) => a.totalMs - b.totalMs)[
    Math.floor(results.length / 2)
  ]?.totalMs;
  console.log(`  avg=${avg.toFixed(0)}ms  p50=${p50?.toFixed(0)}ms  max=${max.toFixed(0)}ms`);
  console.log(`  fast (<1s): ${zeros.length}   slow (>=1s): ${slow.length}`);
  if (slow.length) {
    console.log("  SLOW jobs:");
    for (const r of slow) {
      console.log(`    #${r.index} [${r.label}] TOTAL=${r.totalMs.toFixed(0)}ms enqueue=${r.enqueueMs.toFixed(1)}ms poll=${r.completeMs.toFixed(1)}ms`);
    }
  }
}

async function main(): Promise<void> {
  console.log("\n=== Write-gate latency harness (headless) ===\n");
  console.log(`Remex: ${BASE_URL}`);
  console.log(`Concurrency burst: ${CONCURRENCY}\n`);

  // warmup
  try {
    const h = await fetch(`${BASE_URL}/v1/health`);
    console.log(`health: ${h.ok ? "ok" : h.status}`);
  } catch (e) {
    console.error("Remex unreachable:", e);
    process.exit(1);
  }
  await measureSingle("warmup", "The user prefers warm water.", 0);

  console.log("\n--- Sequential baseline (engine-only, raw HTTP) ---");
  for (let i = 1; i <= 3; i++) {
    await measureSingle("seq", `The user fact number ${i} for baseline.`, i);
  }

  console.log(`\n--- Concurrency burst of ${CONCURRENCY} (submitted back-to-back) ---`);
  const startAll = Date.now();
  const burstContents = Array.from(
    { length: CONCURRENCY },
    (_, i) => `The concurrent user fact number ${i} for burst.`,
  );
  const burstJobs = await Promise.all(
    burstContents.map((content, i) => enqueueRaw(content, uuid())),
  );
  console.log(`  submitted ${burstJobs.length} jobs in ${(Date.now() - startAll)}ms (back-to-back, no awaits between)`);

  // observe them racing through the single worker
  const burstResults = await Promise.all(
    burstJobs.map(async (jobId, i) => {
      const t0 = performance.now();
      const { status, outcome, reason } = await pollJob(jobId);
      return { i, totalMs: performance.now() - t0, status, outcome, reason };
    }),
  );
  for (const r of burstResults) {
    results.push({
      index: r.i,
      label: `burst`,
      enqueueMs: 0,
      completeMs: r.totalMs,
      totalMs: r.totalMs,
      status: r.status,
      outcome: r.outcome,
    });
    console.log(`     burst job #${r.i} TOTAL=${r.totalMs.toFixed(0)}ms -> ${r.status}/${r.outcome ?? "n/a"}${r.reason ? ` (${r.reason})` : ""}`);
  }
  if (burstResults.length > 1) {
    const spread = Math.max(...burstResults.map((r) => r.totalMs)) - Math.min(...burstResults.map((r) => r.totalMs));
    console.log(`  burst completion spread (max - min): ${spread.toFixed(0)}ms`);
  }

  console.log(`\n--- ADMITTED burst of ${CONCURRENCY} (unique user facts) ---`);
  const admitContents = Array.from(
    { length: CONCURRENCY },
    (_, i) => `The user's favorite color is shade ${Date.now()}-${i} of blue.`,
  );
  const admitJobs = await Promise.all(
    admitContents.map((content) => enqueueRaw(content, uuid())),
  );
  const admitResults = await Promise.all(
    admitJobs.map(async (jobId, i) => {
      const t0 = performance.now();
      const { status, outcome, reason } = await pollJob(jobId);
      const spanMs = await latestSpanLatency();
      return { i, totalMs: performance.now() - t0, status, outcome, reason, spanMs };
    }),
  );
  for (const r of admitResults) {
    results.push({
      index: r.i,
      label: `admit-burst`,
      enqueueMs: 0,
      completeMs: r.totalMs,
      totalMs: r.totalMs,
      status: r.status,
      outcome: r.outcome,
    });
    console.log(`     admit-burst #${r.i} TOTAL=${r.totalMs.toFixed(0)}ms engineSpan=${r.spanMs ?? "?"}ms -> ${r.status}/${r.outcome ?? "n/a"}${r.reason ? ` (${r.reason})` : ""}`);
  }
  if (admitResults.length > 1) {
    const admitAvg = admitResults.reduce((a, r) => a + r.totalMs, 0) / admitResults.length;
    const spread = Math.max(...admitResults.map((r) => r.totalMs)) - Math.min(...admitResults.map((r) => r.totalMs));
    console.log(`  admitted burst avg=${admitAvg.toFixed(0)}ms spread(max-min)=${spread.toFixed(0)}ms`);
  }

  console.log("\n--- Plugin RemexClient.save() path ---");
  for (let i = 0; i < 2; i++) {
    await measurePluginClient("plugin-good", "The user enjoys reading sci-fi.", i);
  }

  summarize();

  const report = [
    "# Write-Gate Latency Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Remex:** ${BASE_URL}`,
    `**Concurrency burst:** ${CONCURRENCY}`,
    "",
    "## Notes",
    "",
    "- Engine-only jobs POST `/v1/memories:evaluate` then poll `/v1/jobs/{id}` directly (no plugin).",
    "- Live config: no NIM/Gemini judge → `LocalRuleJudge`; `EXTRACTION_ENABLED=false`, `RECONCILIATION_ENABLED=false`.",
    "",
    "## Jobs",
    "",
    "| idx | label | enqueue ms | poll ms | total ms | status | outcome |",
    "|-----|-------|-----------|---------|----------|--------|---------|",
    ...results.map(
      (r) =>
        `| ${r.index} | ${r.label} | ${r.enqueueMs.toFixed(1)} | ${r.completeMs.toFixed(1)} | ${r.totalMs.toFixed(1)} | ${r.status} | ${r.outcome ?? "-"} |`,
    ),
    "",
  ];
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "LATENCY-REPORT.md"), report.join("\n"));
  console.log("\nReport written: sandbox/LATENCY-REPORT.md");
}

await main();