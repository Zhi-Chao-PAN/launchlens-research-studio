#!/usr/bin/env node
// E2E test for LaunchLens Research Studio using Playwright.
// Starts the production server, then exercises:
//   - Landing page rendering + accessibility
//   - Theme toggle
//   - Starting research
//   - Tab switching between report sections
//   - Share button
//   - Print button presence
//
// Usage:
//   node e2e/playwright-e2e.js
// Requires: production build at .next/ and Playwright + chromium installed.

const { spawn } = require("node:child_process");
const { chromium } = require("C:/Users/22304/.agents/skills/playwright-skill/node_modules/playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = process.env.E2E_PORT || "3020";
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.join(PROJECT_DIR, "screenshots");

let pass = 0;
let fail = 0;
const results = [];

function log(label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}${detail ? " — " + detail : ""}`);
    results.push({ label, status: "pass", detail });
  } else {
    fail++;
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    results.push({ label, status: "fail", detail });
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Use already-running production build (caller's responsibility to start it)
  console.log(`E2E test against ${BASE_URL}`);
  const ready = await waitForServer(BASE_URL, 20000);
  if (!ready) {
    console.error("Server not running. Start it with: PORT=" + PORT + " npx next start");
    process.exit(2);
  }
  console.log("Server ready.\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console.error: " + msg.text());
  });

  try {
    // ====== Test 1: Landing page ======
    console.log("[1] Landing page");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    const title = await page.title();
    log("Has correct title", title.includes("LaunchLens"), "title: " + title);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-01-landing.png"), fullPage: true });

    const heroVisible = await page.locator("h2").filter({ hasText: /Research any market/ }).isVisible();
    log("Hero text visible", heroVisible);

    const hasQueryInput = await page.locator("textarea").first().isVisible();
    log("Query textarea visible", hasQueryInput);

    const hasStartButton = await page.locator('button:has-text("Start Research")').first().isVisible();
    log("Start Research button visible", hasStartButton);

    // ====== Test 2: Theme toggle ======
    console.log("\n[2] Theme toggle");
    const themeButton = page.locator('button[aria-label*="theme" i], button[aria-label*="mode" i]').first();
    const themeExists = await themeButton.count() > 0;
    log("Theme toggle button exists", themeExists);

    if (themeExists) {
      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
      await themeButton.click();
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      log("Theme changes on click", before !== after, `before=${before}, after=${after || "light"}`);
      // Toggle back
      await themeButton.click();
      await page.waitForTimeout(150);
    }

    // ====== Test 3: Accessibility - skip link ======
    console.log("\n[3] Skip link");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    log("First Tab focuses skip link", (focused || "").toLowerCase().includes("skip"), "focused: " + focused);

    // ====== Test 4: Start research flow ======
    console.log("\n[4] Start research flow");
    await page.locator("textarea").first().fill("AI-powered tool for university students");
    await page.locator("textarea").first().press("Tab");
    // Fill keywords
    const keywordInput = page.locator('input[placeholder*="SaaS"]').first();
    if (await keywordInput.count() > 0) {
      await keywordInput.fill("AI, students, education");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-02-form-filled.png") });

    await page.locator('button:has-text("Start Research")').first().click();

    // Wait for the studio layout
    await page.waitForSelector("text=Research Agents", { timeout: 10000 });
    log("Studio layout appears", true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-03-research-started.png") });

    // ====== Test 5: Tab switching ======
    console.log("\n[5] Tab switching");
    // Wait for some agents to complete
    await page.waitForTimeout(8000);

    const tabButtons = page.locator("button[aria-pressed]").filter({ hasText: /Competitor|Pain|Pricing|Channel|Synthesis/ });
    // Tab buttons may be inside the lazy ReportView, check after wait
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-debug-tabs.png"), fullPage: true });
    const html = await page.content();
    console.log("DEBUG: page has 'Research Agents'", html.includes("Research Agents"));
    console.log("DEBUG: page has 'Market Sizer' as button", /button[^>]*>[^<]*Market Sizer/.test(html));
    const tabCount = await page.locator("button").filter({ hasText: /Market Sizer|Competitor Analyst|Pain Detective|Pricing Scout|Channel Scout/ }).count();
    log("Tab buttons present in report", tabCount >= 4, `count=${tabCount}`);

    // Click on Synthesis tab (should be available after agents finish)
    const synthTab = page.locator("button").filter({ hasText: "Synthesis" }).first();
    if (await synthTab.count() > 0) {
      await synthTab.click();
      await page.waitForTimeout(500);
      const hasExecutiveSummary = await page.locator("text=Executive Summary").first().isVisible();
      log("Synthesis tab shows Executive Summary", hasExecutiveSummary);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-04-synthesis.png"), fullPage: true });

    // ====== Test 6: Wait for completion + check ExportActions ======
    console.log("\n[6] Export actions");
    await page.waitForSelector('button[aria-pressed]:has-text("Synthesis")', { timeout: 60000 });
    log("Research completes", true);

    const downloadButtons = await page.locator('button').filter({ hasText: /Download Markdown|Download JSON|Download CSVs|Print/i }).count();
    log("Export download buttons present", downloadButtons >= 3, `count=${downloadButtons}`);

    const copyButtons = await page.locator('button').filter({ hasText: /Copy (LaunchLens brief|Markdown|JSON)/i }).count();
    log("Copy buttons present", copyButtons >= 1, `count=${copyButtons}`);

    // ====== Test 7: Share button ======
    console.log("\n[7] Share button");
    const shareButton = page.locator('button:has-text("Share")').first();
    if (await shareButton.count() > 0) {
      log("Share button exists", true);
    } else {
      log("Share button exists", false, "not found");
    }

    // ====== Test 8: Dark mode visual ======
    console.log("\n[8] Dark mode visual");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-05-dark-mode.png"), fullPage: true });
    log("Dark mode screenshot captured", true);

    // ====== Test 9: Mobile viewport ======
    console.log("\n[9] Mobile viewport");
    await context.close();
    const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.goto(BASE_URL, { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-06-mobile.png"), fullPage: true });

    // Mobile sidebar toggle should be present in studio
    await mobilePage.locator("textarea").first().fill("Mobile test product");
    await mobilePage.locator('button:has-text("Start Research")').first().click();
    await mobilePage.waitForSelector("text=Research Agents", { timeout: 10000 });
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-07-mobile-studio.png") });

    const mobileToggle = mobilePage.locator('button[aria-controls="studio-sidebar"]').first();
    log("Mobile sidebar toggle exists", await mobileToggle.count() > 0);
    if (await mobileToggle.count() > 0) {
      await mobileToggle.click();
      await mobilePage.waitForTimeout(200);
      const expanded = await mobileToggle.getAttribute("aria-expanded");
      log("Mobile toggle has aria-expanded", expanded === "true", `expanded=${expanded}`);
    }

    // ====== Summary ======
    console.log("\n" + "=".repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    if (errors.length > 0) {
      console.log("\nConsole errors during test:");
      for (const e of errors.slice(0, 10)) console.log("  - " + e);
    }
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error("E2E test crashed:", err.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-crash.png") }).catch(() => {});
    process.exit(2);
  } finally {
    await browser.close();
  }
}

run();
