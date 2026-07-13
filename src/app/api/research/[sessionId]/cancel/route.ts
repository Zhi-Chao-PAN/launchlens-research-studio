import { NextResponse, NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import {
  awaitTerminalCheckpoint,
  cancelSession,
  getResearchSession,
  hydrateSessionFromRedis,
} from "@/lib/research/research-engine";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { isRedisConfigured } from "@/lib/research/redis-client";
import {
  cancelDeepResearchSession,
  readDeepResearchRecord,
} from "@/lib/research/deep-research/runtime";

const SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;

// POST /api/research/[sessionId]/cancel - request cancellation of a running session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    const retrySeconds = Math.ceil(rl.resetMs / 1000);
    return jsonErrorLocalized(
      request,
      "errors.rateLimit",
      429,
      { seconds: String(retrySeconds) },
      { retryAfterMs: rl.resetMs, resetMs: rl.resetMs },
    );
  }

  const { sessionId } = await params;
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "sessionId",
    });
  }
  let deepRecord = null;
  let deepReadFailed = false;
  if (isRedisConfigured()) {
    try {
      deepRecord = await readDeepResearchRecord(sessionId);
    } catch {
      deepReadFailed = true;
    }
  }
  let existing = deepRecord?.session ?? getResearchSession(sessionId);
  if (!existing || existing.status === "pending" || existing.status === "running") {
    existing = deepRecord?.session ?? (await hydrateSessionFromRedis(sessionId)) ?? existing;
  }
  if (!existing) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { sessionId });
  }
  if (existing.mode === "deep" && deepReadFailed) {
    return jsonErrorLocalized(request, "errors.serviceUnavailable", 503, undefined, {
      sessionId,
      code: "DEEP_STATE_UNAVAILABLE",
      retryable: true,
    });
  }

  // Cancellation is idempotent only for the same terminal outcome. Returning
  // `{ ok: false, status: "cancelled" }` for every finished run makes the
  // client report success even when the run actually completed or failed.
  if (existing.status === "cancelled") {
    return rotateCsrf(NextResponse.json({
      ok: true,
      sessionId,
      status: "cancelled",
      idempotent: true,
    }));
  }
  if (existing.status === "completed" || existing.status === "error") {
    return rotateCsrf(NextResponse.json({
      ok: false,
      error: `Session is already ${existing.status} and cannot be cancelled.`,
      sessionId,
      status: existing.status,
    }, { status: 409 }));
  }

  if (deepRecord) {
    const cancelled = await cancelDeepResearchSession(sessionId);
    if (cancelled?.lifecycle === "cancelled") {
      return rotateCsrf(NextResponse.json({
        ok: true,
        sessionId,
        status: "cancelled",
        ...(deepRecord.lifecycle === "cancelled" ? { idempotent: true } : {}),
      }));
    }
    return rotateCsrf(NextResponse.json({
      ok: false,
      error: cancelled
        ? `Session is already ${cancelled.lifecycle} and cannot be cancelled.`
        : "Session could not be cancelled.",
      sessionId,
      status: cancelled?.session.status ?? existing.status,
    }, { status: 409 }));
  }

  const ok = cancelSession(sessionId);
  // The checkpoint includes the cross-instance cancel flag, final session
  // mirror, partial dossier, and terminal event. Await it so a serverless
  // invocation cannot be suspended after responding but before those writes.
  if (ok) {
    await awaitTerminalCheckpoint(sessionId);
    return rotateCsrf(NextResponse.json({ ok: true, sessionId, status: "cancelled" }));
  }

  // A completion can race with this request after the precondition above.
  // Re-read the actual state and surface the conflict instead of claiming a
  // cancellation that never happened.
  const actual = getResearchSession(sessionId);
  if (actual?.status === "cancelled") {
    await awaitTerminalCheckpoint(sessionId);
    return rotateCsrf(NextResponse.json({
      ok: true,
      sessionId,
      status: "cancelled",
      idempotent: true,
    }));
  }
  return rotateCsrf(NextResponse.json({
    ok: false,
    error: actual
      ? `Session is ${actual.status} and could not be cancelled.`
      : "Session could not be cancelled.",
    sessionId,
    status: actual?.status ?? existing.status,
  }, { status: 409 }));
}
