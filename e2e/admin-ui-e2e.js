#!/usr/bin/env node

/**
 * Browser E2E for the bilingual administrator console.
 *
 * Covers the security-sensitive user journey that component tests cannot:
 *   - one-time bearer-token exchange for an HttpOnly admin session;
 *   - English / Simplified Chinese switching;
 *   - ordered provider-key slots 1 -> 2 -> 3;
 *   - no admin token or provider key persisted in Web Storage;
 *   - desktop navigation and the responsive mobile drawer.
 *
 * Usage:
 *   npm run build
 *   node e2e/admin-ui-e2e.js
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function resolvePlaywright() {
  const candidates = [
    "playwright-core",
    "playwright",
    "C:/Users/22304/.agents/skills/playwright-skill/node_modules/playwright-core",
    `${process.env.HOME || ""}/.agents/skills/playwright-skill/node_modules/playwright-core`,
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next supported installation location.
    }
  }
  throw new Error(
    "playwright-core was not found. Run `npm ci` before this E2E test.",
  );
}

function findBrowserExecutable() {
  const candidates = process.platform === "win32"
    ? [
        `${process.env.PROGRAMFILES || ""}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env["PROGRAMFILES(X86)"] || ""}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.PROGRAMFILES || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env["PROGRAMFILES(X86)"] || ""}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

const { chromium } = resolvePlaywright();
const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = process.env.E2E_PORT || "3024";
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN || "e2e-admin-ui-token-xyz";
const ADMIN_SESSION_SECRET =
  process.env.E2E_ADMIN_SESSION_SECRET ||
  "launchlens-admin-ui-e2e-session-secret-32-bytes";
const PROVIDER_KEYS = [
  "e2e-openai-key-priority-one-0001",
  "e2e-openai-key-priority-two-0002",
  "e2e-openai-key-priority-three-0003",
];
const ARTIFACT_DIR = path.join(PROJECT_DIR, "output", "playwright");

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  console[ok ? "log" : "error"](
    `  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` -- ${detail}` : ""}`,
  );
  if (ok) passed += 1;
  else failed += 1;
  return ok;
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return true;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function emptyHealth() {
  return {
    status: "unknown",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    cooldownUntil: null,
  };
}

function initialCredentialSnapshot() {
  return {
    version: 1,
    revision: 7,
    slots: [1, 2, 3].map((slot) => ({
      slot,
      isConfigured: false,
      provider: null,
      enabled: false,
      credentialId: null,
      createdAt: null,
      updatedAt: null,
      health: emptyHealth(),
    })),
  };
}

function storageContains(storage, secret) {
  const normalized = secret.toLowerCase();
  return [...storage.local, ...storage.session].some(([key, value]) =>
    `${key}:${value}`.toLowerCase().includes(normalized),
  );
}

async function readStorage(page) {
  return page.evaluate(() => ({
    local: Object.entries(window.localStorage),
    session: Object.entries(window.sessionStorage),
  }));
}

async function noHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
}

function startProductionServer() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const serverLogPath = path.join(ARTIFACT_DIR, "admin-next-server.log");
  const serverLog = fs.openSync(serverLogPath, "w");
  try {
    return spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", PORT],
      {
        cwd: PROJECT_DIR,
        stdio: ["ignore", serverLog, serverLog],
        env: {
          ...process.env,
          LAUNCHLENS_ADMIN_TOKENS: ADMIN_TOKEN,
          LAUNCHLENS_ADMIN_SESSION_SECRET: ADMIN_SESSION_SECRET,
          LAUNCHLENS_CSRF_STRICT: "1",
        },
      },
    );
  } finally {
    fs.closeSync(serverLog);
  }
}

async function run() {
  if (!fs.existsSync(path.join(PROJECT_DIR, ".next", "BUILD_ID"))) {
    throw new Error("Production build missing. Run `npm run build` first.");
  }

  console.log(`Admin UI browser E2E against ${BASE_URL}`);
  const server = startProductionServer();

  let browser;
  let page;
  try {
    if (!(await waitForServer())) {
      throw new Error("The production server did not become ready within 30 seconds.");
    }

    const executablePath = findBrowserExecutable();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 900 },
    });

    let credentialSnapshot = initialCredentialSnapshot();
    const providerMutations = [];
    await context.route("**/api/admin/provider-credentials", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: credentialSnapshot,
            runtimeProvider: "openai",
          }),
        });
        return;
      }

      if (request.method() === "PUT") {
        const input = request.postDataJSON();
        providerMutations.push(input);
        const now = new Date().toISOString();
        credentialSnapshot = {
          ...credentialSnapshot,
          revision: credentialSnapshot.revision + 1,
          slots: credentialSnapshot.slots.map((slot) =>
            slot.slot === input.slot
              ? {
                  ...slot,
                  isConfigured: true,
                  provider: input.provider,
                  enabled: input.enabled !== false,
                  credentialId: `cred_e2e_slot_${input.slot}`,
                  createdAt: slot.createdAt || now,
                  updatedAt: now,
                }
              : slot,
          ),
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: credentialSnapshot,
            runtimeProvider: "openai",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED" } }),
      });
    });

    page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    console.log("\n[1] Bilingual sign-in and secure session exchange");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Administrator sign in" }).waitFor();
    check("English login renders", await page.locator("#admin-token").isVisible());
    check(
      "Login token field is password-protected",
      (await page.locator("#admin-token").getAttribute("type")) === "password",
    );

    await page.getByRole("button", { name: "中文" }).click();
    await page.getByRole("heading", { name: "管理员登录" }).waitFor();
    check(
      "Chinese locale applies to the document",
      (await page.locator("html").getAttribute("lang")) === "zh-CN",
    );
    await page.getByRole("button", { name: "EN" }).click();
    await page.getByRole("heading", { name: "Administrator sign in" }).waitFor();
    check(
      "English locale can be restored",
      (await page.locator("html").getAttribute("lang")) === "en",
    );

    await page.locator("#admin-token").fill(ADMIN_TOKEN);
    const sessionResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${BASE_URL}/api/admin/session` &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in securely" }).click();
    const sessionResponse = await sessionResponsePromise;
    check("Admin token exchanges for a session", sessionResponse.status() === 201);
    await page.locator("#main-content h1").filter({ hasText: "Overview" }).waitFor();

    const sessionCookie = (await context.cookies(BASE_URL)).find(
      (cookie) => cookie.name === "ll_admin_session",
    );
    check("Session cookie is HttpOnly", sessionCookie?.httpOnly === true);
    check("Session cookie uses SameSite=Strict", sessionCookie?.sameSite === "Strict");
    check("Session cookie is marked Secure", sessionCookie?.secure === true);

    let storage = await readStorage(page);
    check(
      "Admin token is absent from localStorage and sessionStorage",
      !storageContains(storage, ADMIN_TOKEN),
    );
    check("Admin token input is removed after exchange", (await page.locator("#admin-token").count()) === 0);

    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#main-content h1").filter({ hasText: "Overview" }).waitFor();
    check("HttpOnly session survives a reload", (await page.locator("#admin-token").count()) === 0);

    console.log("\n[2] Ordered three-key provider failover editor");
    await page.locator(".ops-nav button").filter({ hasText: "Provider keys" }).click();
    await page.locator("#main-content h1").filter({ hasText: "API key failover" }).waitFor();
    const cards = page.locator(".ops-key-sequence > li > .ops-key-card");
    await page.locator("#provider-key-3").waitFor({ state: "visible" });
    check("Exactly three key slots render", (await cards.count()) === 3);
    check("Slot 1 is the primary", await cards.nth(0).getByText("Primary", { exact: true }).isVisible());
    check("Slot 2 is fallback 1", await cards.nth(1).getByText("Fallback 1", { exact: true }).isVisible());
    check("Slot 3 is fallback 2", await cards.nth(2).getByText("Fallback 2", { exact: true }).isVisible());

    for (let index = 0; index < PROVIDER_KEYS.length; index += 1) {
      const slot = index + 1;
      const card = cards.nth(index);
      await card.locator(`#provider-key-${slot}`).fill(PROVIDER_KEYS[index]);
      await card.getByRole("button", { name: "Add key" }).click();
      await page.waitForFunction(
        (configured) =>
          document.querySelectorAll(".ops-key-card.is-configured").length === configured,
        slot,
      );
      check(
        `Priority ${slot} input clears after its write-only save`,
        (await card.locator(`#provider-key-${slot}`).inputValue()) === "",
      );
    }

    check("All three ordered slots become configured", (await page.locator(".ops-key-card.is-configured").count()) === 3);
    check(
      "Key mutations preserve exact 1 -> 2 -> 3 order",
      providerMutations.map((mutation) => mutation.slot).join(",") === "1,2,3",
    );
    check(
      "Each save uses the latest configuration revision",
      providerMutations.map((mutation) => mutation.expectedRevision).join(",") === "7,8,9",
    );
    check(
      "All key slots target the selected provider",
      providerMutations.every((mutation) => mutation.provider === "openai"),
    );

    storage = await readStorage(page);
    check(
      "Provider keys are absent from localStorage and sessionStorage",
      PROVIDER_KEYS.every((key) => !storageContains(storage, key)),
    );
    const renderedText = await page.locator("body").innerText();
    check(
      "Provider keys are not echoed into rendered page text",
      PROVIDER_KEYS.every((key) => !renderedText.includes(key)),
    );

    await page.locator(".ops-language").getByRole("button", { name: "中" }).click();
    await page.locator("#main-content h1").filter({ hasText: "API 密钥降级" }).waitFor();
    check("Authenticated provider view switches to Chinese", await page.getByText("主密钥", { exact: true }).isVisible());
    await page.locator(".ops-language").getByRole("button", { name: "EN" }).click();

    console.log("\n[3] Desktop sections and responsive navigation");
    const sections = [
      ["Research", "Research runs"],
      ["Security", "Security"],
      ["System", "System"],
      ["Overview", "Overview"],
    ];
    for (const [navLabel, heading] of sections) {
      await page.locator(".ops-nav button").filter({ hasText: navLabel }).click();
      await page.locator("#main-content h1").filter({ hasText: heading }).waitFor();
      check(`${navLabel} section is reachable`, true);
    }

    check("1440px layout has no horizontal overflow", await noHorizontalOverflow(page));
    await page.setViewportSize({ width: 768, height: 900 });
    check("768px layout has no horizontal overflow", await noHorizontalOverflow(page));
    await page.setViewportSize({ width: 320, height: 720 });
    check("320px layout has no horizontal overflow", await noHorizontalOverflow(page));

    // The viewport media-query update re-renders the workspace once. Anchor
    // the locator to the stable control, then assert its accessible name
    // separately so the role query cannot be invalidated between assertions.
    const menuButton = page.locator(".ops-menu-button");
    check("Mobile navigation trigger is visible", await menuButton.isVisible());
    check("Mobile navigation trigger keeps its accessible name", (await menuButton.getAttribute("aria-label")) === "Open navigation");
    check("Mobile navigation starts collapsed", (await menuButton.getAttribute("aria-expanded")) === "false");
    await menuButton.click();
    check("Mobile navigation exposes expanded state", (await menuButton.getAttribute("aria-expanded")) === "true");
    check("Mobile navigation drawer becomes visible", await page.locator(".ops-sidebar.is-open").isVisible());
    await page.locator(".ops-nav button").filter({ hasText: "Provider keys" }).click();
    await page.locator("#main-content h1").filter({ hasText: "API key failover" }).waitFor();
    check("Selecting a mobile section closes the drawer", (await menuButton.getAttribute("aria-expanded")) === "false");
    const mobileSignOut = page.getByRole("button", { name: "Sign out" });
    check("Mobile sign-out keeps its accessible name", await mobileSignOut.isVisible());

    console.log("\n[4] Explicit sign-out");
    await mobileSignOut.click();
    await page.getByRole("heading", { name: "Administrator sign in" }).waitFor();
    const cookieAfterSignOut = (await context.cookies(BASE_URL)).find(
      (cookie) => cookie.name === "ll_admin_session" && cookie.value,
    );
    check("Sign-out clears the admin session cookie", !cookieAfterSignOut);
    storage = await readStorage(page);
    check("No credential secret remains after sign-out", !storageContains(storage, ADMIN_TOKEN) && PROVIDER_KEYS.every((key) => !storageContains(storage, key)));
    check("No uncaught browser errors occurred", pageErrors.length === 0, pageErrors.join(" | "));

    if (failed > 0) {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "admin-ui-e2e-failure.png"),
        fullPage: true,
      });
    }

    console.log("\n" + "=".repeat(58));
    console.log(`${passed} passed, ${failed} failed`);
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (error) {
    console.error("Admin UI E2E crashed:", error instanceof Error ? error.message : error);
    if (page) {
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "admin-ui-e2e-crash.png"),
        fullPage: true,
      }).catch(() => {});
    }
    process.exitCode = 2;
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
