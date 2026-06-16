import { NextResponse } from "next/server";
import { listResearchRuns, getResearchStorageInfo, searchResearchRuns, exportRuns, bulkDeleteRuns } from "@/lib/research/storage";
import { isBypassToken, extractBearerToken } from "@/lib/api/bypass-tokens";

// Public list endpoint — returns recent runs (no full content)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const q = url.searchParams.get("q") || "";
  const statusFilter = url.searchParams.get("status") as "completed" | "failed" | null;
  const providerFilter = url.searchParams.get("provider");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  // Export formats
  if (format === "json" || format === "csv" || format === "jsonl") {
    const exported = exportRuns(format);
    const contentType = format === "csv" ? "text/csv" : "application/json";
    return new Response(exported, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="research-runs.${format}"`,
      },
    });
  }

  // Search/filter
  const result = searchResearchRuns({
    query: q || undefined,
    status: statusFilter || undefined,
    provider: providerFilter || undefined,
    limit,
    offset,
  });

  // Return summaries
  const summaries = result.runs.map((r) => ({
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
    total: result.total,
    offset,
    limit,
    storage: {
      enabled: info.enabled,
      inMemoryCount: info.inMemoryCount,
      maxMemoryRuns: info.maxMemoryRuns,
    },
  });
}

// Bulk delete
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }

  const deleted = bulkDeleteRuns(ids);
  return NextResponse.json({ deleted, total: ids.length });
}
