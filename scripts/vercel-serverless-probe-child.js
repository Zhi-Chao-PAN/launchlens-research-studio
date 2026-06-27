#!/usr/bin/env node
// R230: child process for vercel-serverless-probe.js.
//
// This file is invoked as `node scripts/vercel-serverless-probe-child.js <role>`,
// where <role> is either:
//   - "create"   — instantiate a fresh in-memory session store, write one entry,
//                  return the new id over IPC, then exit.
//   - "lookup:<sessionId>" — instantiate a *different* in-memory session store,
//                  look up the id (expected: not found), return the result over IPC.
//
// Both roles keep their session map at module scope. Because Node isolates
// child processes by default, the two Maps are guaranteed to be disjoint —
// exactly mirroring the Vercel per-invocation behavior.
//
// We deliberately do NOT import src/lib/research/research-engine.ts here:
// that would pull in the full LLM provider stack + telemetry + circuit breaker,
// none of which is needed to demonstrate the storage-isolation point.
// The script is a minimal in-memory analogue of the real engine's storage shape.

"use strict";

const sessions = new Map(); // sessionId → { id, query, status }

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createSession(query) {
  const id = generateId();
  const session = { id, query, status: "pending", createdAt: new Date().toISOString() };
  sessions.set(id, session);
  return session;
}

function lookupSession(id) {
  return sessions.has(id);
}

const role = process.argv[2] || "";
process.send = process.send || (() => {}); // no-op if IPC closed

if (role === "create") {
  const session = createSession("probe query");
  if (process.send) {
    process.send({ action: "created", sessionId: session.id, query: session.query });
  }
  setTimeout(() => process.exit(0), 50);
} else if (role.startsWith("lookup:")) {
  const id = role.slice("lookup:".length);
  const found = lookupSession(id);
  if (process.send) {
    process.send({ action: "lookup-result", sessionId: id, found });
  }
  setTimeout(() => process.exit(0), 50);
} else {
  console.error(`[probe-child] unknown role: "${role}"`);
  process.exit(1);
}
