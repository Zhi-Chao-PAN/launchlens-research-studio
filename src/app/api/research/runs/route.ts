import { NextResponse } from "next/server";
import { listResearchRuns, getResearchStorageInfo } from "@/lib/research/storage";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";

// Public list endpoint — returns recent runs (no full content)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  
  const runs = listResearchRuns(limit);
  
  // Return summary (no full result text) for the list view
  const summaries = runs.map((r) => ({
    id: r.id,
    query: r.query,
    keywords: r.keywords,
    status: r.status,
    provider: r.provider,
    model: r.model,
    createdAt: r.createdAt,
    durationMs: r.durationMs,
    hasSources: !!(r.sources && r.sources.length > 0),
  }));

  const info = getResearchStorageInfo();
  
  return NextResponse.json({
    runs: summaries,
    total: summaries.length,
    storage: {
      enabled: info.enabled,
      inMemoryCount: info.inMemoryCount,
      maxMemoryRuns: info.maxMemoryRuns,
    },
  });
}
