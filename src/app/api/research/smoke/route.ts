import { NextResponse, NextRequest } from "next/server";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { requireAdmin } from "@/lib/api/require-admin";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import { selectProvider } from "@/lib/providers/provider-registry";
import { runResearchSession, createResearchSession, getResearchSession, pruneStaleSessions } from "@/lib/research/research-engine";
import type { AgentId, AgentState } from "@/lib/schema/research-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R218: smoke test for the full 6-agent pipeline. Runs the research
 * engine against a fixed canned query ("AI code reviewer" + a couple of
 * keywords) using whatever provider is currently configured (real LLM
 * or mock), waits for the session to reach a terminal state, and
 * returns per-agent status + durationMs + degraded flag. Used by:
 *
 *   - The admin "Test providers" panel — proves that all 6 agents wire
 *     up to the live provider, not just the single-agent /api/provider/
 *     test route (which only exercises pain-detective).
 *   - Release gating — a future CI job can curl this and refuse to
 *     deploy when any agent is degraded or fails to complete.
 *
 * Admin-gated because it actually runs a research session: ~1 minute of
 * compute per call plus LLM cost. The /api/provider/test route remains
 * the right choice for "is my key valid?" — this one is for "is the
 * pipeline healthy end-to-end?".
 */

const SMOKE_TIMEOUT_MS = (() => {
  const raw = process.env.LAUNCHLENS_SMOKE_TIMEOUT_MS;
  if (!raw) return 90_000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 10_000 ? parsed : 90_000;
})();

const SMOKE_QUERY = "smoke-test: AI code reviewer";
const SMOKE_KEYWORDS = ["devtools", "ai"];

function agentSnapshot(state: AgentState) {
  return {
    status: state.status,
    progress: state.progress,
    durationMs: state.startedAt && state.completedAt
      ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
      : 0,
    degraded: state.degraded ?? false,
    degradedReason: state.degradedReason ?? null,
    error: state.error ?? null,
  };
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const ip =
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "anonymous";
  const ua = (request.headers.get("user-agent") || "").slice(0, 80);
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;

  const logRequest = (status: number, ok: boolean) =>
    recordRequest({
      ts: Date.now(),
      route: "/api/research/smoke",
      method: "POST",
      status,
      durationMs: Date.now() - start,
      ipHash: hashIp(ip),
      uaSnippet: ua,
      ok,
    });

  // Admin-gated: smoke runs the real pipeline, costs LLM tokens, and
  // returns the configured provider's status. We require an admin
  // bearer token in addition to CSRF.
  const auth = requireAdmin(request);
  if (!auth.ok) {
    logRequest(401, false);
    return rotateCsrf(NextResponse.json({ error: "Admin token required" }, { status: 401 }));
  }

  const csrfOk = await checkCsrfToken(request);
  if (!csrfOk) {
    logRequest(403, false);
    return rotateCsrf(NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 }));
  }

  const rate = checkRateLimitForIp(ip);
  if (!rate.allowed) {
    logRequest(429, false);
    return rotateCsrf(
      NextResponse.json(
        { error: "rate_limited", retryAfterMs: rate.resetMs },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) },
        },
      ),
    );
  }

  const provider = selectProvider();
  const session = createResearchSession(SMOKE_QUERY, SMOKE_KEYWORDS);
  const sessionId = session.id;

  // Race the run against a server-side timeout. The per-agent wall-clock
  // budget (R216) ensures no single agent hangs, but a full 6-agent
  // session under a slow / failing provider can still take a while —
  // cap it at SMOKE_TIMEOUT_MS so a smoke call from CI can't take 10
  // minutes.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
  }, SMOKE_TIMEOUT_MS);

  try {
    await runResearchSession(sessionId, { speedMultiplier: 1 });
  } catch (e) {
    clearTimeout(timer);
    // Best-effort cleanup; smoke sessions are throwaway.
    logRequest(500, false);
    return rotateCsrf(
      NextResponse.json(
        {
          ok: false,
          sessionId,
          provider: { id: provider.id, isMock: provider.isMock },
          error: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      ),
    );
  }
  clearTimeout(timer);

  // Best-effort eviction so the smoke session doesn't pollute the
  // in-memory map for the rest of the process lifetime.
  pruneStaleSessions();

  const refreshed = getResearchSession(sessionId);
  if (!refreshed) {
    logRequest(500, false);
    return rotateCsrf(
      NextResponse.json(
        { ok: false, error: "session disappeared before snapshot", sessionId },
        { status: 500 },
      ),
    );
  }

  const agentIds: AgentId[] = [
    "market-sizer",
    "competitor-analyst",
    "pain-detective",
    "pricing-scout",
    "channel-scout",
    "synthesis",
  ];
  const agents: Record<string, ReturnType<typeof agentSnapshot>> = {};
  let anyDegraded = false;
  let anyFailed = false;
  for (const id of agentIds) {
    const snap = agentSnapshot(refreshed.agents[id]);
    agents[id] = snap;
    if (snap.degraded) anyDegraded = true;
    if (snap.status === "error") anyFailed = true;
  }

  const status = refreshed.status;
  const ok = !timedOut && !anyFailed && status === "completed";
  const statusCode = ok ? 200 : 503;
  logRequest(statusCode, ok);

  return rotateCsrf(
    NextResponse.json(
      {
        ok,
        sessionId,
        provider: { id: provider.id, isMock: provider.isMock, displayName: provider.displayName },
        sessionStatus: status,
        anyDegraded,
        anyFailed,
        timedOut,
        durationMs: Date.now() - start,
        agents,
      },
      { status: statusCode },
    ),
  );
}