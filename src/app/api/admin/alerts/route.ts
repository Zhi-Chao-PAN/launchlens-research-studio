import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminToken, extractBearerToken, getTokenInfo } from "@/lib/api/bypass-tokens";
import { getAlerts, alertConfig, clearAlerts, getWebhookQueueStats } from "@/lib/api/auth-alerts";
import { hashIp } from "@/lib/telemetry/request-log";

// Admin endpoint for security alerts.
// Requires admin-scope token.
//   GET  /api/admin/alerts          — returns recent alerts
//   GET  /api/admin/alerts?limit=N  — up to N alerts
//   GET  /api/admin/alerts?config=1 — returns alert config
//   DELETE /api/admin/alerts        — clear all alerts

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
  const auth = authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized: " + auth.error },
      { status: 401 },
    );
  }

  const url = new URL(request.url);

  // Stats view (webhook queue health)
  if (url.searchParams.get("stats") === "1") {
    return NextResponse.json({
      webhook: getWebhookQueueStats(),
    });
  }

  // Config view
  if (url.searchParams.get("config") === "1") {
    return NextResponse.json(alertConfig);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(50, Math.max(1, parseInt(limitParam || "20", 10) || 20));

  const alerts = getAlerts(limit);

  return NextResponse.json({
    alerts,
    count: alerts.length,
    limit,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "Unauthorized: " + auth.error },
      { status: 401 },
    );
  }

  clearAlerts();

  return NextResponse.json({ cleared: true });
}

export const runtime = "nodejs";
