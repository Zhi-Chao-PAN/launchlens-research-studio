import { NextResponse } from "next/server";
import { listResearchRuns } from "@/lib/research/storage";
import { createDataPackage, DATA_PACKAGE_SOURCE } from "@/lib/research/data-import-export";

export const runtime = "nodejs";

/**
 * GET /api/data/export
 * Export all research runs as a data package JSON.
 * Client-side adds notes, folders, and templates to the package.
 */
export async function GET() {
  try {
    const runs = listResearchRuns(10000);

    const pkg = createDataPackage({
      runs,
    });

    // Return as downloadable file
    return new NextResponse(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="launchlens-runs-${Date.now()}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 },
    );
  }
}