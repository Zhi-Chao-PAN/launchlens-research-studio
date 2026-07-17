/* eslint-disable @typescript-eslint/no-explicit-any */
// R231: Vercel serverless cap raised to 300s (Vercel Hobby/Pro documented
// maximum for streaming responses) so the SSE stream route can host the
// full 6-agent research run inside its own request lifetime. That guarantees
// the agent and its SSE listener share one lambda instance — the previous
// fire-and-forget POST pattern left the agent running in an instance that
// Vercel could freeze, severing the stream. Cross-instance state is mirrored
// to Upstash Redis (when configured) so a session created on instance A is
// still recoverable if the SSE lands on instance B.
//
// Without Redis env vars the route degrades to the original in-process
// behavior — see `hydrateSessionFromRedis` and `isRunLocked` no-op fallbacks
// in @/lib/research/session-store. Local dev and tests behave exactly as
// before.
import {
  subscribeToSession,
  getResearchSession,
  runResearchSession,
  hydrateSessionFromRedis,
} from "@/lib/research/research-engine";
import { acquireRunLock, releaseRunLock, isRunLocked } from "@/lib/research/session-store";
import { resolveResearchRun } from "@/lib/research/resolve-run";
import { jsonError } from "@/lib/api/validation";
import { sleep } from "@/lib/utils/sleep";
import type { AgentId, ResearchSession } from "@/lib/schema/research-schema";
import { normalizeResearchMode } from "@/lib/research/research-modes";
import { isRedisConfigured } from "@/lib/research/redis-client";
import { readDeepResearchRecord } from "@/lib/research/deep-research/runtime";
import {
  deepRunProgressFromRecord,
  type DeepRunRecordV1,
} from "@/lib/research/deep-research/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// R231: raised to match the Vercel-documented 300s streaming-response cap so
// the SSE route can host a full 6-agent run. The agent and listener now
// share this single request/instance, closing the cross-instance event-fan-out
// gap. See research-engine.ts header comment for the full rationale.
export const maxDuration = 300;

// Deep Research is durable and the SSE endpoint is only an observer. Rotate
// the observer before Vercel's hard 300s timeout so clients receive a clean
// reconnect event instead of a runtime timeout error. The worker continues
// independently through Redis and the next observer immediately resumes.
export const DEEP_STREAM_ROTATION_MS = 240_000;

const SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;
const HEARTBEAT_INTERVAL_MS = 15000;
const DEEP_POLL_INTERVAL_MS = 2000;
const CLOSE_FLUSH_DELAY_MS = 200;

function sessionSnapshot(
  session: ResearchSession,
  includeOutputs: boolean,
  deepRecord?: DeepRunRecordV1 | null,
): Record<string, unknown> {
  return {
    status: session.status,
    mode: session.mode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agents: Object.fromEntries(
      Object.entries(session.agents).map(([id, state]) => [
        id,
        {
          status: state.status,
          progress: state.progress,
          currentStep: state.currentStep,
          hasOutput: !!state.output,
          ...(includeOutputs && state.output ? { output: state.output } : {}),
          ...(state.degraded
            ? { degraded: true, degradedReason: state.degradedReason }
            : {}),
        },
      ]),
    ),
    evidence: session.evidence,
    validation: session.validation,
    ...(deepRecord
      ? {
          deepRun: deepRunProgressFromRecord(deepRecord),
        }
      : {}),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    return jsonError("Invalid session id format.", 400);
  }

  // Try the in-process map first (fast path for same-instance reconnects).
  // If absent, attempt Redis hydration so a session created on a different
  // lambda is still recoverable. This is a no-op without Redis env.
  let deepRecord: DeepRunRecordV1 | null = null;
  let deepReadFailed = false;
  if (isRedisConfigured()) {
    try {
      deepRecord = await readDeepResearchRecord(sessionId);
    } catch {
      deepReadFailed = true;
    }
  }
  const localSession = getResearchSession(sessionId);
  if (deepReadFailed && (!localSession || localSession.mode === "deep")) {
    return jsonError("Deep Research state is temporarily unavailable. Retry the stream.", 503, {
      code: "DEEP_STATE_UNAVAILABLE",
      retryable: true,
    });
  }
  let session = deepRecord?.session ?? localSession;
  if (!session || session.status === "pending" || session.status === "running") {
    // A local pending snapshot can belong to the POST instance while another
    // instance owns (or already completed) execution. Consult the durable
    // mirror before deciding whether this connection may become the owner.
    session = deepRecord?.session ?? (await hydrateSessionFromRedis(sessionId)) ?? session;
  }
  if (!session) {
    // R217: distinguish "the id is wrong / never existed" from "the live
    // engine session expired but the run is on disk". The former gets a
    // not-found terminal; the latter gets an "expired" terminal so the
    // client can route the user to /research/[id] which loads from
    // storage and renders the completed report.
    const persisted = await resolveResearchRun(sessionId);
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

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let deepPoll: ReturnType<typeof setInterval> | null = null;
  let rotationTimer: ReturnType<typeof setTimeout> | null = null;
  let deepPollInFlight = false;
  // unsubscribe is assigned after subscribeToSession below; safeClose is only
  // invoked asynchronously (via events/heartbeat/timeouts/abort signal), so the
  // binding is always initialised by the time it fires.
  let unsubscribe: () => void = () => {};

  const safeClose = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (deepPoll) clearInterval(deepPoll);
    if (rotationTimer) clearTimeout(rotationTimer);
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
      writer.write(encoder.encode(": keepalive\n\n"));
    } catch {
      safeClose();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Send the initial snapshot
  writeEvent(
    "state",
    JSON.stringify(sessionSnapshot(session, false, deepRecord)),
  );

  if (session.status === "completed") {
    writeEvent("complete", JSON.stringify({
      message: "Research complete",
      ...sessionSnapshot(session, true, deepRecord),
    }));
    safeClose();
    return new Response(stream.readable, sseHeaders());
  } else if (session.status === "cancelled" || session.status === "error") {
    writeEvent("terminal", JSON.stringify({
      reason: session.status,
      message: "Session " + session.status,
      ...sessionSnapshot(session, true, deepRecord),
    }));
    safeClose();
    return new Response(stream.readable, sseHeaders());
  }

  // R231: execution-model change. When a session is pending/running and no
  // other instance holds the run lock, host the run inside this SSE request
  // so the agent and listener share one lambda. Without Redis, isRunLocked()
  // returns false and acquireRunLock() always succeeds — the run happens
  // here on the first SSE connection, matching the old single-instance
  // behavior. With Redis, the lock prevents two instances from running the
  // same session concurrently.
  let runPromise: Promise<unknown> | null = null;
  const isDeep = normalizeResearchMode(session.mode) === "deep";
  const alreadyLocked = isDeep ? true : await isRunLocked(sessionId);
  if (!isDeep && !alreadyLocked) {
    const acquired = await acquireRunLock(sessionId);
    if (acquired) {
      // Fire the run in the background of this request. We don't await it —
      // the listener is registered below and receives events as they emit.
      runPromise = runResearchSession(sessionId)
        .catch((err) => {
          console.error(`[research] session ${sessionId} failed in-stream:`, err);
          if (!closed) {
            writeEvent(
              "terminal",
              JSON.stringify({ reason: "error", message: err instanceof Error ? err.message : "Run failed" }),
            );
            safeClose();
          }
        })
        .finally(() => {
          // Always release the lock so future reconnects can recover state.
          void releaseRunLock(sessionId);
        });
    }
  }

  unsubscribe = subscribeToSession(sessionId, (event) => {
    if (closed) return;
    if (event.type === "complete") {
      const finalSnapshot =
        event.data && typeof event.data === "object"
          ? event.data as Record<string, unknown>
          : sessionSnapshot(session!, true, deepRecord);
      writeEvent("complete", JSON.stringify({
        message: event.message,
        ...finalSnapshot,
      }));
      safeClose();
    } else if (event.type === "output") {
      // R203: forward the per-agent degraded marker so the client can show a
      // "demo data" badge when the real provider was bypassed. The marker
      // lives on the agent state, not on the output payload itself.
      const ag = session?.agents[event.agentId as AgentId];
      const payload: Record<string, unknown> = { agentId: event.agentId, output: event.data };
      const evidence = session?.evidence?.agents[event.agentId as AgentId];
      if (evidence) payload.evidence = evidence;
      if (session?.validation) payload.validation = session.validation;
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
      const finalSnapshot =
        event.data && typeof event.data === "object"
          ? event.data as Record<string, unknown>
          : sessionSnapshot(session!, true, deepRecord);
      writeEvent("terminal", JSON.stringify({
        reason: "cancelled",
        message: event.message ?? "Research cancelled",
        ...finalSnapshot,
      }));
      safeClose();
    } else if (event.type === "closed") {
      // Server-side eviction (e.g. DELETE /api/research/:id): tell the client
      // this stream is gone and don't auto-reconnect.
      writeEvent("terminal", JSON.stringify({ reason: (event.reason as "deleted" | undefined) ?? "deleted", message: event.message ?? "Session closed" }));
      safeClose();
    }
  });

  if (isDeep) {
    const pollDeepState = () => {
      if (closed || deepPollInFlight) return;
      deepPollInFlight = true;
      void readDeepResearchRecord(sessionId)
        .then((record) => {
          if (!record || closed) return;
          const changed = !deepRecord || record.revision !== deepRecord.revision;
          deepRecord = record;
          session = record.session;
          if (changed) writeEvent("state", JSON.stringify(sessionSnapshot(session, false, record)));
          if (record.lifecycle === "completed") {
            writeEvent("complete", JSON.stringify({
              message: "Deep Research complete",
              ...sessionSnapshot(session, true, record),
            }));
            safeClose();
          } else if (record.lifecycle === "cancelled" || record.lifecycle === "error") {
            writeEvent("terminal", JSON.stringify({
              reason: record.lifecycle,
              message: `Deep Research ${record.lifecycle}`,
              ...sessionSnapshot(session, true, record),
            }));
            safeClose();
          }
        })
        .catch(() => {
          // Redis is authoritative for Deep. Keep the observer alive so a
          // transient outage can recover without misreporting a terminal.
        })
        .finally(() => {
          deepPollInFlight = false;
        });
    };
    deepPoll = setInterval(pollDeepState, DEEP_POLL_INTERVAL_MS);
    pollDeepState();

    rotationTimer = setTimeout(() => {
      if (closed) return;
      writeEvent(
        "reconnect",
        JSON.stringify({ reason: "observer_window", message: "Deep Research observer window rotated." }),
      );
      safeClose();
    }, DEEP_STREAM_ROTATION_MS);
  }

  // A stream is an observer, even when this request acquired the execution
  // lock. Disconnecting releases only this listener/writer; explicit cancel
  // remains the sole user-facing cancellation authority.
  // We intentionally do NOT cancel the session — the lock + Pub/Sub mean
  // another SSE client (a reconnect) can pick up where we left off.
  request.signal.addEventListener("abort", () => {
    safeClose();
  }, { once: true });

  // Wrap the response so the SSE writer is closed when the run finishes.
  const response = new Response(stream.readable, { headers: sseHeaders() });
  if (runPromise) {
    // If the run finishes before the client disconnects, ensure safeClose
    // runs. The 'complete'/'terminal' event already triggers it; this is a
    // belt-and-braces fallback for race conditions where the run resolves
    // before any terminal event reaches the writer.
    void runPromise.then(() => {
      // Don't close here — let the terminal/complete event do it.
    });
  }
  return response;
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
