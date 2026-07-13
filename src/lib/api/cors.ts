// CORS utilities for API routes.
// Default: same-origin only. Cross-origin access requires an explicit allowlist.
// Configure via LAUNCHLENS_CORS_ORIGINS (comma-separated list of allowed origins).
// When set, only listed origins are allowed and credentials are enabled.
//
// Usage in route handlers:
//   const cors = checkCors(request);
//   if (!cors.allowed) return cors.response;
//   // ... handle request, then merge headers:
//   return NextResponse.json(data, { headers: cors.headers });

import { NextRequest, NextResponse } from "next/server";

const ENV_ORIGINS = process.env.LAUNCHLENS_CORS_ORIGINS || "";
const ALLOWED_ORIGINS = ENV_ORIGINS
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const HAS_CONFIGURED_ALLOWLIST = ALLOWED_ORIGINS.length > 0;

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
  response?: NextResponse;
}

function buildHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Content-Type, Authorization, X-CSRF-Token, X-Requested-With";
  headers["Access-Control-Max-Age"] = "86400"; // 24h

  return headers;
}

/**
 * Check CORS for an incoming request.
 * Returns { allowed, headers, response? }.
 * If !allowed, `response` is a pre-built 403 you can return directly.
 * If allowed, merge `headers` into your response.
 */
export function checkCors(request: NextRequest): CorsResult {
  const origin = request.headers.get("origin");

  // No origin header (same-origin or non-browser) — allow
  if (!origin) {
    return { allowed: true, headers: buildHeaders(null) };
  }

  const matches = isAllowedOrigin(request, origin);

  if (!matches) {
    return {
      allowed: false,
      headers: buildHeaders(null),
      response: NextResponse.json(
        { error: "CORS origin not allowed" },
        { status: 403, headers: buildHeaders(null) },
      ),
    };
  }

  return { allowed: true, headers: buildHeaders(origin) };
}

/**
 * Handle an OPTIONS preflight request.
 * Call this at the top of your route handler for methods that need CORS.
 */
export function handleOptions(request: NextRequest): NextResponse | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("origin");
  const allowed = origin ? isAllowedOrigin(request, origin) : true;
  const headers = buildHeaders(allowed ? origin : null);

  if (!allowed) {
    return NextResponse.json(
      { error: "CORS origin not allowed" },
      { status: 403, headers: buildHeaders(null) },
    );
  }

  return new NextResponse(null, { status: 204, headers });
}

/**
 * Helper: apply CORS headers to a NextResponse.
 */
export function withCorsHeaders(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const origin = request.headers.get("origin");
  const headers = buildHeaders(origin && isAllowedOrigin(request, origin) ? origin : null);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}

export const corsConfig = {
  strict: true,
  mode: HAS_CONFIGURED_ALLOWLIST ? "allowlist" : "same-origin",
  allowedOrigins: ALLOWED_ORIGINS,
};

function isAllowedOrigin(request: NextRequest, origin: string): boolean {
  const normalizedOrigin = origin.replace(/\/$/, "");
  if (HAS_CONFIGURED_ALLOWLIST) return ALLOWED_ORIGINS.includes(normalizedOrigin);
  try {
    return normalizedOrigin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
