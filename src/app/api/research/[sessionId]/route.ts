import { NextResponse, NextRequest } from "next/server";
import { getResearchSession, deleteSession } from "@/lib/research/research-engine";
import { getResearchRun } from "@/lib/research/storage";
import { jsonErrorLocalized } from "@/lib/api/validation";

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
    // R217: distinguish "the live engine session was evicted" (the
    // completed run is still on disk and renderable) from a true
    // not-found. The client uses the `expired` reason to redirect the
    // user to /history instead of showing a generic 404.
    const persisted = getResearchRun(sessionId);
    return jsonErrorLocalized(
      request,
      persisted ? "errors.sessionExpired" : "errors.notFound",
      persisted ? 410 : 404,
      undefined,
      { sessionId, persistedRunId: persisted?.id },
    );
  }

  return NextResponse.json({
    id: session.id,
    query: session.query,
    keywords: session.keywords,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    agents: session.agents,
    citations: session.citations,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "sessionId",
    });
  }

  const existed = deleteSession(sessionId);
  if (!existed) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { sessionId });
  }
  return NextResponse.json({ ok: true, deleted: sessionId });
}
