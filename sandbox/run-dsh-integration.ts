/**
 * DSH integration: install remex-dsh-plugin into a profile and validate Cordis wiring.
 * Run: pnpm run test:dsh
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProjectEnv } from "./load-env.ts";

loadProjectEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DSH_BIN = join(ROOT, "node_modules/@deepseek-ai/dsh/lib/bin.js");
const PLUGIN_PATH = ROOT;
const DSH_HOME =
  process.env.DSH_HOME ?? join(dirname(fileURLToPath(import.meta.url)), ".dsh-home");
const PROFILE = "remex-dsh-test";
const REMEX_BASE_URL = process.env.REMEX_BASE_URL ?? "http://localhost:8000";

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

function runDsh(args: string[], env: NodeJS.ProcessEnv = {}): {
  code: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [DSH_BIN, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      DSH_HOME,
      DSH_TELEMETRY_DISABLED: "1",
      ...env,
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function resetDshHome(): void {
  if (existsSync(DSH_HOME)) {
    rmSync(DSH_HOME, { recursive: true, force: true });
  }
  mkdirSync(DSH_HOME, { recursive: true });
}

async function main(): Promise<void> {
  console.log("\n=== remex-dsh-plugin DSH integration ===\n");
  console.log(`DSH:    ${DSH_BIN}`);
  console.log(`Plugin: ${PLUGIN_PATH}`);
  console.log(`Remex:  ${REMEX_BASE_URL}\n`);

  if (!existsSync(DSH_BIN)) {
    record({
      id: "D0",
      name: "DSH CLI installed",
      status: "FAIL",
      detail: "Run: pnpm add -D @deepseek-ai/dsh",
    });
    writeReport();
    process.exit(1);
  }

  record({
    id: "D0",
    name: "DSH CLI installed",
    status: "PASS",
    detail: existsSync(DSH_BIN) ? DSH_BIN : "missing",
  });

  resetDshHome();

  // D1 — plugin add
  const add = runDsh(["plugin", "--profile", PROFILE, "add", PLUGIN_PATH]);
  const profileManifest = join(DSH_HOME, "profiles", PROFILE, "package.json");
  const manifestOk =
    add.code === 0 &&
    existsSync(profileManifest) &&
    readFileSync(profileManifest, "utf8").includes("@your-scope/remex-dsh-plugin");
  record({
    id: "D1",
    name: "dsh plugin add (local bundle)",
    status: manifestOk ? "PASS" : "FAIL",
    detail: manifestOk
      ? `profile=${PROFILE} bundle linked`
      : `exit=${add.code} stderr=${add.stderr.slice(0, 200)}`,
  });
  if (!manifestOk) {
    addIssue({
      severity: "blocker",
      area: "dsh",
      title: "Plugin bundle install failed",
      detail: add.stderr || add.stdout,
    });
  }

  // D2 — composed config contains remex stack
  const dump = runDsh(["--profile", PROFILE, "--dump-config"]);
  const requiredRows = [
    "id: memory",
    "@your-scope/remex-dsh-plugin/remex-provider",
    "remex-context-injector",
    "remex-remember",
    "tool-memory-search",
  ];
  const missingRows = requiredRows.filter((needle) => !dump.stdout.includes(needle));
  record({
    id: "D2",
    name: "dump-config includes remex plugin rows",
    status: dump.code === 0 && missingRows.length === 0 ? "PASS" : "FAIL",
    detail:
      missingRows.length === 0
        ? "memory + injector + remember + memory_search present"
        : `missing: ${missingRows.join(", ")}`,
  });
  if (missingRows.length > 0) {
    addIssue({
      severity: "blocker",
      area: "dsh",
      title: "Composed config missing remex rows",
      detail: missingRows.join(", "),
    });
  }

  // D3 — profile overlay keeps Remex tenant/user + baseUrl
  const profilePatch = join(DSH_HOME, "profiles", PROFILE, "cordis.patch.yml");
  writeFileSync(
    profilePatch,
    [
      "- insert:",
      "    - id: memory",
      "      config:",
      `        baseUrl: ${REMEX_BASE_URL}`,
      '        tenantId: "00000000-0000-4000-8000-000000000001"',
      '        userId: "00000000-0000-4000-8000-000000000002"',
      "",
    ].join("\n"),
  );
  const dumpWithOverlay = runDsh(["--profile", PROFILE, "--dump-config"]);
  const overlayOk =
    dumpWithOverlay.stdout.includes(`baseUrl: ${REMEX_BASE_URL}`) &&
    dumpWithOverlay.stdout.includes("00000000-0000-4000-8000-000000000001");
  record({
    id: "D3",
    name: "Profile overlay overrides Remex config",
    status: overlayOk ? "PASS" : "FAIL",
    detail: overlayOk ? `baseUrl=${REMEX_BASE_URL}` : "overlay not reflected in dump-config",
  });

  // D4 — remex bundle layers into in-box headless profile
  runDsh(["plugin", "--profile", "headless", "add", PLUGIN_PATH]);
  const headlessDump = runDsh(["--profile", "headless", "--dump-config"]);
  const headlessHasRemex =
    headlessDump.code === 0 &&
    headlessDump.stdout.includes("@your-scope/remex-dsh-plugin/remex-provider");
  record({
    id: "D4",
    name: "Headless profile composes remex bundle",
    status: headlessHasRemex ? "PASS" : "FAIL",
    detail: headlessHasRemex
      ? "remex-provider row present in headless dump-config"
      : `exit=${headlessDump.code}`,
  });
  if (!headlessHasRemex) {
    addIssue({
      severity: "major",
      area: "dsh",
      title: "Headless profile missing remex bundle layer",
      detail: headlessDump.stderr || headlessDump.stdout.slice(0, 400),
    });
  }

  // D4b — headless agent round-trip when DeepSeek key is configured
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (deepseekKey) {
    const headless = runDsh(
      ["--profile", "headless", "Reply", "with", "exactly:", "DSH", "boot", "ok"],
      {
        DEEPSEEK_API_KEY: deepseekKey,
        ...(process.env.DEEPSEEK_BASE_URL
          ? { DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL }
          : {}),
      },
    );
    const bootOk = headless.code === 0 && /DSH boot ok/i.test(headless.stdout);
    record({
      id: "D4b",
      name: "Headless agent round-trip (DeepSeek API)",
      status: bootOk ? "PASS" : headless.code === 0 ? "WARN" : "FAIL",
      detail: bootOk
        ? headless.stdout.trim().slice(0, 120)
        : `exit=${headless.code} stdout=${headless.stdout.slice(0, 120)} stderr=${headless.stderr.slice(0, 120)}`,
    });
  } else {
    record({
      id: "D4b",
      name: "Headless agent round-trip (DeepSeek API)",
      status: "SKIP",
      detail: "Set DEEPSEEK_API_KEY in .env and run pnpm run setup:credentials",
    });
  }

  // D5 — Remex health when running live stack
  try {
    const health = await fetch(`${REMEX_BASE_URL}/v1/health`);
    const body = (await health.json()) as { status?: string };
    record({
      id: "D5",
      name: "Remex available for DSH runtime memory I/O",
      status: health.ok && body.status === "ok" ? "PASS" : "WARN",
      detail: JSON.stringify(body),
    });
    if (!health.ok || body.status !== "ok") {
      addIssue({
        severity: "info",
        area: "remex",
        title: "Remex not healthy during DSH test",
        detail: "Plugin mounts in DSH; live memory I/O needs Remex running.",
      });
    }
  } catch (error) {
    record({
      id: "D5",
      name: "Remex available for DSH runtime memory I/O",
      status: "WARN",
      detail: String(error),
    });
    addIssue({
      severity: "info",
      area: "remex",
      title: "Remex unreachable during DSH test",
      detail: String(error),
    });
  }

  writeReport();
  const failed = checks.filter((c) => c.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

function writeReport(): void {
  const dir = dirname(fileURLToPath(import.meta.url));
  const lines: string[] = [
    "# DSH Integration Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**DSH:** @deepseek-ai/dsh (local node_modules)`,
    `**Plugin:** remex-dsh-plugin`,
    `**DSH_HOME:** ${DSH_HOME}`,
    "",
    "## Summary",
    "",
    "| Result | Count |",
    "|--------|-------|",
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

  const reportPath = join(dir, "DSH-REPORT.md");
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\nReport written: ${reportPath}\n`);
}

await main();
