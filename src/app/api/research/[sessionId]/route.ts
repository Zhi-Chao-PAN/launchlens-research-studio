import { NextResponse, NextRequest } from "next/server";
import { getResearchSession, deleteSession, hydrateSessionFromRedis } from "@/lib/research/research-engine";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { normalizeResearchMode } from "@/lib/research/research-modes";
import { isRedisConfigured } from "@/lib/research/redis-client";
import { resolveResearchRun } from "@/lib/research/resolve-run";
import {
  deleteTerminalDeepResearchSession,
  readDeepResearchRecord,
} from "@/lib/research/deep-research/runtime";
import { deepRunProgressFromRecord } from "@/lib/research/deep-research/model";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";

const SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "sessionId",
    });
  }

  // Try the in-process map first (fast path for same-instance requests). If
  // absent, hydrate from Redis — on Vercel serverless this GET frequently
  // lands on a different instance than the one that ran the session, so the
  // local Map is empty even though the session completed successfully. Without
  // this hydration the route returned 404, which the client interpreted as
  // "Session expired" right after a successful SSE run.
  // Always ask the hydration seam to reconcile local and Redis state. A
  // POST instance can retain its original "pending" snapshot while the SSE
  // run advances on another instance; only hydrating when local state is
  // absent would return that stale snapshot indefinitely.
  let deepRecord = null;
  let deepReadFailed = false;
  if (isRedisConfigured()) {
    try {
      deepRecord = await readDeepResearchRecord(sessionId);
    } catch {
      deepReadFailed = true;
    }
  }
  const session =
    deepRecord?.session ??
    (await hydrateSessionFromRedis(sessionId)) ??
    getResearchSession(sessionId);
  if (session?.mode === "deep" && deepReadFailed) {
    return jsonErrorLocalized(request, "errors.serviceUnavailable", 503, undefined, {
      sessionId,
      code: "DEEP_STATE_UNAVAILABLE",
      retryable: true,
    });
  }
  if (!session) {
    // R217: distinguish "the live engine session was evicted" (the
    // completed run is still on disk and renderable) from a true
    // not-found. The client uses the `expired` reason to redirect the
    // user to /history instead of showing a generic 404.
    const persisted = await resolveResearchRun(sessionId);
    return jsonErrorLocalized(
      request,
      persisted ? "errors.sessionExpired" : "errors.notFound",
      persisted ? 410 : 404,
      undefined,
      { sessionId, persistedRunId: persisted?.id },
    );
  }

  return NextResponse.json({
    id: session.id,
    query: session.query,
    keywords: session.keywords,
    mode: normalizeResearchMode(session.mode),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    agents: session.agents,
    citations: session.citations,
    evidence: session.evidence,
    validation: session.validation,
    ...(deepRecord
      ? {
          deepRun: deepRunProgressFromRecord(deepRecord),
        }
      : {}),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rate = checkRateLimitForIp(ip, { capacity: 20, refillIntervalMs: 60_000 });
  if (!rate.allowed) {
    const retrySeconds = Math.ceil(rate.resetMs / 1000);
    return jsonErrorLocalized(
      request,
      "errors.rateLimit",
      429,
      { seconds: String(retrySeconds) },
      { retryAfterMs: rate.resetMs, resetMs: rate.resetMs },
    );
  }

  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "sessionId",
    });
  }

  const localSession = getResearchSession(sessionId);
  if (isRedisConfigured()) {
    try {
      const deepDeletion = await deleteTerminalDeepResearchSession(sessionId);
      if (deepDeletion.kind === "active") {
        return jsonErrorLocalized(
          request,
          "errors.activeDeepDeleteConflict",
          409,
          undefined,
          { sessionId, code: "DEEP_RUN_ACTIVE", retryable: false },
        );
      }
      if (deepDeletion.kind === "deleted") {
        deleteSession(sessionId);
        return NextResponse.json({
          ok: true,
          deleted: sessionId,
          preservedHistory: true,
        });
      }
    } catch {
      // If no local Standard session proves this id is safe to delete, fail
      // closed: Redis may contain an active Deep lease that must not be
      // orphaned merely because its authority is temporarily unreachable.
      if (!localSession || localSession.mode === "deep") {
        return jsonErrorLocalized(request, "errors.serviceUnavailable", 503, undefined, {
          sessionId,
          code: "DEEP_STATE_UNAVAILABLE",
          retryable: true,
        });
      }
    }
  }

  const existed = deleteSession(sessionId);
  if (!existed) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { sessionId });
  }
  return NextResponse.json({ ok: true, deleted: sessionId });
}
