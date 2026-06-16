import { NextResponse } from "next/server";
import { getRecentTelemetry, summarizeTelemetry } from "@/lib/telemetry/telemetry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));
  return NextResponse.json({
    summary: summarizeTelemetry(),
    breakers: snapshotBreakers(),
    recent: getRecentTelemetry(limit),
  });
}

export const runtime = "nodejs";
