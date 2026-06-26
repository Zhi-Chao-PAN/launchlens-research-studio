import { NextResponse, type NextRequest } from "next/server";
import { listResearchRuns } from "@/lib/research/storage";
import { createDataPackage } from "@/lib/research/data-import-export";
import { requireAdmin } from "@/lib/api/require-admin";

export const runtime = "nodejs";

/**
 * GET /api/data/export
 * Export all research runs as a data package JSON.
 * Client-side adds notes, folders, and templates to the package.
 *
 * R202: requires an admin-scope bearer token. Prior to R202 this endpoint
 * was completely unauthenticated and could be used to dump every run.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const runs = listResearchRuns(10000);

    const pkg = createDataPackage({
      runs,
    });

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
