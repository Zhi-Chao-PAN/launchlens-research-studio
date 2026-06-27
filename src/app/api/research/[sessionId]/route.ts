import { NextResponse, NextRequest } from "next/server";
import { getResearchSession, deleteSession } from "@/lib/research/research-engine";
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
    return jsonErrorLocalized(
      request,
      "errors.notFound",
      404,
      undefined,
      { sessionId },
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
