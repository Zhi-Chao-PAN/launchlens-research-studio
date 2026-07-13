import { NextResponse, type NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { getResearchStorageInfo, searchResearchRuns, exportRuns, bulkDeleteRuns } from "@/lib/research/storage";
import {
  deletePersistentResearchRuns,
  searchPersistentResearchRuns,
  type ResearchRunSummary,
} from "@/lib/research/run-store";
import { requireAdmin } from "@/lib/api/require-admin";

// List/search/export runs. Every collection read is admin-only: same-origin
// and CSRF controls do not authenticate the caller and therefore cannot
// prevent an anonymous client from enumerating queries and run identifiers.
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format");

  if (format === "json" || format === "csv" || format === "jsonl") {
    const exported = exportRuns(format);
    const contentType = format === "csv" ? "text/csv" : "application/json";
    return new Response(exported, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="research-runs.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const q = url.searchParams.get("q") || "";
  const statusFilter = url.searchParams.get("status") as
    | "completed"
    | "failed"
    | "cancelled"
    | null;
  const providerFilter = url.searchParams.get("provider");
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  // Search/filter. Local storage remains the fast/dev path; Redis-backed
  // persistent runs are merged in for Vercel production where local memory and
  // disk are not reliable across lambda instances.
  const localResult = searchResearchRuns({
    query: q || undefined,
    status: statusFilter || undefined,
    provider: providerFilter || undefined,
    limit: 100,
    offset: 0,
  });
  const persistentResult = await searchPersistentResearchRuns({
    query: q || undefined,
    status: statusFilter || undefined,
    provider: providerFilter || undefined,
    limit: 100,
    offset: 0,
  });
  const byId = new Map<string, ResearchRunSummary>();
  for (const run of persistentResult.runs) {
    const legacyRun = run as ResearchRunSummary & { sources?: unknown[] };
    byId.set(run.id, {
      id: run.id,
      query: run.query,
      keywords: run.keywords,
      status: run.status,
      provider: run.provider,
      model: run.model,
      createdAt: run.createdAt,
      durationMs: run.durationMs,
      hasSources: typeof run.hasSources === "boolean"
        ? run.hasSources
        : Boolean(legacyRun.sources?.length),
    });
  }
  for (const run of localResult.runs) {
    byId.set(run.id, {
      id: run.id,
      query: run.query,
      keywords: run.keywords,
      status: run.status,
      provider: run.provider,
      model: run.model,
      createdAt: run.createdAt,
      durationMs: run.durationMs,
      hasSources: Boolean(run.sources?.length),
    });
  }
  const mergedRuns = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  const pagedRuns = mergedRuns.slice(offset, offset + limit);

  // Return summaries
  const summaries = pagedRuns;

  const info = getResearchStorageInfo();

  return NextResponse.json(
    {
      runs: summaries,
      total: mergedRuns.length,
      offset,
      limit,
      storage: {
        enabled: info.enabled,
        inMemoryCount: info.inMemoryCount,
        maxMemoryRuns: info.maxMemoryRuns,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// Bulk delete. Both admin authorization and CSRF are required because this is
// a destructive browser-accessible operation.
export async function DELETE(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }


  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }

  const deleted = bulkDeleteRuns(ids);
  const persistentDeleted = await deletePersistentResearchRuns(ids);
  return rotateCsrf(NextResponse.json({ deleted: Math.max(deleted, persistentDeleted), total: ids.length }));
}
