import { NextResponse, NextRequest } from "next/server";
import { checkResearchRateLimit } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { createServerI18n } from "@/lib/i18n/server";
import {
  createResearchSession,
  deleteSession,
} from "@/lib/research/research-engine";
import { storeSession } from "@/lib/research/session-store";
import { recordResearchFunnelEvent } from "@/lib/research/funnel-analytics";
import { stage2ContextFromRequest } from "@/lib/analytics/stage2-context";
import { getResearchModeConfig } from "@/lib/research/research-modes";
import { probeDeepResearchCapability } from "@/lib/research/deep-research/capability";
import { startDeepResearchSession } from "@/lib/research/deep-research/runtime";
import {
  releaseDeepResearchAdmission,
  reserveDeepResearchAdmission,
  type DeepAdmissionDecision,
  type DeepAdmissionRejectionReason,
} from "@/lib/research/deep-research/admission";
import {
  validateResearchRequest,
  jsonValidationError,
  jsonError,
} from "@/lib/api/validation";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const ua = (request.headers.get("user-agent") || "").slice(0, 80);
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) {
    // R202: CORS rejections were previously mis-bucketed as csrf_failed,
    // polluting the CSRF alerting signal. Now recorded with a dedicated
    // event type so the two signals stay clean.
    recordAuthAudit("cors_rejected", {
      ipHash: hashIp(ip),
      detail: "cors-blocked: " + (request.headers.get("origin") || "unknown"),
    });
    return cors.response;
  }
  const logRequest = (status: number, ok: boolean) => recordRequest({
    ts: Date.now(),
    route: "/api/research",
    method: "POST",
    status,
    durationMs: Date.now() - start,
    ipHash: hashIp(ip),
    uaSnippet: ua,
    ok,
  });
  // Bypass token check — skips rate limiting and strict CSRF
  const authHeader = request.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const hasBypass = bearerToken ? isBypassToken(bearerToken, ip) : false;

  // Rate limit check (skipped for bypass tokens and trusted IPs).
  // R225: uses the env-tuned config (LAUNCHLENS_RATE_LIMIT_CAPACITY /
  // LAUNCHLENS_RATE_LIMIT_REFILL_MS) so operators can throttle without a
  // code change; defaults remain 10 requests / 60s.
  const rate = hasBypass
    ? { allowed: true, remaining: Infinity, resetMs: 0 }
    : checkResearchRateLimit(ip);
  if (!rate.allowed) {
    logRequest(429, false);
    recordAuthAudit("rate_limited", {
      ipHash: hashIp(ip),
      detail: "research endpoint",
    });
    const { t } = createServerI18n(request);
    const retrySeconds = Math.ceil(rate.resetMs / 1000);
    const message = t("errors.rateLimit", { seconds: String(retrySeconds) });
    return NextResponse.json(
      { error: message, resetMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset-Ms": String(rate.resetMs),
          "Retry-After": String(retrySeconds),
          "Content-Language": createServerI18n(request).locale,
        },
      },
    );
  }

  // CSRF check — soft enforcement by default, skipped for bypass tokens
  const csrfResult = hasBypass
    ? { ok: true, reason: "bypass-token" }
    : checkCsrfToken(request);
  if (!csrfResult.ok) {
    logRequest(403, false);
    recordAuthAudit("csrf_failed", {
      ipHash: hashIp(ip),
      detail: csrfResult.reason || "unknown",
    });
    return NextResponse.json(
      { error: "CSRF validation failed: " + (csrfResult.reason || "unknown") },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logRequest(400, false);
    return jsonError("Request body must be valid JSON.", 400);
  }

  const validation = validateResearchRequest(body);
  if (!validation.ok) {
    logRequest(400, false);
    return jsonValidationError(validation);
  }

  const { query, keywords, mode } = validation.value;
  const modeCapabilities =
    mode === "deep"
      ? await probeDeepResearchCapability()
      : getResearchModeConfig(mode);

  // Deep Research needs a durable async job runner because its target
  // protocol exceeds the request-bound 300 second SSE window. Recognize the
  // mode at the API boundary, but do not create a session that the current
  // synchronous engine would silently execute as Standard research.
  if (modeCapabilities.availability !== "available") {
    logRequest(409, false);
    return jsonError(
      modeCapabilities.capabilityNotice,
      409,
      {
        code: "RESEARCH_MODE_UNAVAILABLE",
        field: "mode",
        mode,
        modeCapabilities,
      },
    );
  }

  const stage2 = stage2ContextFromRequest(request);
  const session = createResearchSession(
    query,
    keywords,
    undefined,
    { mode, ...(stage2 ? { stage2 } : {}) },
  );

  let responseSession = session;
  if (mode === "deep") {
    const admission = await reserveDeepResearchAdmission(ip, session.id);
    if (!admission.allowed) {
      deleteSession(session.id);
      const status = admission.reason === "storage_unavailable" ? 503 : 429;
      logRequest(status, false);
      return deepAdmissionError(admission);
    }

    try {
      const started = await startDeepResearchSession(session);
      responseSession = started.record.session;
    } catch (error) {
      await releaseDeepResearchAdmission(session.id);
      deleteSession(session.id);
      logRequest(503, false);
      return jsonError(
        "Deep Research could not establish its durable execution record.",
        503,
        {
          code: "DEEP_RESEARCH_START_FAILED",
          retryable: true,
          detail: error instanceof Error ? error.name : "unknown_failure",
        },
      );
    }
  }

  // R231: execution-model change. Previously this route kicked off
  // runResearchSession in the background (fire-and-forget) so the client
  // could connect to the SSE stream immediately. That left the agent running
  // on whatever lambda handled the POST — which Vercel could freeze once
  // the response returned, severing the SSE stream on a different instance.
  //
  // The run now starts when the SSE stream route connects (see
  // /api/research/[sessionId]/stream/route.ts), where the agent and the SSE
  // listener share one request/instance for the full 300s window. This POST
  // route only creates the session and returns 201; the session is mirrored
  // to Upstash Redis (if configured) so the SSE route can hydrate it from a
  // different instance if necessary.
  //
  // CRITICAL: we AWAIT the Redis mirror before responding. createResearchSession
  // fires storeSession as fire-and-forget, but on Vercel serverless the lambda
  // is suspended the moment the response is sent — any unawaited promise is
  // killed mid-flight. If the SSE GET lands on a different instance (the common
  // case), hydrateSessionFromRedis would find nothing and emit terminal
  // not-found. Awaiting here guarantees the session is durably in Redis before
  // the client ever connects. storeSession is a no-op (returns immediately)
  // when Redis is not configured, so local dev / tests are unaffected.
  if (mode !== "deep") await storeSession(session);
  await recordResearchFunnelEvent("research_started", session.id, {
    mode: session.mode,
    stage2: session.stage2Tracking,
  });

  logRequest(201, true);
  const response = NextResponse.json(
    {
      sessionId: responseSession.id,
      query: responseSession.query,
      keywords: responseSession.keywords,
      mode: responseSession.mode,
      modeCapabilities,
      status: responseSession.status,
      agents: Object.fromEntries(
        Object.entries(responseSession.agents).map(([id, state]) => [
          id,
          {
            status: state.status,
            progress: state.progress,
            currentStep: state.currentStep,
          },
        ]),
      ),
    },
    { status: 201 },
  );
  for (const [k, v] of Object.entries(cors.headers)) {
    response.headers.set(k, v);
  }
  return rotateCsrf(response);
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST to create a research session." },
    {
      status: 405,
      headers: { Allow: "POST" },
    },
  );
}

function deepAdmissionError(
  decision: Extract<DeepAdmissionDecision, { allowed: false }>,
): NextResponse {
  const status = decision.reason === "storage_unavailable" ? 503 : 429;
  const retrySeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1_000));
  const response = jsonError(
    deepAdmissionMessage(decision.reason),
    status,
    {
      code: deepAdmissionCode(decision.reason),
      mode: "deep",
      retryable: true,
      retryAfterMs: decision.retryAfterMs,
    },
  );
  response.headers.set("Retry-After", String(retrySeconds));
  return response;
}

function deepAdmissionCode(reason: DeepAdmissionRejectionReason): string {
  switch (reason) {
    case "client_daily_limit":
      return "DEEP_CLIENT_DAILY_LIMIT";
    case "global_daily_limit":
      return "DEEP_GLOBAL_DAILY_LIMIT";
    case "client_active_limit":
      return "DEEP_CLIENT_ACTIVE_LIMIT";
    case "global_active_limit":
      return "DEEP_GLOBAL_ACTIVE_LIMIT";
    case "storage_unavailable":
      return "DEEP_ADMISSION_UNAVAILABLE";
  }
}

function deepAdmissionMessage(reason: DeepAdmissionRejectionReason): string {
  switch (reason) {
    case "client_daily_limit":
      return "This client has reached today's Deep Research start budget. Retry after the UTC budget reset.";
    case "global_daily_limit":
      return "The service has reached today's Deep Research start budget. Retry after the UTC budget reset.";
    case "client_active_limit":
      return "This client already has the maximum number of active Deep Research runs. Retry when the current reservation finishes or expires.";
    case "global_active_limit":
      return "The service is currently at its Deep Research concurrency limit. Retry when an active reservation finishes or expires.";
    case "storage_unavailable":
      return "Deep Research admission control is temporarily unavailable. No costly work was started; retry shortly.";
  }
}
