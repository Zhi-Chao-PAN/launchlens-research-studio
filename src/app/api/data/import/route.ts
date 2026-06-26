import { NextResponse, type NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { validateDataPackage, importDataPackage, type DataPackage } from "@/lib/research/data-import-export";
import { listResearchRuns, bulkImportRuns } from "@/lib/research/storage";
import { requireAdmin } from "@/lib/api/require-admin";

export const runtime = "nodejs";

/**
 * POST /api/data/import
 * Import research runs from a data package.
 * Body: full DataPackage JSON (only runs are processed server-side)
 * Query: ?strategy=merge|overwrite|skip (default: merge)
 *
 * R202: requires an admin-scope bearer token and a valid CSRF token.
 * Prior to R202 this endpoint was unauthenticated and could overwrite
 * the entire store.
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  try {
    const url = new URL(request.url);
    const strategyParam = url.searchParams.get("strategy") || "merge";
    const strategy = ["merge", "overwrite", "skip"].includes(strategyParam)
      ? (strategyParam as "merge" | "overwrite" | "skip")
      : "merge";

    let pkg: DataPackage;
    try {
      pkg = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const errors = validateDataPackage(pkg);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Invalid package", errors },
        { status: 400 },
      );
    }

    const existingRuns = listResearchRuns(10000);
    const result = importDataPackage(
      { runs: existingRuns },
      pkg,
      { strategy, includeRuns: true, includeNotes: false, includeFolders: false, includeTemplates: false },
    );

    // Persist runs
    bulkImportRuns(result.runs);

    return rotateCsrf(
      NextResponse.json({
        imported: result.result.imported.runs,
        skipped: result.result.skipped.runs,
        total: result.runs.length,
        errors: result.result.errors,
      }),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
