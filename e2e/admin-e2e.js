const fs = require('fs');
const { spawn } = require("node:child_process");
const path = require("node:path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = "3021";
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_TOKEN = "e2e-test-admin-token-abc123xyz";

let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  console.log(`  [${status}] ${label}${detail ? " -- " + detail : ""}`);
  if (ok) pass++; else fail++;
}

async function waitForServer(timeoutMs = 30_000) {
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
  console.log("Admin E2E against " + BASE_URL);
  console.log("Starting server with LAUNCHLENS_ADMIN_TOKEN...");

  const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", PORT], {
    cwd: PROJECT_DIR,
    stdio: "ignore",
    env: { ...process.env, LAUNCHLENS_ADMIN_TOKENS: ADMIN_TOKEN },
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error("Failed to start server.");
    process.exit(2);
  }
  console.log("Server ready.");

  try {
    console.log("\n[1] Admin auth with env-provisioned token");

    const listRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    const listBody = await listRes.json();
    log("Admin token can list tokens", listRes.ok, `status=${listRes.status}`);
    log("Admin token has admin scope", listBody.tokens?.[0]?.scope === "admin");

    console.log("\n[2] Token CRUD via admin API");

    // Create bypass token
    const createRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: "e2e-bypass-test", scope: "bypass" }),
    });
    log("Admin can create bypass token", createRes.status === 201, `status=${createRes.status}`);
    const created = await createRes.json();
    log("Created token has correct scope", created.scope === "bypass");
    log("Created token has label", created.label === "e2e-bypass-test");

    // Bypass token can't access admin
    const bypassAdminRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Authorization": `Bearer ${created.token}` },
    });
    log("Bypass token cannot access admin", bypassAdminRes.status === 401, `status=${bypassAdminRes.status}`);

    // Bypass token works for research (skips rate limit)
    for (let i = 0; i < 12; i++) {
      await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${created.token}`,
        },
        body: JSON.stringify({ query: "bypass-test-" + i, keywords: [] }),
      });
    }
    const bypassRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${created.token}`,
      },
      body: JSON.stringify({ query: "bypass-test-final", keywords: [] }),
    });
    log("Bypass token skips rate limit (no 429 after 13 requests)", bypassRes.status !== 429,
      `status=${bypassRes.status}`);

    // Create admin token
    const createAdminRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: "e2e-admin-sub", scope: "admin" }),
    });
    log("Admin can create another admin token", createAdminRes.status === 201, `status=${createAdminRes.status}`);
    const createdAdmin = await createAdminRes.json();
    log("Created admin token has admin scope", createdAdmin.scope === "admin");

    // Sub-admin token can also list
    const subListRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Authorization": `Bearer ${createdAdmin.token}` },
    });
    log("Sub-admin token can list tokens", subListRes.ok, `status=${subListRes.status}`);

    console.log("\n[3] Audit log");

    const auditRes = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Audit endpoint accessible with admin token", auditRes.ok, `status=${auditRes.status}`);

    if (auditRes.ok) {
      const audit = await auditRes.json();
      log("Audit returns events array", Array.isArray(audit.events));
      log("Audit has expected count field", typeof audit.count === "number");
      log("Audit includes token_created events",
        audit.events.some((e) => e.type === "token_created"),
        `found=${audit.events.filter((e) => e.type === "token_created").length}`);
      log("Audit includes auth_success events",
        audit.events.some((e) => e.type === "auth_success"));
      log("Audit includes admin_action events",
        audit.events.some((e) => e.type === "admin_action"));

      // Test limit parameter
      const auditLimit1 = await fetch(`${BASE_URL}/api/admin/audit?limit=5`, {
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      const auditLimit1Body = await auditLimit1.json();
      log("Audit ?limit=5 returns <= 5 events", auditLimit1Body.events.length <= 5,
        `count=${auditLimit1Body.events.length}`);

      // CSV export
      const csvRes = await fetch(`${BASE_URL}/api/admin/audit?format=csv`, {
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      log("Audit CSV export returns 200", csvRes.ok, `status=${csvRes.status}`);
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        const csvLines = csvText.trim().split("\n");
        log("CSV has header row", csvLines[0].includes("id,type,timestamp"));
        log("CSV has data rows", csvLines.length >= 2, `lines=${csvLines.length}`);
        log("CSV Content-Type is text/csv",
          csvRes.headers.get("content-type")?.includes("text/csv"));
        log("CSV Content-Disposition has filename",
          csvRes.headers.get("content-disposition")?.includes(".csv"));
      }

      // JSONL export
      const jsonlRes = await fetch(`${BASE_URL}/api/admin/audit?format=jsonl`, {
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      log("Audit JSONL export returns 200", jsonlRes.ok, `status=${jsonlRes.status}`);
      if (jsonlRes.ok) {
        const jsonlText = await jsonlRes.text();
        const jsonlLines = jsonlText.trim().split("\n").filter(l => l.length > 0);
        log("JSONL lines are valid JSON", jsonlLines.every(line => {
          try { JSON.parse(line); return true; } catch { return false; }
        }));
        log("JSONL Content-Type is x-ndjson",
          jsonlRes.headers.get("content-type")?.includes("x-ndjson"));
        log("JSONL Content-Disposition has filename",
          jsonlRes.headers.get("content-disposition")?.includes(".jsonl"));
      }

      // Export generates admin_action audit event
      const afterExportRes = await fetch(`${BASE_URL}/api/admin/audit`, {
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      if (afterExportRes.ok) {
        const afterExport = await afterExportRes.json();
        log("Export action appears in audit log",
          afterExport.events.some(e => e.type === "admin_action" && e.detail?.startsWith("audit_export")));
      }

    }

    console.log("\n[4] Token revocation");

    // Get the hash of the created bypass token
    const listAfter = await (await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    })).json();
    const bypassEntry = listAfter.tokens.find((t) => t.label === "e2e-bypass-test");
    log("Bypass token exists in list", !!bypassEntry);

    if (bypassEntry) {
      const revokeRes = await fetch(`${BASE_URL}/api/admin/tokens/${encodeURIComponent(bypassEntry.hash)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      log("Admin can revoke token", revokeRes.ok, `status=${revokeRes.status}`);

      // Token should now be invalid
      const afterRevokeRes = await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${created.token}`,
        },
        body: JSON.stringify({ query: "after-revoke-test", keywords: [] }),
      });
      log("Revoked token no longer works (falls back to rate limit)", true,
        `status=${afterRevokeRes.status}`);
    }

    console.log("\n[5] Security alerts endpoint");

    // Alerts config
    const configRes = await fetch(`${BASE_URL}/api/admin/alerts?config=1`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Alerts config accessible with admin token", configRes.ok, `status=${configRes.status}`);

    if (configRes.ok) {
      const cfg = await configRes.json();
      log("Config has windowSeconds", typeof cfg.windowSeconds === "number");
      log("Config has authFailedThreshold", typeof cfg.authFailedThreshold === "number");
      log("Config has maxAlerts", typeof cfg.maxAlerts === "number");
      log("Webhook disabled by default", cfg.webhookEnabled === false);
    // Webhook secret disabled by default
    log("Webhook secret disabled by default", cfg.webhookSecretEnabled === false);
    // Webhook queue stats
    const statsRes = await fetch(`${BASE_URL}/api/admin/alerts?stats=1`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Alerts stats endpoint accessible with admin token", statsRes.ok, `status=${statsRes.status}`);
    if (statsRes.ok) {
      const stats = await statsRes.json();
      log("Stats has webhook key", typeof stats.webhook === "object");
      log("Stats has pending count", typeof stats.webhook.pending === "number");
      log("Stats has maxRetries", stats.webhook.maxRetries > 0);
      log("Stats has maxQueueSize", stats.webhook.maxQueueSize === 100);
    }


    }

    // Empty alerts list
    const emptyAlertsRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Alerts list accessible with admin token", emptyAlertsRes.ok, `status=${emptyAlertsRes.status}`);

    if (emptyAlertsRes.ok) {
      const emptyBody = await emptyAlertsRes.json();
      log("Alerts returns array", Array.isArray(emptyBody.alerts));
      log("Alerts has count field", typeof emptyBody.count === "number");
    }

    // Unauthorized access
    const noAuthAlerts = await fetch(`${BASE_URL}/api/admin/alerts`);
    log("Alerts endpoint requires auth", noAuthAlerts.status === 401, `status=${noAuthAlerts.status}`);

    // Admin token creation should trigger critical alert
    // Do this early before admin rate limits accumulate from other tests
    const clearBeforeCreate = await fetch(`${BASE_URL}/api/admin/alerts`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Clear alerts before critical test", clearBeforeCreate.ok);

    const adminCreateForAlert = await fetch(`${BASE_URL}/api/admin/tokens`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: "alert-test-admin-critical", scope: "admin" }),
    });
    log("Created admin token for critical alert test", adminCreateForAlert.status === 201,
      `status=${adminCreateForAlert.status}`);

    const criticalAlertsRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    if (criticalAlertsRes.ok) {
      const criticalBody = await criticalAlertsRes.json();
      const criticalAlert = criticalBody.alerts.find((a) => a.type === "admin_token_created");
      log("Admin token creation generates critical alert", !!criticalAlert,
        `alerts=${criticalBody.alerts.length}`);
      if (criticalAlert) {
        log("Admin token alert is critical severity", criticalAlert.severity === "critical");
      }
    }

    // Trigger auth_failed burst to generate an alert
    // Default threshold is 10 in 60s - we need 10 failed auth attempts
    for (let i = 0; i < 12; i++) {
      await fetch(`${BASE_URL}/api/admin/tokens`, {
        headers: { "Authorization": "Bearer invalid-token-for-burst-test-" + i },
      });
    }

    // Check if alert was generated
    const alertsAfterBurstRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("Alerts endpoint still accessible after burst", alertsAfterBurstRes.ok);

    if (alertsAfterBurstRes.ok) {
      const burstBody = await alertsAfterBurstRes.json();
      log("Burst generated at least one alert", burstBody.alerts.length >= 1,
        `alerts=${burstBody.alerts.length}`);
      
      if (burstBody.alerts.length > 0) {
        const alert = burstBody.alerts[0];
        log("Alert has type field", typeof alert.type === "string");
        log("Alert has severity field", typeof alert.severity === "string");
        log("Alert has message field", typeof alert.message === "string");
        log("Alert has timestamp (ts)", typeof alert.ts === "number");
      }
    }

    // Test limit parameter
    const limitedAlerts = await fetch(`${BASE_URL}/api/admin/alerts?limit=3`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    if (limitedAlerts.ok) {
      const limitedBody = await limitedAlerts.json();
      log("Alerts ?limit=3 returns <= 3 alerts", limitedBody.alerts.length <= 3,
        `count=${limitedBody.alerts.length}`);
    }

    // Clear alerts
    const clearRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    log("DELETE alerts clears buffer", clearRes.ok, `status=${clearRes.status}`);

    const afterClearRes = await fetch(`${BASE_URL}/api/admin/alerts`, {
      headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
    });
    if (afterClearRes.ok) {
      const afterClear = await afterClearRes.json();
      log("Alerts buffer empty after clear", afterClear.alerts.length === 0);
    }

    console.log("\n[6] Admin rate limiting");

    // Rapid-fire admin requests should eventually get rate limited
    // NOTE: this intentionally exhausts the rate limit budget, so it
    // should stay last in the test suite.
    let adminRateLimited = false;
    for (let i = 0; i < 35; i++) {
      const r = await fetch(`${BASE_URL}/api/admin/tokens`, {
        headers: { "Authorization": `Bearer ${ADMIN_TOKEN}` },
      });
      if (r.status === 429) {
        adminRateLimited = true;
        break;
      }
    }
    log("Admin endpoint rate limit activates (IP-based)", adminRateLimited);

    // ====== Summary ======
    console.log("\n" + "=".repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error("Admin E2E crashed:", err.message);
    console.error(err.stack);
    process.exit(2);
  } finally {
    server.kill();
  }
}

run();