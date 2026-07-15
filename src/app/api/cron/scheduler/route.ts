import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { tickSchedules } from "@/lib/research/scheduler";
import { pruneStaleSessions } from "@/lib/research/research-engine";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { probeDeepResearchCapability } from "@/lib/research/deep-research/capability";
import { createDeepResearchService } from "@/lib/research/deep-research/runtime";
import {
  acquireRecoveryLock,
  releaseRecoveryLock,
  writeRecoveryHeartbeat,
} from "@/lib/research/deep-research/recovery-heartbeat";

// R212: serverless-friendly scheduler trigger.
//
// The scheduler module's `ensurePollerRunning()` starts a Node.js
// `setInterval` that depends on the Node process staying resident. On
// serverless platforms (Vercel, etc.) the function freezes between
// invocations and that poller never fires, so scheduled runs silently
// never execute.
//
// This endpoint exposes a thin trigger that external cron services
// (Vercel Cron, GitHub Actions, EasyCron, k8s CronJob) can hit on a
// fixed cadence. Authorisation is a shared secret compared in constant
// time, sent as the `x-cron-secret` header (or `authorization: Bearer
// <secret>` for systems that prefer bearer auth).
//
// Configure Vercel's standard `CRON_SECRET`; external schedulers may use the
// legacy `LAUNCHLENS_CRON_SECRET` alias. If neither is set, the
// endpoint refuses all calls — there is no implicit "open in dev"
// mode, because an open cron trigger in production is a privilege-
// escalation vector.
//
// R3xx: the route now acquires a Redis-backed single-flight lock so two
// cron triggers never run a recovery sweep in parallel, and writes a
// heartbeat on success/failure so the capability gate can honestly
// report whether the cron source is still firing.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthorized(request: NextRequest, cronSecret: string): boolean {
  if (!cronSecret) return false;
  const headerSecret = request.headers.get("x-cron-secret") || "";
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : "";
  return (
    constantTimeEqual(headerSecret, cronSecret) ||
    constantTimeEqual(bearer, cronSecret)
  );
}

export async function POST(request: NextRequest) {
  // Read the secret on every invocation so test setups that mutate
  // process.env between cases see the updated value.
  const cronSecret = resolveCronSecret(process.env);

  if (cronSecret.length < 24) {
    return jsonErrorLocalized(
      request,
      "errors.cronNotConfigured",
      503,
      undefined,
      { hint: "Set CRON_SECRET" },
    );
  }
  if (!isAuthorized(request, cronSecret)) {
    return jsonErrorLocalized(
      request,
      "errors.unauthorized",
      401,
      undefined,
      { scope: "cron" },
    );
  }

  try {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    const lock = await acquireRecoveryLock({ requestId });
    if (!lock.acquired) {
      return NextResponse.json({
        ok: true,
        deduped: true,
        heldBy: lock.heldBy,
        timestamp: new Date().toISOString(),
      });
    }

    const startedAt = Date.now();
    let triggered = 0;
    let deepRecovery: unknown = { kind: "disabled" };
    let dispatched = 0;
    let failed = 0;
    try {
      triggered = await tickSchedules();
      if (process.env.LAUNCHLENS_DEEP_ENABLED === "1") {
        const capability = await probeDeepResearchCapability();
        if (capability.availability === "available") {
          const result = await createDeepResearchService().signal({
            kind: "recover",
            limit: 25,
          });
          deepRecovery = { kind: "recovered", result };
          if (result && typeof result === "object") {
            const r = result as { dispatched?: unknown; failed?: unknown };
            if (typeof r.dispatched === "number") dispatched = r.dispatched;
            if (typeof r.failed === "number") failed = r.failed;
          }
        } else {
          deepRecovery = { kind: "preview", blockers: capability.blockers };
        }
      }
      // R217: piggyback session-map eviction on the cron tick so the
      // in-memory engine state doesn't grow unbounded over the lifetime
      // of a long-running server. Sessions are also evicted by delete
      // + pruneStaleSessions on cancel / completion, so this is purely
      // a safety net for any path that forgot to clean up.
      const pruned = pruneStaleSessions();
      const durationMs = Date.now() - startedAt;
      await writeRecoveryHeartbeat({
        ok: true,
        requestId,
        durationMs,
        dispatched,
        failed,
      });
      return NextResponse.json({
        ok: true,
        triggered,
        pruned,
        deepRecovery,
        timestamp: new Date().toISOString(),
        durationMs,
      });
    } catch (err) {
      const errorCode = err instanceof Error ? err.name : "scheduler_tick_failed";
      await writeRecoveryHeartbeat({
        ok: false,
        requestId,
        durationMs: Date.now() - startedAt,
        dispatched,
        failed,
        errorCode,
      });
      throw err;
    } finally {
      await releaseRecoveryLock(requestId);
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "tick failed",
      },
      { status: 500 },
    );
  }
}

// GET is allowed for platforms that only support GET (e.g. some webhook-
// style schedulers). Same auth, same response.
export async function GET(request: NextRequest) {
  return POST(request);
}

export function resolveCronSecret(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.CRON_SECRET || env.LAUNCHLENS_CRON_SECRET || "";
}