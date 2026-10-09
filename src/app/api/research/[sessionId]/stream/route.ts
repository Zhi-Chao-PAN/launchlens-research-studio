/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { subscribeToSession, getResearchSession } from "@/lib/research/research-engine";
import { jsonError } from "@/lib/api/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_ID_PATTERN = /^[a-z0-9]+$/i;
const HEARTBEAT_INTERVAL_MS = 15000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonError("Invalid session id format.", 400);
  }

  const session = getResearchSession(sessionId);
  if (!session) {
    return jsonError("Session not found.", 404, { sessionId });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  // Initialize unsubscribe as a no-op so the early-return branch (already-
  // completed session) can safely call safeClose without TDZ ReferenceError.
  let unsubscribe: () => void = () => {};

  const safeClose = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    try { unsubscribe(); } catch { /* best effort */ }
    writer.close().catch(() => {});
  };

  const writeEvent = (event: string, data: string) => {
    if (closed) return;
    const encoded = encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
    // writer.write() returns a Promise. Attach .catch to prevent unhandled
    // rejections when the stream has already errored or the client disconnected.
    writer.write(encoded).catch(() => safeClose());
  };

  // Heartbeat keeps the connection alive through proxies.
  heartbeat = setInterval(() => {
    if (closed) return;
    writer.write(encoder.encode(`: keepalive\n\n`)).catch(() => safeClose());
  }, HEARTBEAT_INTERVAL_MS);

  // Send the initial snapshot
  writeEvent(
    "state",
    JSON.stringify({
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
    }),
  );

  if (session.status === "completed") {
    writeEvent("complete", JSON.stringify({ message: "Research complete" }));
    // Always attach the abort listener so safeClose runs on client disconnect
    request.signal.addEventListener("abort", safeClose);
    setTimeout(safeClose, 200);
    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  unsubscribe = subscribeToSession(sessionId, (event) => {
    if (closed) return;
    if (event.type === "complete") {
      writeEvent("complete", JSON.stringify({ message: event.message }));
      setTimeout(safeClose, 200);
    } else if (event.type === "output") {
      writeEvent("agent-output", JSON.stringify({ agentId: event.agentId, output: event.data }));
    } else if (event.type === "progress") {
      writeEvent("agent-progress", JSON.stringify({ agentId: event.agentId, ...((event.data as object) || {}) }));
    } else if (event.type === "status") {
      writeEvent("agent-status", JSON.stringify({ agentId: event.agentId, message: event.message }));
    } else if (event.type === "error") {
      writeEvent("agent-error", JSON.stringify({ agentId: event.agentId, message: event.message }));
    } else if (event.type === "cancelled") {
      writeEvent("agent-cancelled", JSON.stringify({ agentId: event.agentId }));
    }
  });

  request.signal.addEventListener("abort", safeClose);

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
