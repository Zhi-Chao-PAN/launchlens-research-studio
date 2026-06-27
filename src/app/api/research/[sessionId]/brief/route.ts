import { NextResponse, NextRequest } from "next/server";
import { getResearchSession } from "@/lib/research/research-engine";
import { getResearchRun } from "@/lib/research/storage";
import { toLaunchLensBrief, serializeBrief } from "@/lib/export/brief-mapper";
import { jsonErrorLocalized } from "@/lib/api/validation";

// GET /api/research/[sessionId]/brief
// Returns a structured, importable LaunchLens brief derived from the completed
// session's agent outputs. Downstream (launchlens-ai) consumes the five-field
// `input` object; the envelope carries provenance + version for safe import.
const SESSION_ID_PATTERN = /^[a-z0-9]+$/i;

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

  const session = getResearchSession(sessionId);
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

  const brief = toLaunchLensBrief(session);

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
