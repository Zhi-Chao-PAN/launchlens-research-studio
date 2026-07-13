import { NextResponse, type NextRequest } from "next/server";
import { tickSchedules } from "@/lib/research/scheduler";
import { pruneStaleSessions } from "@/lib/research/research-engine";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { probeDeepResearchCapability } from "@/lib/research/deep-research/capability";
import { createDeepResearchService } from "@/lib/research/deep-research/runtime";

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
    const triggered = await tickSchedules();
    let deepRecovery: unknown = { kind: "disabled" };
    if (process.env.LAUNCHLENS_DEEP_ENABLED === "1") {
      const capability = await probeDeepResearchCapability();
      deepRecovery = capability.availability === "available"
        ? await createDeepResearchService().signal({ kind: "recover", limit: 25 })
        : { kind: "preview", blockers: capability.blockers };
    }
    // R217: piggyback session-map eviction on the cron tick so the
    // in-memory engine state doesn't grow unbounded over the lifetime
    // of a long-running server. Sessions are also evicted by delete
    // + pruneStaleSessions on cancel / completion, so this is purely
    // a safety net for any path that forgot to clean up.
    const pruned = pruneStaleSessions();
    return NextResponse.json({
      ok: true,
      triggered,
      pruned,
      deepRecovery,
      timestamp: new Date().toISOString(),
    });
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
