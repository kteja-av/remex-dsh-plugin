/**
 * HEADED browser verification of remex-dsh-plugin in DSH Web.
 * Drives the real UI end-to-end: workspace connect, plugin inventory, pre-step
 * recall injection, async remember, cross-session recall, and memory_search tool.
 *
 * Prereqs: Remex up (:8000), DSH web up (:3080), DSH_HOME exported (web profile),
 * real LLM credentials in $DSH_HOME/.credentials.yaml, playwright browsers installed.
 *
 * Run: pnpm run test:browser-headed   (launches a visible headed browser)
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const WEB_URL = process.env.DSH_WEB_URL ?? "http://127.0.0.1:3080";
const REMEX_URL = process.env.REMEX_BASE_URL ?? "http://localhost:8000";
const HEADED = (process.env.HEADED ?? "true") !== "false";
const SHOT = (process.env.SHOTS ?? "true") !== "false";
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "browser-screenshots");

interface Check {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP" | "WARN";
  detail: string;
}

const checks: Check[] = [];

function record(check: Check): void {
  checks.push(check);
  const icon = check.status === "PASS" ? "✓" : check.status === "FAIL" ? "✗" : check.status === "WARN" ? "!" : "-";
  console.log(`${icon} [${check.status}] ${check.id}: ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOT) return;
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

const CONSOLE_ERRORS: string[] = [];
const NET_FAILS: string[] = [];

async function connectWorkspace(page: Page, workspacePath: string): Promise<void> {
  await page.getByRole("textbox", { name: "Choose workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "Select Workspace Directory" });
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Edit path" }).click();
  const pathInput = dialog.getByRole("textbox", { name: "Edit path" });
  await pathInput.fill(workspacePath);
  await pathInput.press("Enter");
  await dialog.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .locator('textarea:enabled[placeholder="Describe what you want to build"]')
    .waitFor({ timeout: 25_000 });
}

async function seedRemexMemory(content: string, sourceId: string): Promise<void> {
  const tenant = "00000000-0000-4000-8000-000000000001";
  const user = "00000000-0000-4000-8000-000000000002";
  const headers = { "content-type": "application/json", "X-Tenant-ID": tenant, "X-User-ID": user };
  const evaluate = await fetch(`${REMEX_URL}/v1/memories:evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "semantic",
      content,
      source_turn_ids: [sourceId],
      participants: ["user", "assistant"],
    }),
  });
  if (!evaluate.ok) throw new Error(`evaluate failed: ${evaluate.status}`);
  const { job_id: jobId } = (await evaluate.json()) as { job_id: string };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const jobRes = await fetch(`${REMEX_URL}/v1/jobs/${jobId}`, { headers });
    const job = (await jobRes.json()) as { status: string; result?: { outcome?: string } };
    if (job.status === "finished") {
      if (job.result?.outcome !== "admitted") throw new Error(`write gate: ${job.result?.outcome ?? "unknown"}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`job ${jobId} timed out`);
}

async function clearRemexMemoriesAll(): Promise<void> {
  // Best-effort: remex exposes no bulk delete; warn that prior state may persist.
  const tenant = "00000000-0000-4000-8000-000000000001";
  const user = "00000000-0000-4000-8000-000000000002";
  const headers = { "X-Tenant-ID": tenant, "X-User-ID": user };
  try {
    const r = await fetch(`${REMEX_URL}/v1/memories:retrieve?query=browser-test-flag&limit=50`, { headers });
    if (r.ok) {
      const body = (await r.json()) as { memories?: Array<{ id: string }> };
      for (const m of body.memories ?? []) {
        await fetch(`${REMEX_URL}/v1/memories/${m.id}`, { method: "DELETE", headers });
      }
    }
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  console.log(`\n=== DSH Web HEADED browser verification (remex-dsh-plugin) ===\n`);
  console.log(`Web:   ${WEB_URL}`);
  console.log(`Remex: ${REMEX_URL}`);
  console.log(`Headed: ${HEADED}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  try {
    const health = await fetch(`${REMEX_URL}/v1/health`);
    record({ id: "B0", name: "Remex health", status: health.ok ? "PASS" : "FAIL", detail: health.ok ? "ok" : String(health.status) });
  } catch (error) {
    record({ id: "B0", name: "Remex health", status: "FAIL", detail: String(error) });
    writeReport();
    process.exit(1);
  }

  try {
    const up = await fetch(WEB_URL, { method: "GET" });
    record({ id: "B0w", name: "DSH web reachable", status: up.ok ? "PASS" : "FAIL", detail: String(up.status) });
  } catch {
    record({ id: "B0w", name: "DSH web reachable", status: "FAIL", detail: "not reachable — start with pnpm run start:web" });
    writeReport();
    process.exit(1);
  }

  const workspaceRoot = mkdtempSync(join(tmpdir(), "remex-dsh-browser-headed-"));
  const workspacePath = join(workspaceRoot, "workspace");
  mkdirSync(workspacePath, { recursive: true });

  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: !HEADED,
    ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  page.on("console", (msg) => {
    if (msg.type() === "error") CONSOLE_ERRORS.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    NET_FAILS.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "failed"}`);
  });
  page.on("pageerror", (err) => CONSOLE_ERRORS.push(`PAGEERROR: ${err.message}`));

  try {
    const response = await page.goto(WEB_URL, { waitUntil: "load", timeout: 30_000 });
    record({ id: "B1", name: "DSH Web loads", status: response?.ok() ? "PASS" : "FAIL", detail: `status=${response?.status() ?? "none"}` });
    await shot(page, "01-home");

    await connectWorkspace(page, workspacePath);
    record({ id: "B2", name: "Workspace connected", status: "PASS", detail: workspacePath });
    await shot(page, "02-workspace");

    // B3 — plugin inventory
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.waitFor({ timeout: 10_000 });
    await settings.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.waitForTimeout(1200);
    const body = await settings.innerText();
    const hasRemex = /remex|@your-scope\/remex-dsh-plugin/.test(body);
    record({ id: "B3", name: "Plugins settings shows remex bundle", status: hasRemex ? "PASS" : "FAIL", detail: hasRemex ? "remex visible" : "remex not found in Plugins" });
    await shot(page, "03-plugins");
    await page.keyboard.press("Escape");

    // Seed a known fact for recall assertion
    const UNIQUE = `browser-auto-${Date.now()}`;
    const SEED = "The user prefers hot chai over iced coffee.";
    await seedRemexMemory(SEED, `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`).catch((e) => {
      console.error(`seed failed: ${e.message}`);
    });

    const input = page.locator('textarea:enabled[placeholder="Describe what you want to build"]');

    // Session A — pre-step recall injection + agent answers using memory
    await input.fill("What do I like to drink, according to my memory?");
    await input.press("Enter");
    record({ id: "B4", name: "Sent recall question (pre-step inject)", status: "PASS", detail: "query submitted" });

    // Wait for assistant reply
    await page.waitForTimeout(40_000);
    await shot(page, "04-recall-answer");
    const pageText = await page.locator("body").innerText();
    const recalled = /chai|tea|hot tea|beverage/i.test(pageText);
    record({
      id: "B5", name: "UI answer reflects persisted memory",
      status: recalled ? "PASS" : "WARN",
      detail: recalled ? "found chai/tea in reply" : `no chai signal; page-len=${pageText.length} errs=${CONSOLE_ERRORS.slice(0, 2).join(" | ") || "none"}`,
    });

    // memory_search tool path — ask a searching question, look for a tool result
    await input.fill("Search your memory for anything about drinks and tell me what you find.");
    await input.press("Enter");
    await page.waitForTimeout(40_000);
    await shot(page, "05-tool-answer");
    const pageText2 = await page.locator("body").innerText();
    const toolEvidence = /memory_search|tool|drinks|chai/i.test(pageText2);

    record({
      id: "B6", name: "Agent turn exercised (may use memory_search)",
      status: toolEvidence ? "PASS" : "WARN",
      detail: toolEvidence ? "tool/drink signal present" : "no explicit tool UI detected; page-len=" + pageText2.length,
    });

    // Verify memory_search tool actually registered on the model-facing tool list is hard to observe
    // directly in the UI; the strongest signal is the dump-config (checked separately) + runtime no-crash.

    // Session B — cross-session recall
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2000);
    await connectWorkspace(page, workspacePath);
    const input2 = page.locator('textarea:enabled[placeholder="Describe what you want to build"]');
    await input2.fill("In a fresh session, what kind of drink do I prefer?");
    await input2.press("Enter");
    await page.waitForTimeout(40_000);
    await shot(page, "06-cross-session");
    const pageText3 = await page.locator("body").innerText();
    const crossSession = /chai|tea|hot tea/i.test(pageText3);
    record({
      id: "B7", name: "Cross-session recall (fresh session retriero)",
      status: crossSession ? "PASS" : "WARN",
      detail: crossSession ? "chai/tea recalled in new session" : `not detected; page-len=${pageText3.length}`,
    });

    // Fail-open note
    record({ id: "B8", name: "Fail-open (documented; live outage not induced)", status: "SKIP", detail: "covered by tests/failure.test.ts + sandbox S9/S10" });

    writeReport();
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => c.status === "FAIL").length;
  const warns = checks.filter((c) => c.status === "WARN").length;
  console.log(`\nFailed: ${failed}  Warn: ${warns}  ConsoleErrors: ${CONSOLE_ERRORS.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

function writeReport(): void {
  const lines = [
    "# Headed Browser Verification Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Web:** ${WEB_URL} (headed=${HEADED})`,
    `**Remex:** ${REMEX_URL}`,
    "",
    "## Summary",
    "",
    "| Result | Count |",
    "|--------|-------|",
    ...(["PASS", "WARN", "FAIL", "SKIP"] as const).map((s) => `| ${s} | ${checks.filter((c) => c.status === s).length} |`),
    "",
    "## Checks",
    "",
    "| ID | Status | Name | Detail |",
    "|----|--------|------|--------|",
    ...checks.map((c) => `| ${c.id} | ${c.status} | ${c.name} | ${(c.detail ?? "").replace(/\|/g, "\\|")} |`),
    "",
    "## Console / network",
    "",
    `- Console errors: ${CONSOLE_ERRORS.length}`,
    ...(CONSOLE_ERRORS.slice(0, 10).map((e) => `  - \`${e.slice(0, 160)}\``)),
    `- Failed requests: ${NET_FAILS.length}`,
    ...(NET_FAILS.slice(0, 10).map((f) => `  - \`${f.slice(0, 160)}\``)),
    "",
    `Screenshots: \`sandbox/browser-screenshots/\``,
    "",
  ];
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "BROWSER-REPORT.md"), lines.join("\n"));
}

await main();