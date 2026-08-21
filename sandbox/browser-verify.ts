/**
 * Browser verification for DSH Web + remex plugin.
 * Prereqs: Remex up, DSH web running on :3080, export DSH_HOME (not in .env).
 *
 * Run: pnpm run test:browser
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const WEB_URL = process.env.DSH_WEB_URL ?? "http://127.0.0.1:3080";
const REMEX_URL = process.env.REMEX_BASE_URL ?? "http://localhost:8000";
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "browser-screenshots");

interface Check {
  id: string;
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

const checks: Check[] = [];

function record(check: Check): void {
  checks.push(check);
  console.log(`${check.status === "PASS" ? "✓" : check.status === "FAIL" ? "✗" : "-"} [${check.id}] ${check.name}`);
  if (check.detail) console.log(`    ${check.detail}`);
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

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
    .waitFor({ timeout: 20_000 });
}

async function seedRemexMemory(): Promise<void> {
  const tenant = "00000000-0000-4000-8000-000000000001";
  const user = "00000000-0000-4000-8000-000000000002";
  const headers = {
    "content-type": "application/json",
    "X-Tenant-ID": tenant,
    "X-User-ID": user,
  };
  const evaluate = await fetch(`${REMEX_URL}/v1/memories:evaluate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "semantic",
      content: "The user works on autonomous driving simulation.",
      source_turn_ids: ["00000000-0000-4000-8000-000000000099"],
      participants: ["user", "assistant"],
    }),
  });
  if (!evaluate.ok) {
    throw new Error(`evaluate failed: ${evaluate.status} ${await evaluate.text()}`);
  }
  const { job_id: jobId } = (await evaluate.json()) as { job_id: string };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const jobRes = await fetch(`${REMEX_URL}/v1/jobs/${jobId}`, { headers });
    const job = (await jobRes.json()) as { status: string; result?: { outcome?: string } };
    if (job.status === "finished") {
      if (job.result?.outcome !== "admitted") {
        throw new Error(`write gate outcome: ${job.result?.outcome ?? "unknown"}`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`job ${jobId} timed out`);
}

async function main(): Promise<void> {
  console.log("\n=== DSH Web browser verification ===\n");
  console.log(`Web:   ${WEB_URL}`);
  console.log(`Remex: ${REMEX_URL}\n`);

  try {
    const health = await fetch(`${REMEX_URL}/v1/health`);
    record({
      id: "B0",
      name: "Remex health",
      status: health.ok ? "PASS" : "FAIL",
      detail: health.ok ? "ok" : String(health.status),
    });
  } catch (error) {
    record({ id: "B0", name: "Remex health", status: "FAIL", detail: String(error) });
    process.exit(1);
  }

  const workspaceRoot = mkdtempSync(join(tmpdir(), "remex-dsh-browser-"));
  const workspacePath = join(workspaceRoot, "workspace");
  mkdirSync(workspacePath, { recursive: true });

  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache/ms-playwright");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  const chromiumBin = join(
    browsersPath,
    "chromium-1169/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  );
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(chromiumBin) ? { executablePath: chromiumBin } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    const response = await page.goto(WEB_URL, { waitUntil: "load", timeout: 30_000 });
    record({
      id: "B1",
      name: "DSH Web loads",
      status: response?.ok() ? "PASS" : "FAIL",
      detail: `status=${response?.status() ?? "none"}`,
    });
    await shot(page, "01-home");

    await connectWorkspace(page, workspacePath);
    record({ id: "B2", name: "Workspace connected", status: "PASS", detail: workspacePath });
    await shot(page, "02-workspace");

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await settings.waitFor({ timeout: 10_000 });
    await settings.getByRole("button", { name: "Plugins", exact: true }).click();
    await page.waitForTimeout(1000);
    const body = await settings.innerText();
    const hasRemex =
      body.includes("remex") ||
      body.includes("@your-scope/remex-dsh-plugin") ||
      body.includes("remex-dsh-plugin");
    record({
      id: "B3",
      name: "Plugins settings shows remex bundle",
      status: hasRemex ? "PASS" : "FAIL",
      detail: hasRemex ? "remex plugin visible" : "remex not found in Plugins tab",
    });
    await shot(page, "03-plugins");
    await page.keyboard.press("Escape");

    await seedRemexMemory();
    record({ id: "B4", name: "Seed Remex memory via HTTP", status: "PASS", detail: "admitted" });

    const input = page.locator('textarea:enabled[placeholder="Describe what you want to build"]');
    await input.fill("What do you know about my work?");
    await input.press("Enter");

    await page.waitForTimeout(45_000);
    await shot(page, "04-after-recall-question");
    const pageText = await page.locator("body").innerText();
    const recalled =
      /autonomous driving|driving simulation/i.test(pageText) ||
      /remex_memory/i.test(pageText);
    record({
      id: "B5",
      name: "UI recall mentions work domain",
      status: recalled ? "PASS" : "FAIL",
      detail: recalled
        ? "found driving/simulation or remex_memory in page"
        : `no recall signal; console errors=${consoleErrors.slice(0, 3).join(" | ") || "none"}`,
    });

    writeFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "BROWSER-REPORT.md"),
      [
        "# Browser Verification Report",
        "",
        `**Web:** ${WEB_URL}`,
        `**Remex:** ${REMEX_URL}`,
        "",
        "| ID | Status | Name | Detail |",
        "|----|--------|------|--------|",
        ...checks.map((c) => `| ${c.id} | ${c.status} | ${c.name} | ${c.detail.replace(/\|/g, "\\|")} |`),
        "",
        `Screenshots: \`sandbox/browser-screenshots/\``,
        "",
      ].join("\n"),
    );
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => c.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

await main();
