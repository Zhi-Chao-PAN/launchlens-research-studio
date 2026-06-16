import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminToken, extractBearerToken, getTokenInfo } from "@/lib/api/bypass-tokens";
import { snapshotAuthAudit } from "@/lib/api/auth-audit";
import { checkCors, handleOptions } from "@/lib/api/cors";

// Auth audit log endpoint.
// Requires an admin-scoped token.
//   GET /api/admin/audit       — returns recent audit events (default 50)
//   GET /api/admin/audit?limit=N — returns up to N events (max 100)

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

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized: " + auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, parseInt(limitParam || "50", 10) || 50));

  const events = snapshotAuthAudit(limit);

  return NextResponse.json({
    events,
    count: events.length,
    limit,
  }, { headers: cors.headers });
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
