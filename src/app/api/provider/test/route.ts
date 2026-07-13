import { NextResponse, NextRequest } from "next/server";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { checkCsrfToken } from "@/lib/api/csrf";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";
import { recordRequest, hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { selectProvider } from "@/lib/providers/provider-registry";
import type { ProviderFallbackReason } from "@/lib/providers/provider.types";
import type { AgentId } from "@/lib/schema/research-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}

// A lightweight provider connectivity probe. Runs a single non-streaming
// generate() against the configured provider with the simplest agent schema
// (pain-detective) so a user can confirm their real API key/base URL/model
// actually produce valid structured output — without launching a full
// 6-agent research session. Mock providers return immediately. Real
// providers that fail (bad key, validation, network) return the precise
// reason so the user knows what to fix.
export async function POST(request: NextRequest) {
  const start = Date.now();
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const ua = (request.headers.get("user-agent") || "").slice(0, 80);
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) {
    return cors.response;
  }
  const logRequest = (status: number, ok: boolean) => recordRequest({
    ts: Date.now(),
    route: "/api/provider/test",
    method: "POST",
    status,
    durationMs: Date.now() - start,
    ipHash: hashIp(ip),
    uaSnippet: ua,
    ok,
  });

  // CSRF: this is a mutating POST. Strict-by-default; bypass tokens skip.
  const authHeader = request.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const hasBypass = bearerToken ? isBypassToken(bearerToken, ip) : false;
  if (!hasBypass) {
    const csrfResult = checkCsrfToken(request);
    if (!csrfResult.ok) {
      logRequest(403, false);
      return rotateCsrf(NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 }));
    }
  }

  // Rate limit — tighter than research since this is a diagnostic hammer.
  const rate = hasBypass
    ? { allowed: true, remaining: Infinity, resetMs: 0 }
    : checkRateLimitForIp(ip);
  if (!rate.allowed) {
    logRequest(429, false);
    return NextResponse.json(
      { error: "Too many requests. Please wait before retrying.", resetMs: rate.resetMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.resetMs / 1000)) } },
    );
  }

  const provider = selectProvider();

  // Mock provider needs no network — succeed immediately so the probe is
  // honest about the configured state without burning a fake "connection".
  if (provider.isMock) {
    logRequest(200, true);
    return rotateCsrf(
      NextResponse.json({
        ok: true,
        providerId: provider.id,
        displayName: provider.displayName,
        isMock: true,
        note: "Configured for the mock provider — no network call made.",
        durationMs: Date.now() - start,
      }),
    );
  }

  // Real provider: run one minimal non-streaming generate and capture the
  // fallback reason if it degrades. pain-detective has the lightest required
  // schema (summary + painPoints array + one citation), so it's the cheapest
  // valid probe.
  let reason: ProviderFallbackReason | undefined;
  try {
    await provider.generate("pain-detective" as AgentId, {
      query: "connectivity probe",
      keywords: [],
      onFallback: (r) => { reason = r; },
    });
  } catch {
    // generate() never throws (it falls back to mock internally), but guard
    // anyway so a thrown error is reported as a failure, not a crash.
    reason = "network_error";
  }

  const durationMs = Date.now() - start;
  const ok = !reason;
  logRequest(ok ? 200 : 502, ok);
  return rotateCsrf(
    NextResponse.json({
      ok,
      providerId: provider.id,
      displayName: provider.displayName,
      isMock: false,
      ...(reason ? { reason } : {}),
      durationMs,
    }),
  );
}
