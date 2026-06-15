import { NextResponse } from "next/server";
import {
  createResearchSession,
  runResearchSession,
  getResearchSession,
} from "@/lib/research/research-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, keywords } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    const kw = Array.isArray(keywords) ? keywords : [];
    const session = createResearchSession(query.trim(), kw);

    // Start the research in the background
    // We don't await it so the client can connect to the stream
    runResearchSession(session.id).catch((err) => {
      console.error("Research session failed:", err);
    });

    return NextResponse.json(
      {
        sessionId: session.id,
        query: session.query,
        keywords: session.keywords,
        status: session.status,
        agents: Object.fromEntries(
          Object.entries(session.agents).map(([id, state]) => [
            id,
            { status: state.status, progress: state.progress, currentStep: state.currentStep },
          ]),
        ),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/research error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST to create a research session" },
    { status: 405 },
  );
}
