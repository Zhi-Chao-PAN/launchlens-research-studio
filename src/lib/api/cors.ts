// CORS utilities for API routes.
// Default: permissive (Access-Control-Allow-Origin: *) for local development.
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

const IS_STRICT = ALLOWED_ORIGINS.length > 0;

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
  response?: NextResponse;
}

function buildHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};

  if (IS_STRICT && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (!IS_STRICT) {
    headers["Access-Control-Allow-Origin"] = "*";
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

  // Permissive mode — allow everything
  if (!IS_STRICT) {
    return { allowed: true, headers: buildHeaders(origin) };
  }

  // Strict mode — check against whitelist
  const normalizedOrigin = origin.replace(/\/$/, "");
  const matches = ALLOWED_ORIGINS.includes(normalizedOrigin);

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
  const headers = buildHeaders(IS_STRICT ? origin : null);

  // In strict mode, also validate the preflight
  if (IS_STRICT && origin) {
    const normalized = origin.replace(/\/$/, "");
    if (!ALLOWED_ORIGINS.includes(normalized)) {
      return NextResponse.json(
        { error: "CORS origin not allowed" },
        { status: 403, headers: buildHeaders(null) },
      );
    }
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
  const headers = buildHeaders(IS_STRICT ? origin : null);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}

export const corsConfig = {
  strict: IS_STRICT,
  allowedOrigins: ALLOWED_ORIGINS,
};
