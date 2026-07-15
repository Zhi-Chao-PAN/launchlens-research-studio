import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  extractBearerToken,
  getTokenInfo,
  isAdminToken,
  recordAdminTokenHashUsage,
  checkAdminIpRateLimit,
  checkAdminTokenRateLimit,
} from "@/lib/api/bypass-tokens";
import { readAdminSession } from "@/lib/api/admin-session";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { hashIp } from "@/lib/telemetry/request-log";

/**
 * Result of a successful admin authentication. `tokenHash` is the SHA-256
 * hash of the presented token, suitable for audit logging and rate-limit
 * keying without exposing the plaintext.
 */
export interface AdminAuthOk {
  ok: true;
  tokenHash: string;
  ip: string;
}

export interface AdminAuthFail {
  ok: false;
  status: 401 | 429;
  response: NextResponse;
  reason: "missing-auth" | "invalid-token" | "insufficient-scope" | "rate-limited";
}

export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

function getIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
}

/**
 * Single source of truth for `/api/admin/*` authentication. Returns either
 * an `AdminAuthOk` carrying the caller's IP and token hash, or an
 * `AdminAuthFail` carrying a ready-to-return Response and the failure reason.
 *
 * This helper is intentionally side-effecting: a successful authentication
 * records `auth_success` and updates the token's usage counters, and a
 * failed one records `auth_failed`. Callers should return
 * `fail.response` directly when `ok` is `false` — no extra audit logging
 * is needed at the call site.
 */
export function requireAdmin(request: NextRequest): AdminAuthResult {
  const ip = getIp(request);
  const ipRate = checkAdminIpRateLimit(ip);
  if (!ipRate.allowed) return rateLimited(ipRate);

  const auth = request.headers.get("authorization");
  const tok = extractBearerToken(auth);
  const session = tok ? null : readAdminSession(request);
  if (!tok && !session) {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      detail: "admin endpoint: missing-auth",
    });
    return {
      ok: false,
      status: 401,
      reason: "missing-auth",
      response: NextResponse.json({ error: "Unauthorized: missing-auth" }, { status: 401 }),
    };
  }

  if (session) {
    if (!recordAdminTokenHashUsage(session.tokenHash, ip)) {
      recordAuthAudit("auth_failed", {
        ipHash: hashIp(ip),
        tokenHash: session.tokenHash,
        detail: "admin endpoint: invalid-session",
      });
      return {
        ok: false,
        status: 401,
        reason: "invalid-token",
        response: NextResponse.json({ error: "Unauthorized: invalid-session" }, { status: 401 }),
      };
    }
    const rate = checkAdminTokenRateLimit(session.tokenHash);
    if (!rate.allowed) return rateLimited(rate);
    return { ok: true, tokenHash: session.tokenHash, ip };
  }

  const info = getTokenInfo(tok!);
  if (!info) {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      detail: "admin endpoint: invalid-token",
    });
    return {
      ok: false,
      status: 401,
      reason: "invalid-token",
      response: NextResponse.json({ error: "Unauthorized: invalid-token" }, { status: 401 }),
    };
  }
  if (info.scope !== "admin") {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      tokenHash: info.hash,
      detail: "admin endpoint: insufficient-scope",
    });
    return {
      ok: false,
      status: 401,
      reason: "insufficient-scope",
      response: NextResponse.json({ error: "Unauthorized: insufficient-scope" }, { status: 401 }),
    };
  }

  // Record usage via isAdminToken (this also writes auth_success).
  isAdminToken(tok!, ip);

  // The anonymous IP bucket was consumed before authentication. Consume the
  // credential bucket only after a valid admin identity has been established.
  const rate = checkAdminTokenRateLimit(info.hash);
  if (!rate.allowed) return rateLimited(rate);

  return { ok: true, tokenHash: info.hash, ip };
}

function rateLimited(rate: { resetMs: number; remaining: number }): AdminAuthFail {
  return {
    ok: false,
    status: 429,
    reason: "rate-limited",
    response: NextResponse.json(
      { error: "Rate limit exceeded.", resetMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(rate.resetMs / 1000))),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    ),
  };
}
