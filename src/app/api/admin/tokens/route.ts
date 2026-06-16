import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  listBypassTokens,
  createBypassToken,
  isAdminToken,
  extractBearerToken,
  checkAdminRateLimit,
  getTokenInfo,
} from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";

// Admin endpoint for bypass token management.
// Requires an admin-scoped bypass token in the Authorization header.
//   GET  /api/admin/tokens     — list all tokens (hashes only)
//   POST /api/admin/tokens     — create a new token (body: { label?, scope? })

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

  // Record usage
  isAdminToken(tok, getIp(request));
  return { ok: true, tokenHash: info.hash };
}

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const ip = getIp(request);
  const auth = authAdmin(request);
  if (!auth.ok) {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      detail: "admin endpoint: " + auth.error,
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

  const tokens = listBypassTokens();
  return NextResponse.json({ tokens, remaining: rate.remaining }, { headers: cors.headers });
}

export async function POST(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const ip = getIp(request);
  const auth = authAdmin(request);
  if (!auth.ok) {
    recordAuthAudit("auth_failed", {
      ipHash: hashIp(ip),
      detail: "admin endpoint: " + auth.error,
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

  let body: { label?: string; scope?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  // Only allow "bypass" or "admin" scope
  const scope = body.scope === "admin" ? "admin" : "bypass";
  const token = createBypassToken(scope, body.label);

  recordAuthAudit("admin_action", {
    ipHash: hashIp(ip),
    tokenHash: auth.tokenHash,
    scope: "admin",
    detail: `created ${scope} token${body.label ? ' (' + body.label + ')' : ''}`,
  });
  return NextResponse.json(
    { token, scope, label: body.label, remaining: rate.remaining },
    { status: 201, headers: cors.headers },
  );
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
