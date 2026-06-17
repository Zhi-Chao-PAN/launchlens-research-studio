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
import { saveResearchRun } from "@/lib/research/storage";

// In-memory session store for the research engine.
// In production this would be backed by a database with proper persistence.
const sessions = new Map<string, ResearchSession>();
const eventListeners = new Map<string, (event: ResearchEvent) => void>();

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

export function createResearchSession(query: string, keywords: string[], agentId?: string): ResearchSession {
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

function emitEvent(sessionId: string, event: ResearchEvent): void {
  const listener = eventListeners.get(sessionId);
  if (listener) {
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
    for (let i = 0; i < steps.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, stepDelayMs));

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
        let output;
        const t0 = Date.now();
        let telemetryOk = true;
        let telemetryErr: string | undefined;
        try {
          output = await provider.generate(agentId, {
            query: session.query,
            keywords: session.keywords,
            upstream: allOutputs,
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
          telemetryOk = false;
          telemetryErr = e instanceof Error ? e.message : String(e);
          output = generateMockAgentOutput(agentId, session.query, session.keywords, allOutputs);
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
    });

    emitEvent(session.id, {
      type: "output",
      agentId,
      timestamp: new Date().toISOString(),
      data: output,
    });

    return output;
  } catch (err) {
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

    saveResearchRun({
      id: session.id,
      query: session.query,
      keywords: session.keywords,
      result: resultText,
      provider: "mock",
      model: "mock-model",
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

// Event stream subscription for SSE
export function subscribeToSession(
  sessionId: string,
  listener: (event: ResearchEvent) => void,
): () => void {
  eventListeners.set(sessionId, listener);
  return () => {
    if (eventListeners.get(sessionId) === listener) {
      eventListeners.delete(sessionId);
    }
  };
}

// For testing: list all sessions
export function listSessions(): string[] {
  return Array.from(sessions.keys());
}
