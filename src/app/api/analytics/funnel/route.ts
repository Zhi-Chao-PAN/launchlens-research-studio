import { NextRequest, NextResponse } from "next/server";

import { summarizeResearchFunnel } from "@/lib/research/funnel-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const days = Number.parseInt(
    request.nextUrl.searchParams.get("days") ?? "30",
    10,
  );
  const summary = await summarizeResearchFunnel(days);

  return NextResponse.json(summary, {
    headers: { "cache-control": "no-store" },
  });
}
