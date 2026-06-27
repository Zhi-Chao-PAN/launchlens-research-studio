import { NextResponse, NextRequest } from "next/server";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { probeRetrievalProvider } from "@/lib/providers/retrieval-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R215: lightweight connectivity probe for the configured retrieval provider.
// Returns the configured provider id, latency, and any failure reason so the
// UI can show "Search connected" / "Search unavailable" without spinning up
// a full research session. Mock providers report ok=true immediately.

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
      route: "/api/retrieval/test",
      method: "POST",
      status,
      durationMs: Date.now() - start,
      ipHash: hashIp(ip),
      uaSnippet: ua,
      ok,
    });

  // CSRF (mutating POST). Bypass tokens skip.
  const authHeader = request.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const hasBypass = bearerToken ? isBypassToken(bearerToken, ip) : false;
  if (!hasBypass) {
    const csrfOk = await checkCsrfToken(request);
    if (!csrfOk) {
      logRequest(403, false);
      return rotateCsrf(
        NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 }),
      );
    }
  }

  // Rate limit — same tier as provider/test.
  const rate = hasBypass
    ? { allowed: true, remaining: Infinity, resetMs: 0 }
    : checkRateLimitForIp(ip);
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

  const result = await probeRetrievalProvider();
  const status = result.ok ? 200 : 503;
  logRequest(status, result.ok);
  return rotateCsrf(NextResponse.json(result, { status }));
}