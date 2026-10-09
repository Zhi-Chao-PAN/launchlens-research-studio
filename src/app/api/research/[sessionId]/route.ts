import { NextResponse } from "next/server";
import { getResearchSession, abortResearchSession } from "@/lib/research/research-engine";
import { jsonError } from "@/lib/api/validation";
import { createServerI18n } from "@/lib/i18n/server-i18n";

const SESSION_ID_PATTERN = /^[a-z0-9]+$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const { t } = createServerI18n(request);

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonError(t("api.invalidSessionId", "Invalid session id format."), 400, undefined, "INVALID_SESSION_ID");
  }

  const session = getResearchSession(sessionId);
  if (!session) {
    return jsonError(t("api.sessionNotFound", "Session not found. It may have expired (sessions are in-memory and lost on server restart)."), 404, {
      sessionId,
    }, "SESSION_NOT_FOUND");
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

/**
 * DELETE /api/research/:sessionId
 * Aborts an in-progress research session (cancels any in-flight provider
 * HTTP requests for all agents). Safe to call on completed/non-existent
 * sessions — returns 204 with `aborted: false` in that case. Idempotent.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const { t } = createServerI18n(request);

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonError(t("api.invalidSessionId", "Invalid session id format."), 400, undefined, "INVALID_SESSION_ID");
  }

  const aborted = abortResearchSession(sessionId);
  return NextResponse.json(
    { ok: true, sessionId, aborted },
    { status: 200 },
  );
}
