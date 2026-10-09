import type {
  AgentId,
  AgentState,
  ResearchSession,
  ResearchEvent,
  AgentOutput,
} from "@/lib/schema/research-schema";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { selectProvider } from "@/lib/providers/provider-registry";
import { recordTelemetry } from "@/lib/telemetry/telemetry";
import { isOpen as breakerIsOpen, recordSuccess as breakerRecordSuccess, recordFailure as breakerRecordFailure } from "@/lib/utils/circuit-breaker";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { AGENT_PLAN_STEPS, SYNTHESIS_STEPS, STEP_PREFIX } from "@/lib/research/steps";

// In-memory session store for the research engine.
// In production this would be backed by a database with proper persistence.
// Sessions are evicted after SESSION_TTL_MS to prevent unbounded memory growth.
const sessions = new Map<string, ResearchSession>();
const sessionControllers = new Map<string, AbortController>();
const eventListeners = new Map<string, Set<(event: ResearchEvent) => void>>();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
let lastCleanup = 0;

function cleanupExpiredSessions(now: number = Date.now()): void {
  // Run cleanup at most once per minute
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [id, session] of sessions) {
    const updatedAt = new Date(session.updatedAt).getTime();
    if (now - updatedAt > SESSION_TTL_MS) {
      // Abort any in-flight provider calls for the expired session
      const ac = sessionControllers.get(id);
      if (ac) {
        ac.abort();
        sessionControllers.delete(id);
      }
      sessions.delete(id);
      eventListeners.delete(id);
    }
  }
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    progress: 0,
    currentStep: "step.waiting",
  };
}

export function createResearchSession(query: string, keywords: string[]): ResearchSession {
  cleanupExpiredSessions();
  const id = generateId();
  const now = new Date().toISOString();

  const agents: Record<string, AgentState> = {};
  const researchAgentIds: AgentId[] = [
    "market-sizer",
    "competitor-analyst",
    "pain-detective",
    "pricing-scout",
    "channel-scout",
  ];

  for (const agentId of researchAgentIds) {
    agents[agentId] = createInitialAgentState(agentId);
  }
  agents["synthesis"] = createInitialAgentState("synthesis");

  const session: ResearchSession = {
    id,
    query,
    keywords,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    agents: agents as ResearchSession["agents"],
    citations: [],
  };

  sessions.set(id, session);
  return session;
}

export function getResearchSession(id: string): ResearchSession | undefined {
  return sessions.get(id);
}

/**
 * Abort a running research session. If the session is currently running
 * agents, their in-flight provider calls will be cancelled via the session
 * AbortController and the runAgent catch blocks will mark them errored
 * (we never write "aborted" into session.status to avoid widening the type).
 *
 * Returns true if a running controller was signalled; false if the session
 * didn't exist or had already completed (no-op).
 */
export function abortResearchSession(id: string): boolean {
  const ac = sessionControllers.get(id);
  if (ac) {
    const session = sessions.get(id);
    if (session) {
      // Tag the session before aborting so runAgent's catch block can detect
      // this was a user-initiated cancellation (not a provider failure) and
      // record telemetry accordingly.
      (session as ResearchSession & { __cancelled?: boolean }).__cancelled = true;
    }
    ac.abort();
    sessionControllers.delete(id);
    return true;
  }
  return false;
}

function emitEvent(sessionId: string, event: ResearchEvent): void {
  const listeners = eventListeners.get(sessionId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error(`[research] listener for ${sessionId} threw:`, err);
    }
  }
}

function updateAgentState(
  session: ResearchSession,
  agentId: AgentId,
  updates: Partial<AgentState>,
): void {
  session.agents[agentId] = { ...session.agents[agentId], ...updates };
  session.updatedAt = new Date().toISOString();
}

// Simulate agent work progress with step-by-step updates.
// In a real implementation, this would call actual LLM + search tools.
async function runAgent(
  session: ResearchSession,
  agentId: AgentId,
  stepDelayMs: number = 400,
  signal?: AbortSignal,
): Promise<AgentOutput | undefined> {
  const steps = getAgentSteps(agentId);
  const t0 = Date.now();

  updateAgentState(session, agentId, {
    status: "running",
    startedAt: new Date().toISOString(),
    currentStep: steps[0],
    progress: 0,
  });

  emitEvent(session.id, {
    type: "status",
    agentId,
    timestamp: new Date().toISOString(),
    message: `${agentId} started`,
  });

  try {
    for (let i = 0; i < steps.length; i++) {
      // Cancellable sleep: resolve early if the user aborts (DELETE / reset).
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, stepDelayMs);
        const onAbort = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
      });
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

      const progress = Math.round(((i + 1) / steps.length) * 80);
      updateAgentState(session, agentId, {
        currentStep: steps[i],
        progress,
      });

      emitEvent(session.id, {
        type: "progress",
        agentId,
        timestamp: new Date().toISOString(),
        data: { step: steps[i], progress },
      });
    }

    // Generate final output
    const allOutputs = getCompletedAgentOutputs(session);
    const selected = selectProvider();
    // If the breaker is open for the selected provider, short-circuit to mock
    // for this attempt. We still record telemetry under the original id so
    // operators can see the breaker engaging. When short-circuited we do NOT
    // record breaker success/failure because we never actually called the
    // real provider.
    const breakerOpen = !selected.isMock && breakerIsOpen("provider:" + selected.id);
    const provider = breakerOpen ? mockResearchProvider : selected;
    let output: AgentOutput | undefined;
    let telemetryOk = true;
    let telemetryErr: string | undefined;
    try {
      output = await provider.generate(agentId, {
        query: session.query,
        keywords: session.keywords,
        upstream: allOutputs,
        signal,
        onProgress: (event) => {
          const overall = 80 + Math.round(event.fraction * 19);
          updateAgentState(session, agentId, {
            progress: Math.min(99, overall),
            currentStep: event.step || session.agents[agentId].currentStep,
          });
          emitEvent(session.id, {
            type: "progress",
            agentId,
            timestamp: new Date().toISOString(),
            data: {
              step: event.step || session.agents[agentId].currentStep,
              progress: Math.min(99, overall),
              partial: event.partial,
            },
          });
        },
      });
    } catch (e) {
      telemetryErr = e instanceof Error ? e.message : String(e);
      // Three abort cases:
      //  1. User-initiated cancellation (session.__cancelled flag set by
      //     abortResearchSession): bail out without writing mock output;
      //     record as cancelled (NOT a failure, so diagnostics failure rate
      //     stays honest).
      //  2. Per-provider timeouts / fetch aborts (AbortError without the
      //     __cancelled flag): fall through to mock fallback as before.
      //  3. Genuine provider error: fall through to mock fallback and
      //     breaker records a failure.
      const isUserCancel = !!((session as ResearchSession & { __cancelled?: boolean }).__cancelled);
      const isAbortErr = e instanceof Error && (e.name === "AbortError" || (e as any).code === 20);
      (session as any).__lastErrorWasAbort = isAbortErr;
      (session as any).__lastErrorWasCancel = isUserCancel;
      if (isUserCancel) {
        telemetryOk = false;
        // Don't clobber the agent with mock output; mark it errored and move
        // on so synthesis can still run if any upstream agents completed.
        updateAgentState(session, agentId, {
          status: "error",
          progress: 0,
          currentStep: "step.error",
          error: "Cancelled",
        });
      emitEvent(session.id, {
        type: "cancelled",
        agentId,
        timestamp: new Date().toISOString(),
        message: "Cancelled",
      });
      } else {
        telemetryOk = false;
        output = generateMockAgentOutput(agentId, session.query, session.keywords, allOutputs);
      }
    } finally {
      // Only record breaker outcomes when we actually invoked the real provider
      // (i.e. breaker was not open and we did not short-circuit to mock).
      // Otherwise we would close the breaker based on a mock result without
      // ever testing the real upstream.
      // Abort errors (user-initiated cancellation) do not count as failures.
      const errMsg = telemetryErr ?? "";
      const isUserCancel = !!((session as any).__lastErrorWasCancel);
      const isAbort =
        !!((session as any).__lastErrorWasAbort)
        || errMsg.includes("AbortError")
        || errMsg.includes("aborted")
        || errMsg.includes("The operation was aborted");
      if ((session as any).__lastErrorWasAbort) delete (session as any).__lastErrorWasAbort;
      if ((session as any).__lastErrorWasCancel) delete (session as any).__lastErrorWasCancel;
      // Breaker: don't penalize user cancellations.
      if (!selected.isMock && !breakerOpen && !isAbort && !isUserCancel) {
        if (telemetryOk) breakerRecordSuccess("provider:" + selected.id);
        else breakerRecordFailure("provider:" + selected.id);
      }
      recordTelemetry({
        ts: Date.now(),
        agentId,
        providerId: breakerOpen ? selected.id + "(breaker:open->mock)" : provider.id,
        durationMs: Date.now() - t0,
        ok: telemetryOk,
        error: isUserCancel ? undefined : telemetryErr,
        cancelled: isUserCancel || undefined,
      });
      // Stash for post-finally dispatch: we can't return inside finally without
      // overriding outer returns, so use a flag.
      (session as any).__agentCancelled = isUserCancel;
    }

    if ((session as any).__agentCancelled) {
      delete (session as any).__agentCancelled;
      return undefined;
    }

    // output is assigned in both the success (provider.generate result) and
    // non-cancel error (mock fallback) paths.
    const finalOutput = output!;

    // Merge citations
    for (const citation of finalOutput.citations) {
      if (!session.citations.find((c) => c.id === citation.id)) {
        session.citations.push(citation);
      }
    }

    updateAgentState(session, agentId, {
      status: "done",
      progress: 100,
      currentStep: "step.complete",
      completedAt: new Date().toISOString(),
      output: finalOutput,
    });

    emitEvent(session.id, {
      type: "output",
      agentId,
      timestamp: new Date().toISOString(),
      data: finalOutput,
    });

    return finalOutput;
  } catch (err) {
    // Catch-all for plan-step setTimeout aborts, emitEvent failures, etc.
    // If this is a user cancellation, record it as such and bail without
    // throwing (let Promise.all resolve cleanly above).
    const isUserCancel = !!((session as ResearchSession & { __cancelled?: boolean }).__cancelled);
    if (isUserCancel) {
      recordTelemetry({
        ts: Date.now(),
        agentId,
        providerId: "cancelled",
        durationMs: Date.now() - t0,
        ok: false,
        cancelled: true,
      });
      updateAgentState(session, agentId, {
        status: "error",
        progress: 0,
        currentStep: "step.error",
        error: "Cancelled",
      });
      emitEvent(session.id, {
        type: "cancelled",
        agentId,
        timestamp: new Date().toISOString(),
        message: "Cancelled",
      });
      return undefined;
    }
    const message = err instanceof Error ? err.message : String(err);
    updateAgentState(session, agentId, {
      status: "error",
      currentStep: "step.error",
      error: message,
    });
    emitEvent(session.id, {
      type: "error",
      agentId,
      timestamp: new Date().toISOString(),
      message,
    });
    throw err;
  }
}

function getAgentSteps(agentId: AgentId): string[] {
  // All plan steps are stored as "step.<key>" dictionary keys so the UI can
  // render them in the active locale. Legacy English literals are still
  // accepted via stepKeyFor()'s LEGACY_STEP_MAP (see steps.ts) — no need to
  // keep duplicate English strings here.
  if (agentId === "synthesis") {
    return SYNTHESIS_STEPS.map((k) => STEP_PREFIX + k);
  }
  return AGENT_PLAN_STEPS[agentId].map((k) => STEP_PREFIX + k);
}

function getCompletedAgentOutputs(session: ResearchSession): AgentOutput[] {
  const outputs: AgentOutput[] = [];
  for (const agentId of Object.keys(session.agents) as AgentId[]) {
    const state = session.agents[agentId];
    if (state.status === "done" && state.output) {
      outputs.push(state.output);
    }
  }
  return outputs;
}

export async function runResearchSession(
  sessionId: string,
  options?: { speedMultiplier?: number },
): Promise<ResearchSession> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.status === "running") {
    return session; // already running
  }

  session.status = "running";
  session.updatedAt = new Date().toISOString();

  // Create an AbortController for this session so in-flight provider HTTP
  // requests can be cancelled if the session is evicted or the server shuts
  // down. Propagated into provider.generate via ProviderContext.signal.
  const ac = new AbortController();
  sessionControllers.set(sessionId, ac);

  const stepDelay = 300 / (options?.speedMultiplier || 1);

  // Run research agents in parallel. A single agent failure should not stop
  // the rest; we collect all results and report the failure via the session
  // status.
  const researchAgentIds: AgentId[] = [
    "market-sizer",
    "competitor-analyst",
    "pain-detective",
    "pricing-scout",
    "channel-scout",
  ];

  const results = await Promise.all(
    researchAgentIds.map(async (agentId) => {
      try {
        return await runAgent(session, agentId, stepDelay, ac.signal);
      } catch (err) {
        // Genuine (non-cancel) error. runAgent already updated agent state
        // + emitted an "error" event; we just need to not let Promise.all
        // reject. Return null as sentinel; these are counted below.
        return null;
      }
    }),
  );

  // runAgent returns:
  //   - an AgentOutput: success (real or mock-fallback)
  //   - undefined:      user-cancelled
  //   - null:           genuine failure (caught above)
  const failedAgents = results
    .map((out, i) => ({ agentId: researchAgentIds[i], out }))
    .filter((x) => x.out === null);

  if (failedAgents.length > 0) {
    console.error(
      `[research] session ${sessionId}: ${failedAgents.length} agent(s) failed`,
      failedAgents.map((f) => f.agentId),
    );
  }

  // Count agents that actually produced output (success OR mock fallback).
  // Cancelled agents (undefined) are excluded from both numerator and
  // denominator so synthesis can still run if enough work remains.
  const completed = results.filter((r) => r !== undefined && r !== null).length;
  if (completed >= 3) {
    try {
      await runAgent(session, "synthesis", stepDelay, ac.signal);
    } catch (err) {
      console.error(`[research] synthesis failed for ${sessionId}:`, err);
    }
  } else {
    updateAgentState(session, "synthesis", {
      status: "error",
      currentStep: "step.skipped",
    });
  }

  // Clean up AbortController after completion
  sessionControllers.delete(sessionId);

  session.status = "completed";
  session.updatedAt = new Date().toISOString();

  emitEvent(session.id, {
    type: "complete",
    agentId: "synthesis",
    timestamp: new Date().toISOString(),
    message: "Research complete",
  });

  return session;
}

// Event stream subscription for SSE.
// Multiple listeners can subscribe to the same session (e.g. for reconnection
// races). The returned unsubscribe function removes only this listener.
export function subscribeToSession(
  sessionId: string,
  listener: (event: ResearchEvent) => void,
): () => void {
  let set = eventListeners.get(sessionId);
  if (!set) {
    set = new Set();
    eventListeners.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    const s = eventListeners.get(sessionId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) eventListeners.delete(sessionId);
  };
}

// For testing: list all sessions
export function listSessions(): string[] {
  return Array.from(sessions.keys());
}
