import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  revokeBypassToken,
  isAdminToken,
  extractBearerToken,
  checkAdminRateLimit,
  getTokenInfo,
} from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { hashIp } from "@/lib/telemetry/request-log";

function getIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
}

function authAdmin(request: NextRequest): { ok: boolean; error?: string; tokenHash?: string } {
  const auth = request.headers.get("authorization");
  const tok = extractBearerToken(auth);
  if (!tok) return { ok: false, error: "missing-auth" };

  const info = getTokenInfo(tok);
  if (!info) return { ok: false, error: "invalid-token" };
  if (info.scope !== "admin") return { ok: false, error: "insufficient-scope" };

  isAdminToken(tok, getIp(request));
  return { ok: true, tokenHash: info.hash };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  const ip = getIp(request);
  const auth = authAdmin(request);
  if (!auth.ok) {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      detail: "admin delete: " + auth.error,
    });
    return NextResponse.json({ error: "Unauthorized: " + auth.error }, { status: 401 });
  }

  const rate = checkAdminRateLimit(ip, auth.tokenHash);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded.", resetMs: rate.resetMs },
      { status: 429, headers: { "X-RateLimit-Remaining": String(rate.remaining) } },
    );
  }

  const { hash } = await params;
  const decodedHash = decodeURIComponent(hash);
  const ok = revokeBypassToken(decodedHash);
  if (!ok) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  recordAuthAudit("admin_action", {
    ipHash: hashIp(ip),
    tokenHash: auth.tokenHash,
    scope: "admin",
    detail: "revoked token " + decodedHash.slice(0, 8) + "...",
  });
  return NextResponse.json({ revoked: decodedHash, remaining: rate.remaining });
}

export const runtime = "nodejs";
