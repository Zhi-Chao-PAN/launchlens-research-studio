// CSRF protection using the double-submit cookie pattern.
// Soft enforcement by default — missing cookie/token still allows
// the request but logs a warning. Set LAUNCHLENS_CSRF_STRICT=1 for
// hard enforcement (returns 403 on mismatch).
//
// The pattern:
//   1. Client fetches /api/csrf → gets a csrf_token cookie + token in body
//   2. Client includes X-CSRF-Token header with the token on POST requests
//   3. Server compares cookie token vs header token — must match

import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CsrfCheckResult {
  ok: boolean;
  reason?: string;
  token?: string;
}

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function checkCsrfToken(
  request: NextRequest,
  strict: boolean = process.env.LAUNCHLENS_CSRF_STRICT !== "0",
): CsrfCheckResult {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken && !headerToken) {
    // No CSRF on either side — soft mode allows this for backward compat
    if (strict) {
      return { ok: false, reason: "missing-csrf" };
    }
    return { ok: true, reason: "no-csrf-soft-mode" };
  }

  if (!cookieToken || !headerToken) {
    return { ok: false, reason: "csrf-mismatch-one-sided" };
  }

  // Constant-time comparison
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) {
    return { ok: false, reason: "csrf-length-mismatch" };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, reason: "csrf-token-mismatch" };
  }

  return { ok: true };
}

export function getCsrfCookieOptions(maxAgeMs: number = TOKEN_TTL_MS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
