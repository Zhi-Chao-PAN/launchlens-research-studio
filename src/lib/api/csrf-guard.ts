import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { extractBearerToken, isBypassToken } from "@/lib/api/bypass-tokens";

/**
 * Run CSRF verification for a mutating request. Returns a 403 Response if
 * verification fails, or null if the handler should proceed. GET/HEAD/OPTIONS
 * always pass through. Accepts both plain Request and NextRequest.
 *
 * Bypass tokens (Authorization: Bearer <bypass-token>) skip CSRF entirely,
 * consistent with the bypass behaviour on POST /api/research.
 */
export function verifyCsrf(request: Request): Response | null {
  const method = (request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  // R202: bypass tokens now skip CSRF on every mutating route, not just
  // the main POST /api/research. The token itself is a bearer secret so
  // possession is proof of authorisation.
  const auth = request.headers.get("authorization");
  const bearer = extractBearerToken(auth);
  if (bearer) {
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
    if (isBypassToken(bearer, ip)) return null;
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = readCookie(cookieHeader, CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  // Default to strict mode — a request without a CSRF token is rejected. Set
  // LAUNCHLENS_CSRF_STRICT=0 to fall back to the legacy soft behaviour
  // (used during migrations or by callers that legitimately need unauthenticated
  // POSTs, e.g. a one-off smoke probe).
  const strict = process.env.LAUNCHLENS_CSRF_STRICT !== "0";
  if (!cookieToken && !headerToken) {
    return strict
      ? NextResponse.json({ error: "csrf_failed", reason: "missing-csrf" }, { status: 403 })
      : null;
  }
  if (!cookieToken || !headerToken) {
    return NextResponse.json({ error: "csrf_failed", reason: "csrf-mismatch-one-sided" }, { status: 403 });
  }
  if (!safeEqual(cookieToken, headerToken)) {
    return NextResponse.json({ error: "csrf_failed", reason: "csrf-token-mismatch" }, { status: 403 });
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
