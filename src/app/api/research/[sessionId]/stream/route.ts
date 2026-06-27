/* eslint-disable @typescript-eslint/no-explicit-any */
import { subscribeToSession, getResearchSession } from "@/lib/research/research-engine";
import { getResearchRun } from "@/lib/research/storage";
import { jsonError } from "@/lib/api/validation";
import { sleep } from "@/lib/utils/sleep";
import type { AgentId } from "@/lib/schema/research-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_ID_PATTERN = /^[a-z0-9]+$/i;
const HEARTBEAT_INTERVAL_MS = 15000;
const CLOSE_FLUSH_DELAY_MS = 200;

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
    // R217: distinguish "the id is wrong / never existed" from "the live
    // engine session expired but the run is on disk". The former gets a
    // not-found terminal; the latter gets an "expired" terminal so the
    // client can route the user to /research/[id] which loads from
    // storage and renders the completed report.
    const persisted = getResearchRun(sessionId);
    const reason = persisted ? "expired" : "not-found";
    const message = persisted
      ? "Live engine session expired. The completed report is still available in History."
      : "Session not found.";
    const notFoundStream = new TransformStream();
    const nfw = notFoundStream.writable.getWriter();
    const nfe = new TextEncoder();
    nfw.write(nfe.encode("event: terminal\n"));
    nfw.write(nfe.encode("data: " + JSON.stringify({ reason, message, persistedRunId: persisted?.id }) + "\n\n"));
    nfw.close().catch(() => {});
    return new Response(notFoundStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  const ac = new AbortController();

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  // unsubscribe is assigned after subscribeToSession below; safeClose is only
  // invoked asynchronously (via events/heartbeat/timeouts/abort signal), so the
  // binding is always initialised by the time it fires.
  let unsubscribe: () => void = () => {};

  const safeClose = () => {
    if (closed) return;
    closed = true;
    ac.abort();
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
    // Give the client a tiny window to receive the final event bytes.
    sleep(CLOSE_FLUSH_DELAY_MS).finally(() => writer.close().catch(() => {}));
  };

  const writeEvent = (event: string, data: string) => {
    if (closed) return;
    try {
      writer.write(encoder.encode(`event: ${event}\n`));
      writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch {
      safeClose();
    }
  };

  // Heartbeat keeps the connection alive through proxies and helps detect disconnects.
  heartbeat = setInterval(() => {
    if (closed) return;
    try {
      writer.write(encoder.encode(`: keepalive\n\n`));
    } catch {
      safeClose();
    }
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
    safeClose();
    return new Response(stream.readable, sseHeaders());
  } else if (session.status === "cancelled" || session.status === "error") {
    writeEvent("terminal", JSON.stringify({ reason: session.status, message: "Session " + session.status }));
    safeClose();
    return new Response(stream.readable, sseHeaders());
  }

  unsubscribe = subscribeToSession(sessionId, (event) => {
    if (closed) return;
    if (event.type === "complete") {
      writeEvent("complete", JSON.stringify({ message: event.message }));
      safeClose();
    } else if (event.type === "output") {
      // R203: forward the per-agent degraded marker so the client can show a
      // "demo data" badge when the real provider was bypassed. The marker
      // lives on the agent state, not on the output payload itself.
      const ag = session?.agents[event.agentId as AgentId];
      const payload: Record<string, unknown> = { agentId: event.agentId, output: event.data };
      if (ag?.degraded) {
        payload.degraded = true;
        payload.degradedReason = ag.degradedReason;
      }
      writeEvent("agent-output", JSON.stringify(payload));
    } else if (event.type === "progress") {
      writeEvent("agent-progress", JSON.stringify({ agentId: event.agentId, ...((event.data as object) || {}) }));
    } else if (event.type === "status") {
      writeEvent("agent-status", JSON.stringify({ agentId: event.agentId, message: event.message }));
    } else if (event.type === "error") {
      writeEvent("agent-error", JSON.stringify({ agentId: event.agentId, message: event.message }));
    } else if (event.type === "cancelled") {
      writeEvent("terminal", JSON.stringify({ reason: "cancelled", message: event.message ?? "Research cancelled" }));
      safeClose();
    } else if (event.type === "closed") {
      // Server-side eviction (e.g. DELETE /api/research/:id): tell the client
      // this stream is gone and don't auto-reconnect.
      writeEvent("terminal", JSON.stringify({ reason: (event.reason as "deleted" | undefined) ?? "deleted", message: event.message ?? "Session closed" }));
      safeClose();
    }
  });

  request.signal.addEventListener("abort", safeClose, { once: true });

  return new Response(stream.readable, { headers: sseHeaders() });
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

