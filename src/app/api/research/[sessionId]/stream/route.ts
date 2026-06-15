import { NextResponse } from "next/server";
import { subscribeToSession, getResearchSession } from "@/lib/research/research-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  const session = getResearchSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  let closed = false;

  const writeEvent = (event: string, data: string) => {
    if (closed) return;
    writer.write(encoder.encode(`event: ${event}\n`));
    writer.write(encoder.encode(`data: ${data}\n\n`));
  };

  writeEvent("state", JSON.stringify({
    status: session.status,
    agents: Object.fromEntries(
      Object.entries(session.agents).map(([id, state]) => [
        id,
        {
          status: state.status,
          progress: state.progress,
          currentStep: state.currentStep,
          hasOutput: !!state.output,
        },
      ]),
    ),
  }));

  if (session.status === "completed") {
    writeEvent("complete", JSON.stringify({ message: "Research complete" }));
    setTimeout(() => {
      if (!closed) { closed = true; writer.close().catch(() => {}); }
    }, 100);
    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const unsubscribe = subscribeToSession(sessionId, (event) => {
    if (closed) return;
    if (event.type === "complete") {
      writeEvent("complete", JSON.stringify({ message: event.message }));
      setTimeout(() => {
        if (!closed) { closed = true; writer.close().catch(() => {}); }
      }, 200);
    } else if (event.type === "output") {
      writeEvent("agent-output", JSON.stringify({
        agentId: event.agentId,
        output: event.data,
      }));
    } else if (event.type === "progress") {
      writeEvent("agent-progress", JSON.stringify({
        agentId: event.agentId,
        ...(event.data as object),
      }));
    } else if (event.type === "status") {
      writeEvent("agent-status", JSON.stringify({
        agentId: event.agentId,
        message: event.message,
      }));
    }
  });

  request.signal.addEventListener("abort", () => {
    closed = true;
    unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
