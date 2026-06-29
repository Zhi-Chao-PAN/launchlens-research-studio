import { NextRequest, NextResponse } from "next/server";

import { stage2ContextFromSearchParams } from "@/lib/analytics/stage2-context";
import { summarizeResearchStage2Funnel } from "@/lib/research/funnel-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = stage2ContextFromSearchParams(request.nextUrl.searchParams);
  if (!context) {
    return NextResponse.json(
      {
        error:
          "Provide stage2Participant/participant and/or stage2Batch/batch.",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const days = Number.parseInt(
    request.nextUrl.searchParams.get("days") ?? "30",
    10,
  );
  const summary = await summarizeResearchStage2Funnel(context, days);

  return NextResponse.json(summary, {
    headers: { "cache-control": "no-store" },
  });
}
