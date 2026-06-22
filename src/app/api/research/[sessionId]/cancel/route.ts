import { NextResponse, NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { cancelSession, getResearchSession } from "@/lib/research/research-engine";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { jsonErrorLocalized } from "@/lib/api/validation";

// POST /api/research/[sessionId]/cancel - request cancellation of a running session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    const retrySeconds = Math.ceil(rl.resetMs / 1000);
    return jsonErrorLocalized(
      request,
      "errors.rateLimit",
      429,
      { seconds: String(retrySeconds) },
      { retryAfterMs: rl.resetMs, resetMs: rl.resetMs },
    );
  }

  const { sessionId } = await params;
  const existing = getResearchSession(sessionId);
  if (!existing) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { sessionId });
  }
  const ok = cancelSession(sessionId);
  return rotateCsrf(NextResponse.json({ ok, sessionId, status: "cancelled" }));
}
