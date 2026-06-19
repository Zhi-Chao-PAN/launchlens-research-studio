import { NextResponse, NextRequest } from "next/server";
import { checkRateLimit, checkRateLimitForIp } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";
import {
  createResearchSession,
  runResearchSession,
} from "@/lib/research/research-engine";
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
    recordAuthAudit("csrf_failed", {
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

  // Rate limit check (skipped for bypass tokens and trusted IPs)
  const rate = hasBypass
    ? { allowed: true, remaining: Infinity, resetMs: 0 }
    : checkRateLimitForIp(ip);
  if (!rate.allowed) {
    logRequest(429, false);
    recordAuthAudit("rate_limited", {
      ipHash: hashIp(ip),
      detail: "research endpoint",
    });
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry shortly.", resetMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset-Ms": String(rate.resetMs), "Retry-After": String(Math.ceil(rate.resetMs / 1000)),
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

  const { query, keywords } = validation.value;
  const session = createResearchSession(query, keywords);

  // Start the research in the background. We don't await it so the client
  // can connect to the SSE stream immediately. Errors are logged but do not
  // propagate to the response (the client polls/streams for status).
  runResearchSession(session.id).catch((err) => {
    console.error(`[research] session ${session.id} failed:`, err);
  });

  logRequest(201, true);
  const response = NextResponse.json(
    {
      sessionId: session.id,
      query: session.query,
      keywords: session.keywords,
      status: session.status,
      agents: Object.fromEntries(
        Object.entries(session.agents).map(([id, state]) => [
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
  return response;
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
