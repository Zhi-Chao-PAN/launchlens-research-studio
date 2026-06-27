#!/usr/bin/env node
// R230: pre-deployment dry-run for the Vercel serverless scenario.
//
// Background:
//   research-engine.ts keeps a module-level `Map<sessionId, ResearchSession>`
//   plus `eventListeners` / `sessionAborts` / `sseIdleTimers` Maps. On Vercel,
//   each lambda invocation is a fresh V8 isolate — module-level state in one
//   invocation is invisible to the next. A subsequent request for the same
//   sessionId will land on (most likely) a different instance and see an empty
//   store, returning 404 even though the session was just created.
//
// This script reproduces that scenario without touching Vercel: it forks two
// child Node processes, each with its own module state. Child A "creates" a
// session (writes to its own private Map). Child B is asked to "look up" the
// same id. Both children write back to the parent via IPC; the parent prints
// the cross-process result.
//
// Expected output: child B's lookup returns null. This is the same null a
// cross-instance Vercel lookup will return. No surprises post-deploy.
//
// Usage:
//   node scripts/vercel-serverless-probe.js
//   npm run probe:serverless

"use strict";

const { fork } = require("node:child_process");
const path = require("node:path");

const CHILD_SCRIPT = path.join(__dirname, "vercel-serverless-probe-child.js");

function spawn(role) {
  return new Promise((resolve, reject) => {
    const child = fork(CHILD_SCRIPT, [role], {
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      env: { ...process.env, PROBE_ROLE: role },
    });
    child.once("message", (msg) => {
      child.kill();
      resolve(msg);
    });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`child ${role} exited with code ${code}`));
      }
    });
    child.once("error", reject);
  });
}

(async () => {
  console.log("[probe] LaunchLens Research Studio — Vercel serverless dry-run");
  console.log("[probe] Forks two child Node processes with isolated module state.");
  console.log("");

  // Child A creates a session in its private Map.
  const created = await spawn("create");
  if (!created || created.action !== "created") {
    console.error("[probe] FAILED to create session in child A:", created);
    process.exit(1);
  }
  console.log(`[probe] A.createResearchSession → id=${created.sessionId.slice(0, 12)}…`);

  // Child B (a separate V8 isolate) tries to look it up. Expected: null.
  const looked = await spawn(`lookup:${created.sessionId}`);
  if (!looked || looked.action !== "lookup-result") {
    console.error("[probe] FAILED to get lookup result from child B:", looked);
    process.exit(1);
  }

  console.log(`[probe] B.getResearchSession(${created.sessionId.slice(0, 12)}…) → ${looked.found ? "FOUND" : "undefined"}`);
  console.log("");

  if (!looked.found) {
    console.log("[probe] Conclusion: cross-process session lookup is IMPOSSIBLE.");
    console.log("[probe] This matches Vercel serverless behavior: each function instance");
    console.log("[probe] has its own module-level state (V8 isolate), and a session created");
    console.log("[probe] in one invocation is invisible to the next.");
    console.log("");
    console.log("[probe] What this means for a deploy:");
    console.log("[probe]   - GET /api/research/[id] from a different instance → 404.");
    console.log("[probe]   - SSE stream reconnect after cold start → empty event buffer.");
    console.log("[probe]   - LAUNCHLENS_STORAGE_DIR=/tmp disk writes → wiped between cold starts.");
    console.log("[probe]   - Within a single warm instance (back-to-back requests), state IS shared.");
    console.log("");
    console.log("[probe] Next round (R231) action depends on the Vercel-preview observation:");
    console.log("[probe]   - If SSE survives within a warm instance, no backend needed.");
    console.log("[probe]   - If SSE breaks across cold starts, wire src/lib/storage/storage.ts");
    console.log("[probe]     with a Redis/Vercel-KV backend; refactor research-engine.ts to use it.");
    console.log("");
    console.log("[probe] See docs/HANDOFF-NEXT-STAGE.md §2 for the full decision matrix.");
    process.exit(0);
  } else {
    console.error("[probe] UNEXPECTED: child B found a session created in child A.");
    console.error("[probe] That would mean module state IS shared across forks, which would");
    console.error("[probe] invalidate the serverless premise. Investigate Node version / flags.");
    process.exit(2);
  }
})().catch((err) => {
  console.error("[probe] crashed:", err);
  process.exit(3);
});
