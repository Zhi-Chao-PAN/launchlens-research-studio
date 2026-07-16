import { NextRequest, NextResponse } from "next/server";

import { verifyCsrf } from "@/lib/api/csrf-guard";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { requireAdmin } from "@/lib/api/require-admin";
import {
  recordResearchFunnelEvent,
  RESEARCH_FUNNEL_EVENTS,
  summarizeResearchFunnel,
  type ResearchFunnelMode,
} from "@/lib/research/funnel-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  const days = Number.parseInt(
    request.nextUrl.searchParams.get("days") ?? "30",
    10,
  );
  const summary = await summarizeResearchFunnel(days);

  return NextResponse.json(summary, {
    headers: { "cache-control": "no-store" },
  });
}

const JOURNEY_ID_PATTERN = /^[a-zA-Z0-9._:-]{16,128}$/;

export async function POST(request: NextRequest) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rateLimit = checkRateLimitForIp(ip, { capacity: 60, refillIntervalMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rateLimit.resetMs },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil(rateLimit.resetMs / 1000))) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = body.event;
  const journeyId = body.journeyId;
  const mode = body.mode;
  if (
    typeof event !== "string" ||
    !(RESEARCH_FUNNEL_EVENTS as readonly string[]).includes(event) ||
    typeof journeyId !== "string" ||
    !JOURNEY_ID_PATTERN.test(journeyId)
  ) {
    return NextResponse.json({ error: "invalid_funnel_event" }, { status: 400 });
  }
  if (mode !== undefined && mode !== "standard" && mode !== "deep") {
    return NextResponse.json({ error: "invalid_funnel_mode" }, { status: 400 });
  }

  const recorded = await recordResearchFunnelEvent(event as typeof RESEARCH_FUNNEL_EVENTS[number], journeyId, {
    mode: mode as ResearchFunnelMode | undefined,
  });
  return NextResponse.json(
    { recorded },
    { status: 202, headers: { "cache-control": "no-store" } },
  );
}
