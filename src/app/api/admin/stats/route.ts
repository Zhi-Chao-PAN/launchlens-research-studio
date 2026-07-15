import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getResearchStorageInfo, listResearchRuns } from "@/lib/research/storage";
import { getShareStats } from "@/lib/research/share-tokens";
import { getAlerts } from "@/lib/api/auth-alerts";
import { requireAdmin } from "@/lib/api/require-admin";

// Admin stats endpoint — aggregated system metrics.
// Requires admin-scope bearer token. Authentication, rate limiting, and
// audit logging are handled by requireAdmin(); this handler just aggregates.
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const storageInfo = getResearchStorageInfo();
    const shareStats = getShareStats();
    const alerts = getAlerts();

    // Research stats
    const allRuns = listResearchRuns();
    const completedRuns = allRuns.filter((r) => r.status === "completed").length;
    const failedRuns = allRuns.filter((r) => r.status === "failed").length;
    const cancelledRuns = allRuns.filter((r) => r.status === "cancelled").length;
    const runningRuns = Math.max(0, allRuns.length - completedRuns - failedRuns - cancelledRuns);

    const completed = allRuns.filter((r) => r.status === "completed");
    const avgDuration = completed.length > 0
      ? Math.round(completed.reduce((sum, r) => sum + r.durationMs, 0) / completed.length)
      : 0;

    // Time-based counts
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const runsToday = allRuns.filter((r) => r.createdAt > dayAgo).length;
    const runsThisWeek = allRuns.filter((r) => r.createdAt > weekAgo).length;

    // Alerts
    const criticalAlerts = alerts.filter(
      (a: { severity: string; resolved?: boolean }) =>
        a.severity === "critical" && !a.resolved,
    ).length;
    const warningAlerts = alerts.filter(
      (a: { severity: string; resolved?: boolean }) =>
        a.severity === "warning" && !a.resolved,
    ).length;

    // Top keywords
    const keywordCounts = new Map<string, number>();
    for (const run of allRuns.slice(0, 100)) {
      for (const kw of run.keywords || []) {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      }
    }
    const topKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));

    // Hourly activity (last 24h)
    const hourly = new Array(24).fill(0);
    for (const run of allRuns) {
      if (run.createdAt > dayAgo) {
        const hourIdx = 23 - Math.floor((now - run.createdAt) / (60 * 60 * 1000));
        if (hourIdx >= 0 && hourIdx < 24) {
          hourly[hourIdx]++;
        }
      }
    }
    const hourlyLabels = hourly.map((_, i) => {
      const d = new Date(now - (23 - i) * 60 * 60 * 1000);
      return d.getHours() + ":00";
    });

    // Success rate
    const successRate = allRuns.length > 0
      ? Math.round((completedRuns / allRuns.length) * 100)
      : 0;

    return NextResponse.json({
      research: {
        total: allRuns.length,
        completed: completedRuns,
        failed: failedRuns,
        running: runningRuns,
        avgDurationMs: avgDuration,
        today: runsToday,
        thisWeek: runsThisWeek,
        successRate,
      },
      shares: {
        total: shareStats.total,
        active: shareStats.active,
        totalViews: shareStats.totalViews,
      },
      alerts: {
        active: criticalAlerts + warningAlerts,
        critical: criticalAlerts,
        warning: warningAlerts,
      },
      topKeywords,
      hourlyActivity: {
        labels: hourlyLabels,
        values: hourly,
      },
      storage: storageInfo,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
