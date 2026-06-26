import { NextResponse, type NextRequest } from "next/server";
import { getRecentTelemetry, summarizeTelemetry } from "@/lib/telemetry/telemetry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";
import { getRecentRequests } from "@/lib/telemetry/request-log";
import { requireAdmin } from "@/lib/api/require-admin";

/**
 * GET /api/telemetry
 *
 * R202: requires an admin-scope bearer token. This endpoint exposes ipHash
 * (FNV-1a of caller IP), UA snippets, request latencies, and circuit-breaker
 * state — all of which is operationally sensitive. Prior to R202 the
 * endpoint was fully open.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));
  return NextResponse.json({
    summary: summarizeTelemetry(),
    breakers: snapshotBreakers(),
    recent: getRecentTelemetry(limit),
    requests: getRecentRequests(Math.min(limit, 100)),
  });
}

export const runtime = "nodejs";
