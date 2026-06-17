import { NextResponse } from "next/server";
import { getSharedRun } from "@/lib/research/share-tokens";

// Public endpoint: view a shared research run
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = getSharedRun(token);

  if (!result) {
    return NextResponse.json(
      { error: "Share not found or expired" },
      { status: 404 },
    );
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
