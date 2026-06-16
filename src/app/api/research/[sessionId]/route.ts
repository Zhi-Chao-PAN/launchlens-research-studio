import { NextResponse } from "next/server";
import { getResearchSession } from "@/lib/research/research-engine";
import { jsonError } from "@/lib/api/validation";

const SESSION_ID_PATTERN = /^[a-z0-9]+$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonError("Invalid session id format.", 400);
  }

  const session = getResearchSession(sessionId);
  if (!session) {
    return jsonError("Session not found. It may have expired (sessions are in-memory and lost on server restart).", 404, {
      sessionId,
    });
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
