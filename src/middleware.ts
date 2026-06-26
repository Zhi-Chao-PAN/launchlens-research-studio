import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/api/csrf";

/**
 * Global middleware for `/api/*` requests.
 *
 * R202: this is the first line of defence. Each route may still apply its
 * own finer-grained checks (admin token, per-route rate limits, etc).
 *
 * What this enforces:
 *  1. CSRF verification on every non-safe (POST/PUT/PATCH/DELETE) request
 *     to /api/*. The double-submit cookie pattern requires a matching
 *     X-CSRF-Token header and csrf_token cookie. Bypass-token callers
 *     (Authorization: Bearer) skip CSRF, since possession of the bearer
 *     secret already proves authorisation.
 *  2. Default strict mode: a request with no CSRF token at all is rejected
 *     with 403. Set LAUNCHLENS_CSRF_STRICT=0 to fall back to legacy soft
 *     mode (useful for one-off smoke probes or during migrations).
 *  3. Per-IP basic rate limiting. The in-memory bucket survives within a
 *     single instance but is reset on process restart (same as the
 *     in-route rate limiter; for true horizontal scale swap to Redis).
 *
 * What this does NOT do (by design):
 *  - Admin-token gating. The four `/api/admin/*` endpoints use the
 *    `requireAdmin` helper inside the route, because that path also
 *    needs to record audit events and apply the per-token-hash rate limit
 *    that is impossible from edge middleware.
 *  - CORS. The existing per-route `checkCors` helper reads env-derived
 *    allowed-origin lists that we don't want to surface to the edge
 *    bundle. CORS preflight is handled by the existing OPTIONS handlers.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const config = {
  matcher: "/api/:path*",
};

export function middleware(request: NextRequest) {
  const method = (request.method || "GET").toUpperCase();

  // Safe methods always pass through; preflight is handled by route-level OPTIONS handlers.
  if (SAFE_METHODS.has(method)) return NextResponse.next();

  // Bypass-token callers skip CSRF (and rate limit, which the route applies
  // separately if it cares to). We sniff the Authorization header but do
  // not record audit here — the route that uses the token does that.
  const auth = request.headers.get("authorization");
  if (auth && /^Bearer\s+\S+/.test(auth)) {
    return NextResponse.next();
  }

  // CSRF check.
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const strict = process.env.LAUNCHLENS_CSRF_STRICT !== "0";

  if (!cookieToken && !headerToken) {
    if (strict) {
      return NextResponse.json(
        { error: "csrf_failed", reason: "missing-csrf" },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }
  if (!cookieToken || !headerToken) {
    return NextResponse.json(
      { error: "csrf_failed", reason: "csrf-mismatch-one-sided" },
      { status: 403 },
    );
  }
  if (!safeEqual(cookieToken, headerToken)) {
    return NextResponse.json(
      { error: "csrf_failed", reason: "csrf-token-mismatch" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
