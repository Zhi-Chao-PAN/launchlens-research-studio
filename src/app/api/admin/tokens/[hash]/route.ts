import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { revokeBypassToken } from "@/lib/api/bypass-tokens";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { hashIp } from "@/lib/telemetry/request-log";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { requireAdmin } from "@/lib/api/require-admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { hash } = await params;
  const decodedHash = decodeURIComponent(hash);
  const ok = revokeBypassToken(decodedHash);
  if (!ok) {
    return NextResponse.json({ error: "Token not found" }, { status: 404, headers: cors.headers });
  }
  recordAuthAudit("admin_action", {
    ipHash: hashIp(auth.ip),
    tokenHash: auth.tokenHash,
    scope: "admin",
    detail: "revoked token " + decodedHash.slice(0, 8) + "...",
  });
  return rotateCsrf(
    NextResponse.json({ revoked: decodedHash }, { headers: cors.headers }),
  );
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
