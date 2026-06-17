import { NextResponse } from "next/server";
import { validateDataPackage, importDataPackage, type DataPackage } from "@/lib/research/data-import-export";
import { listResearchRuns, bulkImportRuns } from "@/lib/research/storage";

export const runtime = "nodejs";

/**
 * POST /api/data/import
 * Import research runs from a data package.
 * Body: full DataPackage JSON (only runs are processed server-side)
 * Query: ?strategy=merge|overwrite|skip (default: merge)
 */
export async function POST(request: Request) {
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

    return NextResponse.json({
      imported: result.result.imported.runs,
      skipped: result.result.skipped.runs,
      total: result.runs.length,
      errors: result.result.errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}