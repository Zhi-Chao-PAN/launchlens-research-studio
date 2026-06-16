import { NextResponse } from "next/server";
import { getRecentTelemetry, summarizeTelemetry } from "@/lib/telemetry/telemetry";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || "50")));
  return NextResponse.json({
    summary: summarizeTelemetry(),
    recent: getRecentTelemetry(limit),
  });
}

export const runtime = "nodejs";
