import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { getDashboardStats, getResearchStorageInfo } from "@/lib/research/storage";

/**
 * R224: lightweight aggregated dashboard stats.
 *
 * The home dashboard previously fetched `?limit=500` from /api/research/runs
 * (silently capped to 100 by that route) and re-counted totals on the client.
 * That made `totalRuns` wrong past 100 runs and shipped 100 summary rows just
 * to compute three numbers. This endpoint returns the pre-aggregated counts in
 * a single tiny payload.
 *
 * Authorization: same-origin read (no admin token), consistent with the runs
 * list route. CSRF cookie + rate limit prevent cross-site enumeration.
 */
export async function GET(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.resetMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } },
    );
  }

  // Optional ?since override (ms window for "recent" count), clamped to
  // [1h, 90d] to avoid abuse.
  const sinceParam = request.nextUrl.searchParams.get("since");
  let sinceMs = 7 * 24 * 60 * 60 * 1000;
  if (sinceParam) {
    const parsed = parseInt(sinceParam, 10);
    if (Number.isFinite(parsed)) {
      sinceMs = Math.min(90 * 24 * 60 * 60 * 1000, Math.max(60 * 60 * 1000, parsed));
    }
  }

  const stats = getDashboardStats(sinceMs);
  const info = getResearchStorageInfo();

  return NextResponse.json({
    totalRuns: stats.totalRuns,
    recentRuns: stats.recentRuns,
    totalDurationMin: Math.round(stats.totalDurationMs / 60000),
    byStatus: stats.byStatus,
    sinceMs,
    storage: {
      enabled: info.enabled,
      inMemoryCount: info.inMemoryCount,
      maxMemoryRuns: info.maxMemoryRuns,
    },
  });
}
