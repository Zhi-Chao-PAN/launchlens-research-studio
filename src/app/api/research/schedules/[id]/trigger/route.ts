import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import type { NextRequest } from "next/server";
import { triggerScheduleNow } from "@/lib/research/scheduler";

// POST /api/research/schedules/[id]/trigger - manually trigger a schedule run
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfRejection = verifyCsrf(_request);
  if (csrfRejection) return csrfRejection;
  const ip = (_request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 10, refillIntervalMs: 60000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }


  try {
    const { id } = await params;
    const result = await triggerScheduleNow(id);

    if (!result) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    return NextResponse.json(
      { batchId: result.batchId, triggered: true },
      { status: 202 },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}