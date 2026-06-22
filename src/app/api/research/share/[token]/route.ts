import { NextResponse, NextRequest } from "next/server";
import { getSharedRun } from "@/lib/research/share-tokens";
import { jsonErrorLocalized } from "@/lib/api/validation";

// Public endpoint: view a shared research run
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = getSharedRun(token);

  if (!result) {
    return jsonErrorLocalized(request, "errors.notFound", 404);
  }

  const { run, share } = result;

  return NextResponse.json({
    run: {
      id: run.id,
      query: run.query,
      keywords: run.keywords,
      result: run.result,
      sources: run.sources,
      provider: run.provider,
      model: run.model,
      createdAt: run.createdAt,
      durationMs: run.durationMs,
      status: run.status,
    },
    share: {
      token: share.token,
      views: share.views,
      maxViews: share.maxViews,
      expiresAt: share.expiresAt,
    },
  });
}
