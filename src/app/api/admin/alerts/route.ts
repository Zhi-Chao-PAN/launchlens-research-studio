import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAlerts, alertConfig, clearAlerts, getWebhookQueueStats } from "@/lib/api/auth-alerts";
import { requireAdmin } from "@/lib/api/require-admin";

// Admin endpoint for security alerts.
// Requires admin-scope token.
//   GET  /api/admin/alerts          — returns recent alerts
//   GET  /api/admin/alerts?limit=N  — up to N alerts
//   GET  /api/admin/alerts?config=1 — returns alert config
//   DELETE /api/admin/alerts        — clear all alerts

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

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
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  clearAlerts();

  return NextResponse.json({ cleared: true });
}

export const runtime = "nodejs";
