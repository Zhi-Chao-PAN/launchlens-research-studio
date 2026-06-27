#!/usr/bin/env node
// Smoke test for the LaunchLens Research Studio API.
// Starts a dev server, runs through the full research flow,
// and validates the response shape for every endpoint.

const { spawn } = require("node:child_process");
const path = require("node:path");

const PROJECT_DIR = path.resolve(__dirname, "..");
const PORT = process.env.SMOKE_TEST_PORT || "3010";
const BASE_URL = `http://localhost:${PORT}`;

let server;
let pass = 0;
let fail = 0;

function log(label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
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
  console.log("LaunchLens Research Studio — API smoke test\n");

  // Start dev server
  console.log("Starting dev server on port " + PORT + "...");
  server = spawn("npm.cmd", ["run", "start", "--", "-p", PORT], {
    cwd: PROJECT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: { ...process.env, PORT },
  });

  const ready = await waitForServer(BASE_URL, 45000);
  if (!ready) {
    console.error("Dev server did not become ready in time.");
    server.kill();
    process.exit(2);
  }
  console.log("Server ready.\n");

  try {
    // ----- Test 1: invalid body should be rejected -----
    console.log("[1] POST /api/research — validation");
    {
      const r = await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      log("Rejects empty body", r.status === 400, `status=${r.status}`);
      const body = await r.json();
      log("Returns error field", typeof body.error === "string", `error="${body.error}"`);
    }
    {
      const r = await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "ab" }),
      });
      log("Rejects too-short query", r.status === 400, `status=${r.status}`);
    }
    {
      const r = await fetch(`${BASE_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      });
      log("Rejects invalid JSON", r.status === 400, `status=${r.status}`);
    }

    // ----- Test 2: valid request creates a session -----
    console.log("\n[2] POST /api/research — happy path");
    const create = await fetch(`${BASE_URL}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "AI-powered note-taking app for university students",
        keywords: ["AI", "productivity", "students"],
      }),
    });
    log("Returns 201", create.status === 201, `status=${create.status}`);
    const session = await create.json();
    log("Returns sessionId", typeof session.sessionId === "string" && session.sessionId.length > 0, `id=${session.sessionId?.slice(0, 8)}...`);
    log("Returns agents", session.agents && Object.keys(session.agents).length === 6, `count=${Object.keys(session.agents || {}).length}`);

    const sessionId = session.sessionId;

    // ----- Test 3: GET session -----
    console.log("\n[3] GET /api/research/[id]");
    {
      const r = await fetch(`${BASE_URL}/api/research/${sessionId}`);
      log("Returns 200", r.status === 200, `status=${r.status}`);
      const body = await r.json();
      log("Echoes query", body.query === "AI-powered note-taking app for university students");
      log("Has agents", body.agents && Object.keys(body.agents).length === 6);
    }
    {
      const r = await fetch(`${BASE_URL}/api/research/!!!invalid!!!`);
      log("Rejects invalid id", r.status === 400 || r.status === 404, `status=${r.status}`);
    }
    {
      const r = await fetch(`${BASE_URL}/api/research/nonexistent`);
      log("Returns 404 for missing session", r.status === 404, `status=${r.status}`);
    }

    // ----- Test 4: SSE stream emits events -----
    console.log("\n[4] GET /api/research/[id]/stream");
    {
      const ctl = new AbortController();
      const events = [];
      const t = setTimeout(() => ctl.abort(), 25000);
      try {
        const r = await fetch(`${BASE_URL}/api/research/${sessionId}/stream`, { signal: ctl.signal });
        log("Returns 200", r.status === 200, `status=${r.status}`);
        log("Content-Type is text/event-stream", r.headers.get("content-type")?.includes("text/event-stream"), r.headers.get("content-type") || "");

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!ctl.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const lines = block.split("\n");
            let ev = "message", data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) ev = line.slice(7).trim();
              else if (line.startsWith("data: ")) data += line.slice(6);
            }
            if (ev === "message" && !data) continue;
            events.push({ event: ev, data });
            if (ev === "complete") {
              ctl.abort();
              break;
            }
          }
          if (events.some((e) => e.event === "complete")) break;
        }
        clearTimeout(t);
      } catch (err) {
        if (err.name !== "AbortError") throw err;
      }
      log("Emits state event", events.some((e) => e.event === "state"), `count=${events.length}`);
      log("Emits agent-progress events", events.some((e) => e.event === "agent-progress"));
      log("Emits agent-output events", events.some((e) => e.event === "agent-output"));
      log("Emits complete event", events.some((e) => e.event === "complete"));
    }

    // ----- Summary -----
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1;
  } finally {
    server.kill();
  }
}

run().catch((err) => {
  console.error("Smoke test crashed:", err);
  if (server) server.kill();
  process.exit(2);
});
