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

    await page.waitForSelector("h2:has-text(\"Research any market\")", { timeout: 8000 }).catch(() => {});
    const heroVisible = await page.locator("h2").filter({ hasText: /Research any market|市场|市場/ }).first().isVisible();
    log("Hero text visible", heroVisible);

    const hasQueryInput = await page.locator("textarea").first().isVisible();
    log("Query textarea visible", hasQueryInput);

    const hasStartButton = await page.locator('[data-testid="research-submit"]').first().isVisible();
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

    // ====== Test 2.5: Language / i18n toggle ======
    console.log("\n[2.5] Language switching");
    const langSelect = page.locator('select[aria-label*="language" i], select[aria-label*="lang" i], select[aria-label*="语言" i], select[aria-label*="言語" i]').first();
    const langCount = await langSelect.count();
    if (langCount > 0) {
      log("Language selector exists", true);
      // Check current selection is English
      const initialVal = await langSelect.inputValue();
      const isEnglish = initialVal === "en";
      log("Initial language is English", isEnglish, "value=" + initialVal);

      // Switch to Chinese via selectOption (native <select> doesn't expose clickable <option>)
      await langSelect.selectOption({ value: "zh-CN" });
      await page.waitForTimeout(500);
      const zhText = await page.locator("h2").filter({ hasText: /市场|调研/ }).first().textContent();
      const isZh = /市场|调研/.test(zhText || "");
      log("Switches to Chinese", isZh, "found Chinese text in hero");
      // Switch back to English
      await langSelect.selectOption({ value: "en" });
      await page.waitForTimeout(500);
      const enBack = await langSelect.inputValue();
      log("Switches back to English", enBack === "en", "value=" + enBack);
    } else {
      log("Language selector exists", false, "not found");
    }
    console.log("\n[3] Skip link");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    log("First Tab focuses skip link", (focused || "").toLowerCase().includes("skip"), "focused: " + focused);

    // ====== Test 3.5: SEO and metadata ======
    console.log('\n[3.5] SEO and metadata');
    const pageTitle = await page.title();
    log('Title is set', pageTitle.length > 10, 'pageTitle: ' + pageTitle);
    const desc = await page.locator('meta[name="description"]').first().getAttribute('content');
    log('Description meta present', !!desc && desc.length > 50, 'length: ' + (desc || '').length);
    const og = await page.locator('meta[property="og:title"]').first().getAttribute('content');
    log('OpenGraph title present', !!og && og.includes('LaunchLens'));
    const tw = await page.locator('meta[name="twitter:card"]').first().getAttribute('content');
    log('Twitter card meta present', !!tw, 'card: ' + tw);
    const robotsResponse = await page.request.get(BASE_URL + '/robots.txt');
    log('robots.txt served', robotsResponse.status() === 200, 'status=' + robotsResponse.status());
    const sitemapResponse = await page.request.get(BASE_URL + '/sitemap.xml');
    log('sitemap.xml served', sitemapResponse.status() === 200, 'status=' + sitemapResponse.status());
    const healthResponse = await page.request.get(BASE_URL + '/api/health');
    const healthJson = await healthResponse.json();
    log('health endpoint serves provider info', healthResponse.status() === 200 && healthJson.status === 'ok' && !!healthJson.provider, 'provider=' + (healthJson.provider && healthJson.provider.id));
    const telemetryResponse = await page.request.get(BASE_URL + '/api/telemetry');
    log('telemetry endpoint serves summary', telemetryResponse.status() === 200);
    const diagnosticsResponse = await page.request.get(BASE_URL + '/diagnostics');
    log('diagnostics page renders 200', diagnosticsResponse.status() === 200);
    const diagHtml = await diagnosticsResponse.text();
    // Diagnostics renders localized headings; check for both English defaults
    // (Diagnostics/Provider) and the zh/ja equivalents so the assertion is
    // locale-agnostic. A successful render also contains the intro paragraph
    // with the package name launchlens-research-studio.
    const hasProviderSection =
      (/Provider|供应商|プロバイダー/.test(diagHtml) && /Diagnostics|诊断|診断/.test(diagHtml)) ||
      diagHtml.includes('launchlens-research-studio');
    log('diagnostics page renders content', hasProviderSection);
    // Check that diagnostics auth gate shows Unauthorized UI OR the full
    // diagnostics content (auth is bypassed when LAUNCHLENS_DIAGNOSTICS_TOKEN
    // is unset, which is the common local-dev case).
    const diagAuthVisible =
      /Unauthorized|未授权|未認証|restricted|受限|制限/.test(diagHtml) ||
      /Circuit breaker|breaker|熔断/.test(diagHtml);
    log('diagnostics auth/content present', diagAuthVisible);
    // Wait briefly for the ProviderPill to fetch /api/health and render
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(700);
    const providerPillVisible = await page.locator('[role="status"][aria-live="polite"][title*="v"]').first().isVisible().catch(() => false);
    log('Provider pill renders provider label', providerPillVisible);

        const manifestResponse = await page.request.get(BASE_URL + '/manifest.webmanifest');
    log('manifest.webmanifest served', manifestResponse.status() === 200, 'status=' + manifestResponse.status());

    // ====== Test 3.7: Client-side inline validation errors ======
    console.log("\n[3.7] Form validation");
    // Too-short query should show an inline error and disable submit.
    await page.locator("textarea").first().fill("hi");
    await page.waitForTimeout(80); // React state flush
    const shortErrVisible = await page.locator('[data-testid="form-error-query"]').first().isVisible().catch(() => false);
    log("Too-short query shows inline error", shortErrVisible);
    const submitBtn = page.locator('[data-testid="research-submit"]').first();
    const shortDisabled = await submitBtn.isDisabled();
    log("Submit button disabled while invalid", shortDisabled);
    // Too many keywords
    await page.locator("textarea").first().fill("A long enough query for validation test here");
    const tooMany = Array.from({ length: 14 }, (_, i) => "kw" + i).join(", ");
    const kwInput = page.locator('input[placeholder*="SaaS"], input[placeholder*="keyword"], input[placeholder*="e.g."]').first();
    await kwInput.fill(tooMany);
    await page.waitForTimeout(80);
    const kwErrVisible = await page.locator('[data-testid="form-error-keywords"]').first().isVisible().catch(() => false);
    log("Too-many-keywords shows inline keyword error", kwErrVisible);
    // Reset fields for the main research-flow test.
    await kwInput.fill("AI, students, education");
    await page.locator("textarea").first().fill("AI-powered tool for university students");
    await page.waitForTimeout(80);
    log("Errors clear when input becomes valid", !(await page.locator('[data-testid="form-error-query"]').count()) && !(await page.locator('[data-testid="form-error-keywords"]').count()));

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

    await page.locator('[data-testid="research-submit"]').first().click();

    // Wait for the studio layout
    await page.waitForSelector("h3:has-text(\"Research Agents\"), h3:has-text(\"调研智能体\"), h3:has-text(\"リサーチエージェント\")", { timeout: 10000 });
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
    console.log("DEBUG: page has translated Research Agents", html.includes("Research Agents") || html.includes("调研智能体") || html.includes("リサーチ"));
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

    // i18n-aware button matching (en/zh/ja)
    const downloadBtnRegex = /Download Markdown|Markdown.*下载|Markdown.*ダウンロード|Download JSON|Download CSVs|Print|打印|印刷/i;
    const downloadButtons = await page.locator('button').filter({ hasText: downloadBtnRegex }).count();
    log("Export download buttons present", downloadButtons >= 3, `count=${downloadButtons}`);

    const copyBtnRegex = /Copy (LaunchLens brief|brief|Markdown|JSON)|Copied|复制|コピー/i;
    const copyButtons = await page.locator('button').filter({ hasText: copyBtnRegex }).count();
    log("Copy buttons present", copyButtons >= 1, `count=${copyButtons}`);

    // Test that clicking a copy button shows "Copied!" feedback.
    // Use waitFor to handle the 1800ms flash timeout and clipboard permission latency.
    const copyBriefBtn = page.locator('button').filter({ hasText: /Copy.*brief|brief.*Copy|复制.*简报|ブリーフ.*コピー/i }).first();
    if (await copyBriefBtn.count() > 0) {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await copyBriefBtn.click();
      // Wait up to 2s for the Copied!/已复制/コピーしました state to appear.
      let showsCopied = false;
      for (let i = 0; i < 20; i++) {
        const txt = (await copyBriefBtn.textContent()) || "";
        if (/Copied|已复制|コピーしました/i.test(txt)) { showsCopied = true; break; }
        await page.waitForTimeout(100);
      }
      const afterText = await copyBriefBtn.textContent();
      log("Copy brief button shows Copied feedback", showsCopied, `text="${(afterText||'').trim()}"`);
    } else {
      log("Copy brief button shows Copied feedback", false, "button not found (synthesis may not have completed)");
    }

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
    await mobilePage.locator('[data-testid="research-submit"]').first().click();
    await mobilePage.waitForSelector("h3:has-text(\"Research Agents\"), h3:has-text(\"调研智能体\"), h3:has-text(\"リサーチエージェント\")", { timeout: 15000, state: "attached" });
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "e2e-07-mobile-studio.png") });

    const mobileToggle = mobilePage.locator('button[aria-controls="studio-sidebar"]').first();
    log("Mobile sidebar toggle exists", await mobileToggle.count() > 0);
    if (await mobileToggle.count() > 0) {
      await mobileToggle.click();
      await mobilePage.waitForTimeout(200);
      const expanded = await mobileToggle.getAttribute("aria-expanded");
      log("Mobile toggle has aria-expanded", expanded === "true", `expanded=${expanded}`);
    }

    // ProviderPill should be visible on mobile (dot-only variant)
    const mobileProviderPill = mobilePage.locator('[role="status"][aria-live="polite"]').first();
    const pillVisible = await mobileProviderPill.isVisible().catch(() => false);
    log("ProviderPill visible on mobile", pillVisible);

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
