import type {
  AgentId,
  AgentState,
  ResearchSession,
  ResearchEvent,
  AgentOutput,
} from "@/lib/schema/research-schema";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { applyPersona } from "@/lib/providers/mock-persona";
import { selectProvider } from "@/lib/providers/provider-registry";
import { recordTelemetry } from "@/lib/telemetry/telemetry";
import { isOpen as breakerIsOpen, recordSuccess as breakerRecordSuccess, recordFailure as breakerRecordFailure } from "@/lib/utils/circuit-breaker";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { saveResearchRun } from "@/lib/research/storage";
import { sleep } from "@/lib/utils/sleep";

// In-memory session store for the research engine.
// In production this would be backed by a database with proper persistence.
const sessions = new Map<string, ResearchSession>();
const cancelledSessions = new Set<string>();
const sessionAborts = new Map<string, AbortController>();
const eventListeners = new Map<string, Set<(event: ResearchEvent) => void>>();
const sseIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SSE_IDLE_GRACE_MS = 12000;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    progress: 0,
    currentStep: "Waiting to start...",
  };
}

export function createResearchSession(query: string, keywords: string[], personaId?: string): ResearchSession {
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

  for (const researchAgentId of researchAgentIds) {
    agents[researchAgentId] = createInitialAgentState(researchAgentId);
  }
  agents["synthesis"] = createInitialAgentState("synthesis");

  // R203: capture the actual provider at session creation. The previous
  // hardcoded "mock"/"mock-model" at saveResearchRun time made real-LLM
  // runs look like mock runs in history. We record the provider the run
  // is *attempting*; the per-call telemetry in runAgent still captures
  // the resolved provider when the breaker flips to mock.
  const provider = selectProvider();

  const session: ResearchSession = {
    id,
    query,
    keywords,
    // R203: the 3rd parameter is now properly named (was `agentId` which
    // shadowed the loop variable and was always undefined). The persona
    // flows from the API/batch path all the way to provider context.
    ...(personaId ? { personaId } : {}),
    // R203: record real provider so history is accurate.
    providerId: provider.id,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    agents: agents as ResearchSession["agents"],
    citations: [],
  };

  sessions.set(id, session);
  sessionAborts.set(id, new AbortController());
  return session;
}

export function getResearchSession(id: string): ResearchSession | undefined {
  return sessions.get(id);
}

export function cancelSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (session.status === "completed" || session.status === "error") return false;
  cancelledSessions.add(id);
  sessionAborts.get(id)?.abort();
  session.status = "cancelled";
  session.updatedAt = new Date().toISOString();

  // Quiesce per-agent state so that GET after cancel doesn't return agents
  // stuck at "running". Agents that already finished keep their done/error;
  // in-flight ones are returned to idle (AgentStatus has no "cancelled"
  // variant and we deliberately do NOT mark them as error — cancelling is a
  // user action, not a failure).
  for (const [aid, st] of Object.entries(session.agents)) {
    if (st.status === "running" || st.status === "idle") {
      session.agents[aid as AgentId] = {
        ...st,
        status: "idle",
        progress: 0,
        currentStep: "Cancelled",
      };
    }
  }

  // Single terminal event — do NOT emit an agent-error, otherwise cancelled
  // runs show up as red error badges on the synthesis card.
  emitEvent(id, { type: "cancelled", agentId: "synthesis", timestamp: new Date().toISOString(), message: "Research cancelled" });
  return true;
}

/** Hard-delete a session from the in-memory store. Aborts any running work
 *  and releases SSE listeners. Used by DELETE /api/research/:id so clients
 *  (and tests) can deterministically clean up. Returns true if the session
 *  existed. */
export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  // Emit a 'closed' terminal event *before* we tear listeners down so any
  // connected SSE streams can close their writers cleanly and signal the
  // client EventSource to stop retrying.
  emitEvent(id, {
    type: "closed",
    agentId: "synthesis",
    timestamp: new Date().toISOString(),
    reason: "deleted",
    message: "Session deleted",
  });
  // Cancel any in-flight agent work and tear down listeners before evicting.
  if (!cancelledSessions.has(id) && session.status !== "completed" && session.status !== "error") {
    cancelledSessions.add(id);
    sessionAborts.get(id)?.abort();
  }
  const listeners = eventListeners.get(id);
  if (listeners) listeners.clear();
  eventListeners.delete(id);
  const pending = sseIdleTimers.get(id);
  if (pending) { clearTimeout(pending); sseIdleTimers.delete(id); }
  sessionAborts.delete(id);
  cancelledSessions.delete(id);
  sessions.delete(id);
  return true;
}

function isCancelled(id: string): boolean { return cancelledSessions.has(id); }

function emitEvent(sessionId: string, event: ResearchEvent): void {
  const listeners = eventListeners.get(sessionId);
  if (!listeners) return;
  for (const l of Array.from(listeners)) {
    try { l(event); } catch (err) { console.error(`[research] listener for ${sessionId} threw:`, err); }
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
): Promise<AgentOutput> {
  const steps = getAgentSteps(agentId);

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
    const ac = sessionAborts.get(session.id);
    for (let i = 0; i < steps.length; i++) {
      await sleep(stepDelayMs, { signal: ac?.signal });

      if (isCancelled(session.id)) {
        throw new DOMException("Aborted", "AbortError");
      }

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
        // operators can see the breaker engaging.
        const breakerOpen = !selected.isMock && breakerIsOpen("provider:" + selected.id);
        const provider = breakerOpen ? mockResearchProvider : selected;
        // R203: track per-agent whether we resolved to the real provider or
        // fell back to mock (so the UI can show a "demo data" badge).
        // isDegradedHere is `let` because the catch block below can flip it
        // when a real provider call throws. R204: degradedReasonCaptured is
        // set by the provider's onFallback callback with a finer-grained
        // reason (http_error / validation_error / ...) than the R203 catch.
        const resolvedProviderId = provider.id;
        let isDegradedHere = provider.id !== selected.id;
        let degradedReasonCaptured: NonNullable<AgentState["degradedReason"]> | undefined;
        let output;
        const t0 = Date.now();
        let telemetryOk = true;
        let telemetryErr: string | undefined;
        try {
          const ac = sessionAborts.get(session.id);
          output = await provider.generate(agentId, {
            query: session.query,
            keywords: session.keywords,
            upstream: allOutputs,
            signal: ac?.signal,
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
            // R204: real providers (openai/anthropic) catch failures
            // internally and return mock output so a session always
            // completes — but they now invoke this callback with the
            // precise reason first. Without wiring it here, a bad key or
            // weak-model validation failure would surface as demo data
            // with no "demo" badge, leaving the user blind to the fact
            // that their real provider never actually ran. We flip
            // isDegradedHere and capture the reason; the resolvedProviderId
            // stays as the real provider's id (the call was attempted
            // against it) so history is accurate.
            onFallback: (reason) => {
              if (selected.isMock) return;
              isDegradedHere = true;
              degradedReasonCaptured = reason;
              telemetryOk = false;
              telemetryErr = "provider fallback: " + reason;
            },
          });
        } catch (e) {
          telemetryOk = false;
          telemetryErr = e instanceof Error ? e.message : String(e);
          output = applyPersona(generateMockAgentOutput(agentId, session.query, session.keywords, allOutputs), session.personaId);
          // R203: the real provider failed — flag the agent's output as
          // degraded so the UI can show a "demo data" badge.
          isDegradedHere = true;
        } finally {
          if (!selected.isMock) {
            if (telemetryOk) breakerRecordSuccess("provider:" + selected.id);
            else breakerRecordFailure("provider:" + selected.id);
          }
          recordTelemetry({
            ts: Date.now(),
            agentId,
            providerId: breakerOpen ? selected.id + "(breaker:open->mock)" : provider.id,
            durationMs: Date.now() - t0,
            ok: telemetryOk,
            error: telemetryErr,
          });
        }

    // Merge citations
    for (const citation of output.citations) {
      if (!session.citations.find((c) => c.id === citation.id)) {
        session.citations.push(citation);
      }
    }

    updateAgentState(session, agentId, {
      status: "done",
      progress: 100,
      currentStep: "Complete",
      completedAt: new Date().toISOString(),
      output,
      resolvedProviderId,
      ...(isDegradedHere
        ? { degraded: true, degradedReason: degradedReasonCaptured ?? (breakerOpen ? "breaker_open" : "provider_fallback") }
        : {}),
    });

    emitEvent(session.id, {
      type: "output",
      agentId,
      timestamp: new Date().toISOString(),
      data: output,
    });

    return output;
  } catch (err) {
    const isAbort =
      isCancelled(session.id) ||
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    if (isAbort) {
      // Cancellation is signalled once from cancelSession(); don't double-emit
      // an error event or overwrite the terminal 'cancelled' status.
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    updateAgentState(session, agentId, {
      status: "error",
      currentStep: `Error: ${message}`,
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
  switch (agentId) {
    case "market-sizer":
      return [
        "Defining market boundaries and scope...",
        "Gathering TAM data from industry reports...",
        "Calculating SAM and SOM with segmentation...",
        "Analyzing growth trends and market velocity...",
        "Cross-referencing data sources for confidence...",
        "Synthesizing market size estimates...",
      ];
    case "competitor-analyst":
      return [
        "Identifying direct and indirect competitors...",
        "Scraping competitor positioning and pricing...",
        "Building competitive feature matrix...",
        "Analyzing strengths and weaknesses...",
        "Mapping market gaps and white space...",
        "Validating findings across sources...",
      ];
    case "pain-detective":
      return [
        "Scanning forums and communities for discussions...",
        "Collecting user reviews and comments...",
        "Clustering pain points by frequency and severity...",
        "Extracting representative quotes...",
        "Identifying unmet needs and opportunity areas...",
        "Building user personas from pain point patterns...",
      ];
    case "pricing-scout":
      return [
        "Collecting competitor pricing pages...",
        "Mapping price bands and tier structures...",
        "Analyzing monetization model prevalence...",
        "Estimating willingness to pay by segment...",
        "Benchmarking against category norms...",
        "Formulating pricing recommendations...",
      ];
    case "channel-scout":
      return [
        "Mapping acquisition channel landscape...",
        "Scanning community hubs and forums...",
        "Analyzing content topic search volume...",
        "Evaluating paid channel competitiveness...",
        "Assessing channel cost and effectiveness...",
        "Prioritizing channels by expected ROI...",
      ];
    case "synthesis":
      return [
        "Collecting outputs from all research agents...",
        "Cross-validating findings across agents...",
        "Identifying highest-confidence insights...",
        "Assessing opportunity and risk scores...",
        "Synthesizing executive summary...",
        "Generating importable launch brief...",
      ];
  }
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

  const settled = await Promise.allSettled(
    researchAgentIds.map((agentId) => runAgent(session, agentId, stepDelay)),
  );

  if (isCancelled(sessionId)) {
    session.status = "cancelled";
    session.updatedAt = new Date().toISOString();
    cancelledSessions.delete(sessionId);
    return session;
  }

  const failedAgents = settled
    .map((r, i) => ({ agentId: researchAgentIds[i], r }))
    .filter((x) => x.r.status === "rejected");

  if (failedAgents.length > 0) {
    console.error(
      `[research] session ${sessionId}: ${failedAgents.length} agent(s) failed`,
      failedAgents.map((f) => f.agentId),
    );
  }

  // Only run synthesis if at least 3 of 5 research agents completed. If
  // synthesis itself fails, we still mark the session as completed (partial
  // results are still useful) but the agent will be in 'error' state.
  const completed = settled.filter((s) => s.status === "fulfilled").length;
  if (completed >= 3) {
    try {
      await runAgent(session, "synthesis", stepDelay);
    } catch (err) {
      console.error(`[research] synthesis failed for ${sessionId}:`, err);
    }
  } else {
    updateAgentState(session, "synthesis", {
      status: "error",
      currentStep: "Skipped: too many upstream agent failures",
    });
  }

  if (isCancelled(sessionId)) { session.status = "cancelled"; cancelledSessions.delete(sessionId); session.updatedAt = new Date().toISOString(); return session; }
  session.status = "completed";


  session.updatedAt = new Date().toISOString();



    // Persist to storage (best-effort)
  try {
    const synthesisRaw = session.agents.synthesis?.output;
    const resultText = typeof synthesisRaw === "string"
      ? synthesisRaw
      : synthesisRaw
        ? JSON.stringify(synthesisRaw, null, 2)
        : "";

    const createdMs = new Date(session.createdAt).getTime();
    const durationMs = createdMs ? Date.now() - createdMs : 0;

  sessionAborts.delete(sessionId);

    saveResearchRun({
      id: session.id,
      query: session.query,
      keywords: session.keywords,
      result: resultText,
      // R203: record the actual provider that ran (or attempted to run) the
      // session, not a hardcoded "mock". The session was annotated with
      // providerId at createResearchSession time.
      provider: session.providerId ?? "mock",
      model: session.providerModel ?? session.providerId ?? "default",
      createdAt: createdMs,
      durationMs,
      status: "completed",
      sources: session.citations?.slice(0, 20)?.filter((c) => c.url)?.map((c) => ({
        title: c.title,
        url: c.url || "",
        snippet: c.snippet,
      })) || [],
    });
  } catch {
    // Storage is best-effort — don't fail the run
  }

  emitEvent(session.id, {
    type: "complete",
    agentId: "synthesis",
    timestamp: new Date().toISOString(),
    message: "Research complete",
  });

  return session;
}


/** Subscribe to session events. Returns an unsubscribe function. */
export function subscribeToSession(
  sessionId: string,
  listener: (event: ResearchEvent) => void,
): () => void {
  let set = eventListeners.get(sessionId);
  if (!set) { set = new Set(); eventListeners.set(sessionId, set); }
  set.add(listener);
  const pending = sseIdleTimers.get(sessionId);
  if (pending) { clearTimeout(pending); sseIdleTimers.delete(sessionId); }
  return () => {
    const set = eventListeners.get(sessionId);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      eventListeners.delete(sessionId);
      const cur = sessions.get(sessionId);
      if (cur && (cur.status === "running" || cur.status === "pending")) {
        const existing = sseIdleTimers.get(sessionId);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          sseIdleTimers.delete(sessionId);
          const live = sessions.get(sessionId);
          if (live && (live.status === "running" || live.status === "pending")) {
            cancelSession(sessionId);
          }
        }, SSE_IDLE_GRACE_MS);
        sseIdleTimers.set(sessionId, t);
      }
    }
  };
}

// For testing: list all sessions
export function listSessions(): string[] {
  return Array.from(sessions.keys());
}

/* ------------------------------------------------------------------ */
/*  Pure session helpers (round 155) — stateless, SSR-safe            */
/* ------------------------------------------------------------------ */

export interface SessionSummary {
  id: string;
  status: ResearchSession["status"];
  query: string;
  keywordCount: number;
  totalAgents: number;
  doneAgents: number;
  runningAgents: number;
  errorAgents: number;
  idleAgents: number;
  overallProgress: number;
  citationCount: number;
  durationMs: number;
  hasSynthesis: boolean;
}

export function summarizeSession(session: ResearchSession, nowMs: number = Date.now()): SessionSummary {
  const agents = Object.values(session.agents);
  const done = agents.filter((a) => a.status === "done").length;
  const running = agents.filter((a) => a.status === "running").length;
  const errored = agents.filter((a) => a.status === "error").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const total = agents.length;
  const avgProgress = total > 0
    ? Math.round(agents.reduce((sum, a) => sum + (a.progress || 0), 0) / total)
    : 0;
  const createdMs = new Date(session.createdAt).getTime();
  const durationMs = Number.isFinite(createdMs) && createdMs > 0 ? Math.max(0, nowMs - createdMs) : 0;
  return {
    id: session.id,
    status: session.status,
    query: session.query,
    keywordCount: session.keywords.length,
    totalAgents: total,
    doneAgents: done,
    runningAgents: running,
    errorAgents: errored,
    idleAgents: idle,
    overallProgress: session.status === "completed" ? 100 : avgProgress,
    citationCount: session.citations.length,
    durationMs,
    hasSynthesis: session.agents.synthesis?.status === "done",
  };
}

export function agentStatesList(session: ResearchSession): AgentState[] {
  // Returns agents in a stable order (by AGENT_METADATA.order if available, else insertion).
  const entries = Object.entries(session.agents);
  entries.sort(([a], [b]) => {
    const ORDER: Record<string, number> = {
      "market-sizer": 0, "competitor-analyst": 1, "pain-detective": 2,
      "pricing-scout": 3, "channel-scout": 4, "synthesis": 5,
    };
    return (ORDER[a] ?? 99) - (ORDER[b] ?? 99);
  });
  return entries.map(([, v]) => v);
}

export function isSessionHealthy(session: ResearchSession): boolean {
  if (session.status === "pending" || session.status === "running") return true;
  if (session.status === "error") return false;
  // completed with fewer than 3 done agents is degraded
  return Object.values(session.agents).filter((a) => a.status === "done").length >= 3;
}

export function sessionToPlainRow(session: ResearchSession): {
  id: string; status: string; query: string; keywords: string; agentsDone: number;
  agentsTotal: number; progress: number; citations: number; createdAt: string; updatedAt: string;
} {
  const agents = Object.values(session.agents);
  return {
    id: session.id,
    status: session.status,
    query: session.query,
    keywords: session.keywords.join("|"),
    agentsDone: agents.filter((a) => a.status === "done").length,
    agentsTotal: agents.length,
    progress: summarizeSession(session).overallProgress,
    citations: session.citations.length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function sessionsToCsv(sessions: ResearchSession[]): string {
  const header = "id,status,query,keywords,agentsDone,agentsTotal,progress,citations,createdAt,updatedAt";
  const rows = sessions.map((s) => {
    const r = sessionToPlainRow(s);
    return [
      r.id, r.status, JSON.stringify(r.query), JSON.stringify(r.keywords),
      r.agentsDone, r.agentsTotal, r.progress, r.citations, r.createdAt, r.updatedAt,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

/** Returns the set of agent ids that finished with output. */
export function completedAgentIds(session: ResearchSession): string[] {
  return Object.entries(session.agents)
    .filter(([, a]) => a.status === "done" && a.output)
    .map(([id]) => id);
}

/** Returns the set of agent ids currently in error state. */
export function erroredAgentIds(session: ResearchSession): string[] {
  return Object.entries(session.agents)
    .filter(([, a]) => a.status === "error")
    .map(([id]) => id);
}

/** Rough ETA in ms based on average pace of finished agents. */
export function estimateEtaMs(session: ResearchSession, nowMs: number = Date.now()): number | null {
  if (session.status === "completed" || session.status === "error") return 0;
  const createdMs = new Date(session.createdAt).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return null;
  const agents = Object.values(session.agents);
  const totalNonSynthesis = agents.filter((a) => a.id !== "synthesis").length;
  const doneNonSynthesis = agents.filter((a) => a.id !== "synthesis" && a.status === "done").length;
  if (doneNonSynthesis === 0) return null;
  const elapsed = nowMs - createdMs;
  const perAgent = elapsed / doneNonSynthesis;
  const remaining = (totalNonSynthesis - doneNonSynthesis) * perAgent + perAgent * 0.5; // synthesis ~half an agent
  return Math.max(0, Math.round(remaining));
}

export function sessionsEqual(a: ResearchSession, b: ResearchSession): boolean {
  if (a.id !== b.id) return false;
  if (a.query !== b.query) return false;
  if (a.status !== b.status) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  if (a.keywords.join("\u0000") !== b.keywords.join("\u0000")) return false;
  if (a.citations.length !== b.citations.length) return false;
  const aIds = Object.keys(a.agents).sort().join(",");
  const bIds = Object.keys(b.agents).sort().join(",");
  if (aIds !== bIds) return false;
  if (a.query !== b.query) return false;
  if (a.status !== b.status) return false;
  if (a.citations.length !== b.citations.length) return false;
  if ((a.createdAt || "") !== (b.createdAt || "")) return false;
  return true;
}

