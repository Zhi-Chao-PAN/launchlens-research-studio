// Research history + detail page E2E tests
//
// Tests the /history page and /research/[id] page.
// Spawns its own Next.js server instance.

const { spawn } = require("node:child_process");
const path = require("node:path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = "3027";
const BASE_URL = `http://localhost:${PORT}`;

let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  console.log(`  [${status}] ${label}${detail ? " -- " + detail : ""}`);
  if (ok) pass++; else fail++;
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log("Research history E2E against " + BASE_URL);
  console.log("Starting server...");

  const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", PORT], {
    cwd: PROJECT_DIR,
    stdio: "ignore",
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error("Failed to start server.");
    process.exit(2);
  }
  console.log("Server ready.");

  try {
    console.log("\n[1] History page renders");
    const histRes = await fetch(`${BASE_URL}/history`);
    log("History page returns 200", histRes.ok, `status=${histRes.status}`);
    const histHtml = await histRes.text();
    log("Page has Research History heading", histHtml.includes("Research History"));
    log("Page has history-list container", histHtml.includes("history-list"));

    console.log("\n[2] Research runs API");
    const runsRes = await fetch(`${BASE_URL}/api/research/runs`);
    log("Runs API returns 200", runsRes.ok, `status=${runsRes.status}`);
    if (runsRes.ok) {
      const runsData = await runsRes.json();
      log("Runs response has runs array", Array.isArray(runsData.runs));
      log("Runs response has storage info", typeof runsData.storage === "object");
      log("Storage has inMemoryCount", typeof runsData.storage.inMemoryCount === "number");
    }

    console.log("\n[3] Research run detail API (404)");
    const notFoundRes = await fetch(`${BASE_URL}/api/research/runs/nonexistent-id`);
    log("Unknown run returns 404", notFoundRes.status === 404, `status=${notFoundRes.status}`);

    console.log("\n[4] Research detail page renders");
    const detailRes = await fetch(`${BASE_URL}/research/test-run-id`);
    log("Detail page returns 200", detailRes.ok, `status=${detailRes.status}`);
    const detailHtml = await detailRes.text();
    log("Detail page has research-detail class", detailHtml.includes("research-detail"));
    log("Detail page is a Next.js page", detailHtml.includes("__next") || detailHtml.includes("next/app"));

    console.log("\n[5] Create a run and verify it appears in history");
    // Start a research run
    const createRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "e2e history test", keywords: ["test"] }),
    });
    log("Create research run succeeds", createRes.status === 201, `status=${createRes.status}`);
    
    if (createRes.ok) {
      const created = await createRes.json();
      const runId = created.sessionId;
      log("Created run has session ID", !!runId);

      // Wait a bit for the run to complete (mock provider is fast)
      await new Promise((r) => setTimeout(r, 10000));

      // Check detail API
      const detailApiRes = await fetch(`${BASE_URL}/api/research/runs/${runId}`);
      log("Run detail API returns 200", detailApiRes.ok, `status=${detailApiRes.status}`);
      
      if (detailApiRes.ok) {
        const detailData = await detailApiRes.json();
        log("Detail has correct query", detailData.query === "e2e history test");
        log("Detail has provider", !!detailData.provider);
      }

      // Check history list
      const listRes = await fetch(`${BASE_URL}/api/research/runs?limit=5`);
      if (listRes.ok) {
        const listData = await listRes.json();
        const found = listData.runs.find((r) => r.id === runId);
        log("Run appears in history list", !!found, `total=${listData.runs.length}`);
        if (found) {
          log("List entry has correct query", found.query === "e2e history test");
          log("List entry has status", found.status === "completed" || found.status === "running");
        }
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error("History E2E crashed:", err.message);
    console.error(err.stack);
    process.exit(2);
  } finally {
    server.kill();
  }
}

run();
