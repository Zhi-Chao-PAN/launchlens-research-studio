import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  listBypassTokens,
  createBypassToken,
} from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { requireAdmin } from "@/lib/api/require-admin";
import { hashIp } from "@/lib/telemetry/request-log";

// Admin endpoint for bypass token management.
// Requires an admin-scoped bypass token in the Authorization header.
//   GET  /api/admin/tokens     — list all tokens (hashes only)
//   POST /api/admin/tokens     — create a new token (body: { label?, scope? })

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const tokens = listBypassTokens();
  return NextResponse.json({ tokens }, { headers: cors.headers });
}

export async function POST(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { label?: string; scope?: string; ttlMs?: number } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  // Only allow "bypass" or "admin" scope
  const scope = body.scope === "admin" ? "admin" : "bypass";
  // R227: optional TTL (ms). Clamp to [0, 365 days]; 0 / omitted means use the
  // env default (LAUNCHLENS_TOKEN_DEFAULT_TTL_MS) or never-expire.
  const rawTtl = typeof body.ttlMs === "number" ? body.ttlMs : undefined;
  const ttlMs = rawTtl !== undefined
    ? Math.max(0, Math.min(365 * 24 * 60 * 60 * 1000, Math.floor(rawTtl)))
    : undefined;
  const token = createBypassToken(scope, body.label, ttlMs);

  recordAuthAudit("admin_action", {
    ipHash: hashIp(auth.ip),
    tokenHash: auth.tokenHash,
    scope: "admin",
    detail: `created ${scope} token${body.label ? ' (' + body.label + ')' : ''}`,
  });
  return rotateCsrf(
    NextResponse.json(
      { token, scope, label: body.label },
      { status: 201, headers: cors.headers },
    ),
  );
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
