#!/usr/bin/env node
// Security API e2e tests for LaunchLens Research Studio.
// Tests CSRF, rate limiting, bypass tokens, admin tokens, and audit log.
// Requires the production server to be running on $E2E_PORT (default 3020).
//
// Usage:
//   node e2e/security-e2e.js
//
// Environment:
//   E2E_PORT           — server port (default 3020)
//   E2E_ADMIN_TOKEN    — admin-scope token to test admin endpoints (optional)
//   E2E_BYPASS_TOKEN   — bypass-scope token to test bypass flow (optional)

const { spawn } = require("node:child_process");
const path = require("node:path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = process.env.E2E_PORT || "3020";
const BASE_URL = `http://localhost:${PORT}`;

let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  const status = ok ? "✓" : "✗";
  console.log(`  ${status} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
  return ok;
}

async function waitForServer(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // server not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log("Security E2E against " + BASE_URL);

  // Try to start the server if it's not running
  let server = null;
  try {
    await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    console.log("Server already running.");
  } catch {
    console.log("Starting production server...");
    server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", PORT], {
      cwd: PROJECT_DIR,
      stdio: "ignore",
    });
    const ready = await waitForServer();
    if (!ready) {
      console.error("Failed to start server.");
      process.exit(2);
    }
    console.log("Server ready.");
  }

  try {
    console.log("\n[1] CSRF endpoint");

    const csrf1 = await fetch(`${BASE_URL}/api/csrf`);
    const csrf1Body = await csrf1.json();
    log("CSRF endpoint returns csrfToken", !!csrf1Body.csrfToken && csrf1Body.csrfToken.length > 30,
      `len=${csrf1Body.csrfToken?.length || 0}`);

    const setCookie = csrf1.headers.get("set-cookie") || "";
    log("CSRF endpoint sets csrf_token cookie", setCookie.includes("csrf_token="));
    log("CSRF cookie is httpOnly", setCookie.includes("HttpOnly") || setCookie.includes("httponly"));

    console.log("\n[2] CSRF soft enforcement on /api/research");

    // Without CSRF token — should pass in soft mode
    const noCsrfRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "e2e no-csrf test", keywords: ["test"] }),
    });
    log("POST without CSRF (soft mode) succeeds", noCsrfRes.ok, `status=${noCsrfRes.status}`);

    // With matching CSRF token and cookie — should work
    const withCsrfRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf1Body.csrfToken,
        "Cookie": setCookie,
      },
      body: JSON.stringify({ query: "e2e with-csrf test", keywords: ["test"] }),
    });
    log("POST with matching CSRF succeeds", withCsrfRes.status === 201, `status=${withCsrfRes.status}`);

    // With mismatched CSRF — should fail
    const badCsrfRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "completely-wrong-token-value",
        "Cookie": setCookie,
      },
      body: JSON.stringify({ query: "e2e bad-csrf test", keywords: ["test"] }),
    });
    log("POST with mismatched CSRF returns 403", badCsrfRes.status === 403, `status=${badCsrfRes.status}`);

    console.log("\n[3] Rate limiting");

    let rateLimitHit = false;
    let lastStatus = 0;
    for (let i = 0; i < 20; i++) {
      const r = await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "rate-test-" + i, keywords: [] }),
      });
      lastStatus = r.status;
      if (r.status === 429) {
        rateLimitHit = true;
        break;
      }
    }
    log("Rate limiting activates (429) after rapid requests", rateLimitHit, `last_status=${lastStatus}`);

    console.log("\n[4] Admin endpoint auth");

    // No auth -> 401
    const noAuthRes = await fetch(`${BASE_URL}/api/admin/tokens`);
    log("Admin endpoint without auth returns 401", noAuthRes.status === 401, `status=${noAuthRes.status}`);

    // Fake token -> 401
    const fakeTokenRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Authorization": "Bearer fake-token-12345" },
    });
    log("Admin endpoint with fake token returns 401", fakeTokenRes.status === 401,
      `status=${fakeTokenRes.status}`);

    // Admin audit endpoint also requires auth
    const noAuthAuditRes = await fetch(`${BASE_URL}/api/admin/audit`);
    log("Admin audit endpoint without auth returns 401", noAuthAuditRes.status === 401,
      `status=${noAuthAuditRes.status}`);

    // If an admin token is provided, test admin flows
    const adminToken = process.env.E2E_ADMIN_TOKEN;
    if (adminToken) {
      console.log("\n[5] Admin operations (with E2E_ADMIN_TOKEN)");

      const listRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
        headers: { "Authorization": `Bearer ${adminToken}` },
      });
      log("Admin token can list tokens", listRes.ok, `status=${listRes.status}`);

      const createRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: "e2e-test-token", scope: "bypass" }),
      });
      log("Admin token can create bypass token", createRes.status === 201, `status=${createRes.status}`);

      if (createRes.ok) {
        const createBody = await createRes.json();
        log("Created token has scope and label", createBody.scope === "bypass" && createBody.label === "e2e-test-token");

        // Test that the created bypass token can NOT access admin
        const bypassAdminRes = await fetch(`${BASE_URL}/api/admin/tokens`, {
          headers: { "Authorization": `Bearer ${createBody.token}` },
        });
        log("Bypass token cannot access admin", bypassAdminRes.status === 401,
          `status=${bypassAdminRes.status}`);

        // Test audit log endpoint
        const auditRes = await fetch(`${BASE_URL}/api/admin/audit`, {
          headers: { "Authorization": `Bearer ${adminToken}` },
        });
        log("Admin audit endpoint returns events", auditRes.ok, `status=${auditRes.status}`);
        if (auditRes.ok) {
          const auditBody = await auditRes.json();
          log("Audit response has events array", Array.isArray(auditBody.events));
          log("Audit includes token_created event",
            auditBody.events.some((e) => e.type === "token_created"));
        }

        // Revoke the test token
        const listAfter = await listRes.json();
        const createdHash = listAfter.tokens?.find((t) => t.label === "e2e-test-token")?.hash;
        if (createdHash) {
          const revokeRes = await fetch(`${BASE_URL}/api/admin/tokens/${encodeURIComponent(createdHash)}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${adminToken}` },
          });
          log("Admin can revoke token", revokeRes.ok, `status=${revokeRes.status}`);
        }
      }
    } else {
      console.log("\n[5] Admin operations — SKIPPED (no E2E_ADMIN_TOKEN)");
      console.log("    Set E2E_ADMIN_TOKEN to test admin flows end-to-end.");
    }

  
  console.log("\n[6] Trusted IP rate limit bypass");

  const TRUSTED_PORT = "3025";
  const TRUSTED_BASE_URL = `http://localhost:${TRUSTED_PORT}`;

  // Helper to wait for a specific server
  async function waitForServerOnPort(port, timeoutMs = 30000) {
    const url = `http://localhost:${port}`;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return true;
      } catch { /* not ready */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  // Start a fresh server with trusted IP config
  const trustedServer = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", TRUSTED_PORT], {
    cwd: PROJECT_DIR,
    stdio: "ignore",
    env: { ...process.env, LAUNCHLENS_TRUSTED_IPS: "127.0.0.1,192.168.1.0/24" },
  });

  const trustedReady = await waitForServerOnPort(TRUSTED_PORT);
  if (!trustedReady) {
    console.error("Failed to start trusted-IP server.");
    process.exit(2);
  }
  console.log("Trusted-IP server ready.");

  try {
    // With trusted IP (127.0.0.1), rate limit should not apply even after many requests
    for (let i = 0; i < 25; i++) {
      await fetch(`${TRUSTED_BASE_URL}/api/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify({ query: "trusted-ip-test-" + i, keywords: [] }),
      });
    }

    const after25 = await fetch(`${TRUSTED_BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ query: "trusted-ip-final", keywords: [] }),
    });
    log("Trusted IP (127.0.0.1) bypasses rate limit", after25.status !== 429,
      `status=${after25.status}`);

    // CIDR range: 192.168.1.x should also be trusted
    await fetch(`${TRUSTED_BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.1.50",
      },
      body: JSON.stringify({ query: "cidr-trusted-test", keywords: [] }),
    });
    // After 25+ requests from same subnet, still not rate limited
    let cidrNotRateLimited = true;
    for (let i = 0; i < 15; i++) {
      const r = await fetch(`${TRUSTED_BASE_URL}/api/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.1." + i,
        },
        body: JSON.stringify({ query: "cidr-test-" + i, keywords: [] }),
      });
      if (r.status === 429) {
        cidrNotRateLimited = false;
        break;
      }
    }
    log("CIDR range (192.168.1.0/24) bypasses rate limit", cidrNotRateLimited);

    // Non-trusted IP should still rate limit
    for (let i = 0; i < 15; i++) {
      await fetch(`${TRUSTED_BASE_URL}/api/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.0.0.99",
        },
        body: JSON.stringify({ query: "untrusted-test-" + i, keywords: [] }),
      });
    }
    const untrustedRes = await fetch(`${TRUSTED_BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.99",
      },
      body: JSON.stringify({ query: "untrusted-final", keywords: [] }),
    });
    log("Untrusted IP still gets rate limited", untrustedRes.status === 429,
      `status=${untrustedRes.status}`);

  } finally {
    trustedServer.kill();
  }

  // ====== Summary ======
    console.log("\n" + "=".repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error("Security E2E crashed:", err.message);
    console.error(err.stack);
    process.exit(2);
  } finally {
    if (server) {
      server.kill();
    }
  }
}

run();
