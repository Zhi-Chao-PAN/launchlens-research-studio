import { NextResponse, NextRequest } from "next/server";
import { getResearchSession, hydrateSessionFromRedis } from "@/lib/research/research-engine";
import { getResearchRun } from "@/lib/research/storage";
import { toLaunchLensBrief, serializeBrief } from "@/lib/export/brief-mapper";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { recordResearchFunnelEvent } from "@/lib/research/funnel-analytics";
import { isRedisConfigured } from "@/lib/research/redis-client";
import { readDeepResearchRecord } from "@/lib/research/deep-research/runtime";

// GET /api/research/[sessionId]/brief
// Returns a structured, importable LaunchLens brief derived from the completed
// session's agent outputs. Downstream (launchlens-ai) consumes the five-field
// `input` object; the envelope carries provenance + version for safe import.
const SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "sessionId",
    });
  }

  // Try the in-process map first; hydrate from Redis so a completed session
  // is exportable even when this GET lands on a different instance than the
  // one that ran it (same cross-instance pattern as [sessionId]/route.ts).
  // Reconcile with Redis even when this instance has a local creation
  // snapshot; the completed run may have advanced on the SSE instance.
  let deepRecord = null;
  if (isRedisConfigured()) {
    try {
      deepRecord = await readDeepResearchRecord(sessionId);
    } catch {
      // Standard research can still recover through the legacy session mirror.
      // Deep's live/report routes remain fail-closed at their authoritative seam.
    }
  }
  const session =
    deepRecord?.session ??
    (await hydrateSessionFromRedis(sessionId)) ??
    getResearchSession(sessionId);
  if (!session) {
    // Mirror [sessionId]/route.ts: distinguish an evicted live session (the
    // completed run is still on disk) from a true not-found.
    const persisted = getResearchRun(sessionId);
    return jsonErrorLocalized(
      request,
      persisted ? "errors.sessionExpired" : "errors.notFound",
      persisted ? 410 : 404,
      undefined,
      { sessionId, persistedRunId: persisted?.id },
    );
  }

  if (session.status !== "completed") {
    return jsonErrorLocalized(
      request,
      "errors.reportNotCompleted",
      409,
      undefined,
      { sessionId, status: session.status },
    );
  }

  const brief = toLaunchLensBrief(session);
  await recordResearchFunnelEvent("brief_exported", session.id, {
    mode: session.mode,
    stage2: session.stage2Tracking,
  });

  // Allow ?raw=1 to get the compact JSON string body (handy for curl pipes);
  // default returns the parsed envelope as a JSON object.
  const raw = request.nextUrl.searchParams.get("raw");
  if (raw === "1") {
    return new NextResponse(serializeBrief(brief, false), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  return NextResponse.json(brief, { headers: { "cache-control": "no-store" } });
}
