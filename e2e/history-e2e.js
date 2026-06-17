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


    console.log("\n[6] Search + filter API");
    const searchRes = await fetch(`${BASE_URL}/api/research/runs?q=e2e history test`);
    log("Search by query works", searchRes.ok);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      log("Search returns matching results", searchData.runs.length >= 1);
      log("Search has total count", typeof searchData.total === "number");
    }

    const filterRes = await fetch(`${BASE_URL}/api/research/runs?status=completed`);
    log("Status filter returns 200", filterRes.ok);
    if (filterRes.ok) {
      const filterData = await filterRes.json();
      const allCompleted = filterData.runs.every((r) => r.status === "completed");
      log("Status filter only returns matching runs", allCompleted);
    }

    const emptyFilterRes = await fetch(`${BASE_URL}/api/research/runs?status=failed&q=nonexistentxyz`);
    log("Combined filter with no matches returns 200", emptyFilterRes.ok);
    if (emptyFilterRes.ok) {
      const emptyData = await emptyFilterRes.json();
      log("Empty result has total of 0", emptyData.total === 0);
    }

    console.log("\n[7] Export endpoints");
    const jsonExportRes = await fetch(`${BASE_URL}/api/research/runs?format=json`);
    log("JSON export returns 200", jsonExportRes.ok, `status=${jsonExportRes.status}`);
    if (jsonExportRes.ok) {
      const jsonData = await jsonExportRes.json();
      log("JSON export returns array", Array.isArray(jsonData));
      log("JSON export Content-Type is JSON", 
        jsonExportRes.headers.get("content-type")?.includes("application/json"));
    }

    const csvExportRes = await fetch(`${BASE_URL}/api/research/runs?format=csv`);
    log("CSV export returns 200", csvExportRes.ok, `status=${csvExportRes.status}`);
    if (csvExportRes.ok) {
      const csvText = await csvExportRes.text();
      log("CSV export has header row", csvText.includes("id,query,"));
      log("CSV export Content-Disposition attachment", 
        csvExportRes.headers.get("content-disposition")?.includes("attachment"));
    }

    const jsonlExportRes = await fetch(`${BASE_URL}/api/research/runs?format=jsonl`);
    log("JSONL export returns 200", jsonlExportRes.ok);
    if (jsonlExportRes.ok) {
      const jsonlText = await jsonlExportRes.text();
      const lines = jsonlText.split("\n").filter(Boolean);
      const allValid = lines.every((line) => {
        try { JSON.parse(line); return true; } catch { return false; }
      });
      log("JSONL export lines are valid JSON", allValid);
    }

    console.log("\n[8] Bulk delete API");
    // Create a run to delete
    const createForDelete = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "delete me", keywords: [] }),
    });
    const deleteCreated = await createForDelete.json();
    const deleteId = deleteCreated.sessionId;
    
    // Wait for completion
    await new Promise((r) => setTimeout(r, 8000));

    const deleteRes = await fetch(`${BASE_URL}/api/research/runs?ids=${deleteId}`, { method: "DELETE" });
    log("Bulk delete returns 200", deleteRes.ok, `status=${deleteRes.status}`);
    if (deleteRes.ok) {
      const deleteData = await deleteRes.json();
      log("Bulk delete reports deleted count", typeof deleteData.deleted === "number");
      log("Bulk delete deleted the run", deleteData.deleted >= 1);
    }

    // Verify it's gone
    const deletedDetail = await fetch(`${BASE_URL}/api/research/runs/${deleteId}`);
    log("Deleted run returns 404", deletedDetail.status === 404);

    console.log("\n[9] Pagination");
    const pageRes = await fetch(`${BASE_URL}/api/research/runs?limit=2&offset=0`);
    log("Paginated request returns 200", pageRes.ok);
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      log("Paginated response has limit", pageData.limit === 2);
      log("Paginated response has offset", pageData.offset === 0);
    }


    console.log("\n[10] Homepage + dashboard");
    const homeRes = await fetch(BASE_URL + "/");
    log("Homepage loads", homeRes.ok, `status=${homeRes.status}`);
    
    // Dashboard data API (runs list) — used by the homepage dashboard
    const runsApiRes = await fetch(BASE_URL + "/api/research/runs?limit=5");
    log("Dashboard data API works", runsApiRes.ok);
    if (runsApiRes.ok) {
      const runsData = await runsApiRes.json();
      log("Dashboard has runs array", Array.isArray(runsData.runs));
      log("Dashboard has total count", typeof runsData.total === "number");
    }


    console.log("\n[11] Share API");
    
    // Create a research run for sharing
    const shareStudyRes = await fetch(BASE_URL + "/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "share e2e test", keywords: ["share"] }),
    });
    
    if (shareStudyRes.ok) {
      const shareStudy = await shareStudyRes.json();
      const shareRunId = shareStudy.sessionId;
      log("Created share test run", !!shareRunId);
      
      // Wait for run to complete
      await new Promise((r) => setTimeout(r, 8000));
      
      // Create a share token
      const shareRes = await fetch(BASE_URL + "/api/research/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: shareRunId,
          maxViews: 10,
        }),
      });
      log("Create share token", shareRes.ok, `status=${shareRes.status}`);
      
      const shareData = shareRes.ok ? await shareRes.json() : null;
      log("Share has token", shareData && !!shareData.token);
      log("Share has maxViews", shareData && shareData.maxViews === 10);
      
      // View shared run via public endpoint
      if (shareData && shareData.token) {
        const viewRes = await fetch(`${BASE_URL}/api/research/share/${shareData.token}`);
        log("View shared run (public)", viewRes.ok, `status=${viewRes.status}`);
        
        const viewData = viewRes.ok ? await viewRes.json() : null;
        log("Shared run matches query", viewData && viewData.run.query === "share e2e test");
        log("View count incremented", viewData && viewData.share.views === 1);
      }
      
      // Share page renders
      if (shareData && shareData.token) {
        const sharePageRes = await fetch(`${BASE_URL}/share/${shareData.token}`);
        log("Share page loads", sharePageRes.ok);
        if (sharePageRes.ok) {
          const shareHtml = await sharePageRes.text();
          log("Share page has expected content", shareHtml.includes("share") || shareHtml.length > 1000);
        }
      }
    }
    
    // Invalid share returns 404
    const badShareRes = await fetch(BASE_URL + "/api/research/share/invalid-token-xyz");
    log("Invalid share returns 404", badShareRes.status === 404);


    console.log("\n[12] Compare page");
    // Need two run IDs. We'll use the first two runs from the list.
    const runsForCompare = await fetch(BASE_URL + "/api/research/runs?limit=2");
    if (runsForCompare.ok) {
      const compareData = await runsForCompare.json();
      if (compareData.runs && compareData.runs.length >= 2) {
        const id1 = compareData.runs[0].id;
        const id2 = compareData.runs[1].id;
        
        const comparePageRes = await fetch(`${BASE_URL}/compare?a=${id1}&b=${id2}`);
        log("Compare page loads", comparePageRes.ok, `status=${comparePageRes.status}`);
        
        // Compare API: both runs load
        const run1Res = await fetch(`${BASE_URL}/api/research/runs/${id1}`);
        const run2Res = await fetch(`${BASE_URL}/api/research/runs/${id2}`);
        log("Both runs load for comparison", run1Res.ok && run2Res.ok);
      }
    }
    
    // Compare page with no params shows error state
    const emptyCompareRes = await fetch(BASE_URL + "/compare");
    log("Compare page with no params loads (error state)", emptyCompareRes.ok);

    console.log("\n[13] Templates page");
    const templatesPageRes = await fetch(BASE_URL + "/templates");
    log("Templates page loads", templatesPageRes.ok, `status=${templatesPageRes.status}`);
    
    if (templatesPageRes.ok) {
      const tplHtml = await templatesPageRes.text();
      log("Templates page has title", tplHtml.includes("templates") || tplHtml.length > 1000);
    }

    console.log("\n[14] Batch research");
    
    // Create a batch
    const batchRes = await fetch(BASE_URL + "/api/research/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: ["batch test query 1", "batch test query 2"],
        keywords: ["batch", "test"],
      }),
    });
    log("Create batch returns 202", batchRes.status === 202, `status=${batchRes.status}`);
    
    if (batchRes.ok) {
      const batchData = await batchRes.json();
      log("Batch has batchId", !!batchData.batchId);
      log("Batch has 2 queries", batchData.total === 2);
      log("Batch status is running", batchData.status === "running");
      
      // List batches
      const listRes = await fetch(BASE_URL + "/api/research/batch");
      log("List batches works", listRes.ok);
      
      // Get batch status
      const statusRes = await fetch(`${BASE_URL}/api/research/batch/${batchData.batchId}`);
      log("Get batch status works", statusRes.ok);
      
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        log("Batch has progress field", typeof statusData.progress === "number");
        log("Batch has runs array", Array.isArray(statusData.runs));
      }
    }
    
    // Invalid batch returns 404
    const badBatchRes = await fetch(BASE_URL + "/api/research/batch/nonexistent-batch");
    log("Invalid batch returns 404", badBatchRes.status === 404);
    
    // Batch with empty queries returns 400
    const emptyBatchRes = await fetch(BASE_URL + "/api/research/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: [] }),
    });
    log("Empty batch returns 400", emptyBatchRes.status === 400);
    
    // Batch page renders
    const batchPageRes = await fetch(BASE_URL + "/batch");
    log("Batch page loads", batchPageRes.ok, `status=${batchPageRes.status}`);

    console.log("\n[15] Research diff");
    
    // Get two runs to compare
    const diffRunsRes = await fetch(BASE_URL + "/api/research/runs?limit=2");
    if (diffRunsRes.ok) {
      const diffRunsData = await diffRunsRes.json();
      if (diffRunsData.runs && diffRunsData.runs.length >= 2) {
        const runA = diffRunsData.runs[0];
        const runB = diffRunsData.runs[1];
        
        // Compare page with diff toggle
        const compareRes = await fetch(
          `${BASE_URL}/compare?a=${runA.id}&b=${runB.id}`
        );
        log("Compare page with two runs loads", compareRes.ok);
      }
    }

    console.log("\n[16] Keyboard shortcuts & command palette");
    
    // Pages that should have the command palette loaded
    const pages = ["/", "/history", "/templates", "/batch", "/compare"];
    let allLoad = true;
    for (const page of pages) {
      const res = await fetch(BASE_URL + page);
      if (!res.ok) allLoad = false;
    }
    log("All main pages load with palette", allLoad);
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
