import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { cancelSession, getResearchSession } from "@/lib/research/research-engine";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";

// POST /api/research/[sessionId]/cancel - request cancellation of a running session
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }

  const { sessionId } = await params;
  const existing = getResearchSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const ok = cancelSession(sessionId);
  return rotateCsrf(NextResponse.json({ ok, sessionId, status: "cancelled" }));
}
