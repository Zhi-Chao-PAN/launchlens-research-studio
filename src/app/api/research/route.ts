import { NextResponse, NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import {
  createResearchSession,
  runResearchSession,
} from "@/lib/research/research-engine";
import {
  validateResearchRequest,
  jsonValidationError,
  jsonError,
} from "@/lib/api/validation";

export async function POST(request: NextRequest) {
  const start = Date.now();
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const ua = (request.headers.get("user-agent") || "").slice(0, 80);
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
  const hasBypass = bearerToken ? isBypassToken(bearerToken) : false;

  // Rate limit check (skipped for bypass tokens)
  const rate = hasBypass
    ? { allowed: true, remaining: Infinity, resetMs: 0 }
    : checkRateLimit("research:" + ip);
  if (!rate.allowed) {
    logRequest(429, false);
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry shortly.", resetMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset-Ms": String(rate.resetMs),
        },
      },
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
  return NextResponse.json(
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
