import { NextResponse } from "next/server";
import { getResearchSession } from "@/lib/research/research-engine";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const session = getResearchSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
