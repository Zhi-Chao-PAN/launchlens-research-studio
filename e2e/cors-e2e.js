// Quick CORS strict mode test: starts server with LAUNCHLENS_CORS_ORIGINS
// and verifies that allowed origins work and disallowed ones get 403.
const { spawn } = require("node:child_process");
const path = require("node:path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = "3022";
const BASE_URL = `http://localhost:${PORT}`;
const ALLOWED_ORIGIN = "https://app.example.com";
const DISALLOWED_ORIGIN = "https://evil.com";

let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  const status = ok ? "✓" : "✗";
  console.log(`  ${status} ${label}${detail ? ` — ${detail}` : ""}`);
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
  console.log("CORS strict mode E2E against " + BASE_URL);
  console.log(`Allowed origin: ${ALLOWED_ORIGIN}`);

  const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", PORT], {
    cwd: PROJECT_DIR,
    stdio: "ignore",
    env: { ...process.env, LAUNCHLENS_CORS_ORIGINS: ALLOWED_ORIGIN },
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error("Failed to start server.");
    process.exit(2);
  }
  console.log("Server ready.\n");

  try {
    console.log("[1] CORS strict mode — disallowed origin");

    // POST to /api/research with disallowed origin
    const badOriginRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": DISALLOWED_ORIGIN,
      },
      body: JSON.stringify({ query: "cors test", keywords: [] }),
    });
    log("Disallowed origin gets 403", badOriginRes.status === 403, `status=${badOriginRes.status}`);
    log("Response has CORS error message", (await badOriginRes.text()).includes("CORS"));

    console.log("\n[2] CORS strict mode — allowed origin");

    // POST with allowed origin
    const goodOriginRes = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ query: "cors test allowed", keywords: [] }),
    });
    log("Allowed origin succeeds", goodOriginRes.status === 201, `status=${goodOriginRes.status}`);
    log("Response has ACAO header with allowed origin",
      goodOriginRes.headers.get("Access-Control-Allow-Origin") === ALLOWED_ORIGIN);
    log("Response has Vary: Origin header",
      goodOriginRes.headers.get("Vary")?.includes("Origin"));
    log("Response allows credentials",
      goodOriginRes.headers.get("Access-Control-Allow-Credentials") === "true");

    console.log("\n[3] CORS preflight (OPTIONS)");

    const preflightRes = await fetch(`${BASE_URL}/api/research`, {
      method: "OPTIONS",
      headers: {
        "Origin": ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    log("Preflight with allowed origin returns 204", preflightRes.status === 204,
      `status=${preflightRes.status}`);
    log("Preflight with disallowed origin returns 403", async () => {
      const bad = await fetch(`${BASE_URL}/api/research`, {
        method: "OPTIONS",
        headers: { "Origin": DISALLOWED_ORIGIN },
      });
      return bad.status === 403;
    }, "verified");

    console.log("\n[4] CORS with no origin header (same-origin)");

    const noOriginRes = await fetch(`${BASE_URL}/api/csrf`);
    log("No-origin request succeeds", noOriginRes.ok, `status=${noOriginRes.status}`);

    console.log("\n[5] CORS on admin endpoints");

    const adminBadOrigin = await fetch(`${BASE_URL}/api/admin/tokens`, {
      headers: { "Origin": DISALLOWED_ORIGIN },
    });
    log("Admin endpoint rejects bad origin", adminBadOrigin.status === 403,
      `status=${adminBadOrigin.status}`);

    // ====== Summary ======
    console.log("\n" + "=".repeat(50));
    console.log(`${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error("CORS E2E crashed:", err.message);
    console.error(err.stack);
    process.exit(2);
  } finally {
    server.kill();
  }
}

run();
