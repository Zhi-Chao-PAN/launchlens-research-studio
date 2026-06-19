"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchWithCsrfStrict, RateLimitError, fetchWithCsrf } from "@/lib/api/csrf-client";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

export interface ResearchStudioState {
  sessionId: string | null;
  query: string;
  keywords: string[];
  status: "idle" | "loading" | "running" | "completed" | "error" | "cancelling";
  agents: Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean }>;
  agentOutputs: Record<AgentId, AgentOutput | null>;
  activeAgentTab: AgentId;
  error: string | null;
  /** Per-agent error message if the engine reported a failure. */
  agentErrors: Partial<Record<AgentId, string>>;
}

const initialAgentState = {
  status: "idle",
  progress: 0,
  currentStep: "Waiting to start...",
  hasOutput: false,
};

const initialState: ResearchStudioState = {
  sessionId: null,
  query: "",
  keywords: [],
  status: "idle",
  agents: {
    "market-sizer": { ...initialAgentState },
    "competitor-analyst": { ...initialAgentState },
    "pain-detective": { ...initialAgentState },
    "pricing-scout": { ...initialAgentState },
    "channel-scout": { ...initialAgentState },
    synthesis: { ...initialAgentState },
  },
  agentOutputs: {
    "market-sizer": null,
    "competitor-analyst": null,
    "pain-detective": null,
    "pricing-scout": null,
    "channel-scout": null,
    synthesis: null,
  },
  activeAgentTab: "market-sizer",
  error: null,
  agentErrors: {},
};

const ALL_AGENT_IDS: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

function parseApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string") {
    const err = (body as { error: string; field?: string; details?: string }).error;
    const details = (body as { details?: string }).details;
    return details ? `${err} (${details})` : err;
  }
  return `Request failed with status ${status}.`;
}

export function useResearchStudio() {
  const [state, setState] = useState<ResearchStudioState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const fetchSessionData = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          // Session expired (server restart). Surface to user.
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev, status: "error", error: "Session expired. Please start a new research." }
              : prev,
          );
        }
        return;
      }
      const data = await res.json();
      setState((prev) => {
        if (prev.sessionId !== sessionId) return prev;
        const newAgentOutputs = { ...prev.agentOutputs };
        const newAgents = { ...prev.agents };
        for (const agentId of Object.keys(data.agents) as AgentId[]) {
          const agentState = data.agents[agentId];
          newAgents[agentId] = {
            status: agentState.status,
            progress: agentState.progress,
            currentStep: agentState.currentStep,
            hasOutput: !!agentState.output,
          };
          if (agentState.output) {
            newAgentOutputs[agentId] = agentState.output;
          }
        }
        return {
          ...prev,
          status: data.status === "completed" ? "completed" : prev.status,
          agents: newAgents,
          agentOutputs: newAgentOutputs,
        };
      });
    } catch (err) {
      console.error("Failed to fetch session data:", err);
    }
  }, []);

  const connectSSE = useCallback(
    (sessionId: string) => {
      closeEventSource();
      const es = new EventSource(`/api/research/${sessionId}/stream${reconnectAttemptsRef.current > 0 ? '?reconnect=1' : ''}`);
      eventSourceRef.current = es;
      reconnectAttemptsRef.current = 0;

      const scheduleReconnect = () => {
        if (sessionIdRef.current !== sessionId) return;
        const attempts = reconnectAttemptsRef.current;
        if (attempts >= 3) {
          // Give up — fall back to polling the session state
          fetchSessionData(sessionId);
          return;
        }
        const delay = Math.min(2000 * Math.pow(2, attempts), 8000);
        reconnectAttemptsRef.current = attempts + 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (sessionIdRef.current === sessionId) {
            connectSSE(sessionId);
          }
        }, delay);
      };

      es.addEventListener("state", (e: MessageEvent) => {
        try {
          const stateData = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  status: stateData.status === "completed" ? "completed" : "running",
                  agents: { ...prev.agents, ...stateData.agents },
                }
              : prev,
          );
          if (stateData.status === "completed") {
            fetchSessionData(sessionId);
          }
        } catch (err) {
          console.error("Bad state event:", err);
        }
      });

      es.addEventListener("agent-progress", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  agents: {
                    ...prev.agents,
                    [d.agentId as AgentId]: {
                      ...prev.agents[d.agentId as AgentId],
                      progress: d.progress,
                      currentStep: d.step,
                      status: "running",
                    },
                  },
                }
              : prev,
          );
        } catch {}
      });

      es.addEventListener("agent-output", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  agents: {
                    ...prev.agents,
                    [d.agentId as AgentId]: {
                      ...prev.agents[d.agentId as AgentId],
                      status: "done",
                      progress: 100,
                      hasOutput: true,
                    },
                  },
                  agentOutputs: {
                    ...prev.agentOutputs,
                    [d.agentId as AgentId]: d.output,
                  },
                }
              : prev,
          );
        } catch {}
      });

      es.addEventListener("agent-error", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  agentErrors: { ...prev.agentErrors, [d.agentId as AgentId]: d.message || "Agent failed" },
                }
              : prev,
          );
        } catch {}
      });

      const finalize = () => {
        if (sessionIdRef.current === sessionId) {
          setState((prev) => (prev.sessionId === sessionId ? { ...prev, status: "completed" } : prev));
          fetchSessionData(sessionId);
        }
        closeEventSource();
      };

      es.addEventListener("complete", finalize);
      es.onerror = () => {
        // EventSource will auto-reconnect, but if it errors after the session
        // completed, we should finalize. If session is still running and we
        // hit too many errors, we fall back to polling.
        if (sessionIdRef.current !== sessionId) {
          closeEventSource();
          return;
        }
        // Defer to the next tick to let state event flush first.
        setTimeout(() => {
          setState((prev) => {
            if (prev.status === "completed") {
              closeEventSource();
              fetchSessionData(sessionId);
            } else {
              scheduleReconnect();
            }
            return prev;
          });
        }, 100);
      };
    },
    [closeEventSource, fetchSessionData],
  );

  const startResearch = useCallback(
    async (query: string, keywords: string[]) => {
      closeEventSource();
      sessionIdRef.current = null;
      setState({ ...initialState, query, keywords, status: "loading" });

      try {
        const res = await fetchWithCsrfStrict("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, keywords }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(parseApiError(body, res.status));
        }

        const data = await res.json();
        const sessionId = data.sessionId;
        sessionIdRef.current = sessionId;
        setState((prev) => ({ ...prev, sessionId, status: "running" }));
        connectSSE(sessionId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start research.";
        setState((prev) => ({ ...prev, status: "error", error: message }));
      }
    },
    [closeEventSource, connectSSE],
  );

  const setActiveAgentTab = useCallback((agentId: AgentId) => {
    setState((prev) => ({ ...prev, activeAgentTab: agentId }));
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    closeEventSource();
    sessionIdRef.current = null;
    setState((prev) => ({ ...prev, status: "idle", error: null }));
  }, [closeEventSource]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    closeEventSource();
    sessionIdRef.current = null;
    setState(initialState);
  }, [closeEventSource]);

  useEffect(() => {
    return () => {
      closeEventSource();
    };
  }, [closeEventSource]);

  return {
    state,
    startResearch,
    cancel,
    setActiveAgentTab,
    reset,
    allAgentIds: ALL_AGENT_IDS,
  };
}

/* ------------------------------------------------------------------ */
/*  Pure studio helpers (round 162) -- no React, no network            */
/* ------------------------------------------------------------------ */

/** Normalize user query before submission: trim, collapse whitespace, clamp length. */
export function normalizeQuery(raw: string, maxLength = 500): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim();
}

/** Normalize keyword list: trim, dedupe (case-preserving), drop empties, cap count. */
export function normalizeKeywords(raw: string[] | string | undefined, maxCount = 10, maxLen = 60): string[] {
  let items: string[] = [];
  if (typeof raw === "string") items = raw.split(/[,;\n]+/);
  else if (Array.isArray(raw)) items = raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (typeof it !== "string") continue;
    const k = it.trim().replace(/\s+/g, " ");
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k.slice(0, maxLen));
    if (out.length >= maxCount) break;
  }
  return out;
}

export interface StudioProgress {
  overallPercent: number;
  completedAgents: number;
  runningAgents: number;
  errorAgents: number;
  totalAgents: number;
}

/** Compute aggregate progress across agents (pure, deterministic). */
export function computeStudioProgress(
  agents: ResearchStudioState["agents"],
  agentErrors: ResearchStudioState["agentErrors"],
): StudioProgress {
  const ids = Object.keys(agents) as AgentId[];
  let sum = 0, completed = 0, running = 0, errors = 0;
  for (const id of ids) {
    const a = agents[id];
    sum += Math.max(0, Math.min(100, a.progress || 0));
    if (agentErrors[id]) errors++;
    else if (a.status === "done" || a.status === "completed") completed++;
    else if (a.status === "running") running++;
  }
  const total = ids.length || 1;
  return {
    overallPercent: Math.round(sum / total),
    completedAgents: completed,
    runningAgents: running,
    errorAgents: errors,
    totalAgents: ids.length,
  };
}

export type StudioPhase = "idle" | "loading" | "running" | "completed" | "error" | "mixed" | "cancelling";

/** Derive human-friendly phase from state/agents. */
export function deriveStudioPhase(state: Pick<ResearchStudioState, "status" | "agents">): StudioPhase {
  if (state.status === "idle" || state.status === "loading" || state.status === "error") return state.status;
  if (state.status === "completed") return "completed";
  const statuses = new Set(Object.values(state.agents).map((a) => a.status));
  if (statuses.has("running")) return "running";
  if (statuses.has("done") && statuses.size > 1) return "mixed";
  return state.status;
}

/** Deep equality of the studio state snapshot (good for memoization checks). */
export function studioStateEqual(a: ResearchStudioState, b: ResearchStudioState): boolean {
  if (a.sessionId !== b.sessionId) return false;
  if (a.query !== b.query || a.status !== b.status || a.error !== b.error) return false;
  if (a.activeAgentTab !== b.activeAgentTab) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  if (a.keywords.some((k, i) => k !== b.keywords[i])) return false;
  for (const id of ALL_AGENT_IDS) {
    const x = a.agents[id], y = b.agents[id];
    if (x.status !== y.status || x.progress !== y.progress || x.hasOutput !== y.hasOutput || x.currentStep !== y.currentStep) return false;
    if ((a.agentOutputs[id] != null) !== (b.agentOutputs[id] != null)) return false;
    if ((a.agentErrors[id] || "") !== (b.agentErrors[id] || "")) return false;
  }
  return true;
}

/** Apply agent-progress event immutably, returns new state. */
export function applyAgentProgress(
  state: ResearchStudioState,
  sessionId: string,
  ev: { agentId: AgentId; progress: number; step?: string },
): ResearchStudioState {
  if (state.sessionId !== sessionId) return state;
  return {
    ...state,
    status: "running",
    agents: {
      ...state.agents,
      [ev.agentId]: {
        ...state.agents[ev.agentId],
        progress: Math.max(0, Math.min(100, ev.progress)),
        currentStep: ev.step || state.agents[ev.agentId].currentStep,
        status: "running",
      },
    },
  };
}

/** Apply agent-output event immutably. */
export function applyAgentOutput(
  state: ResearchStudioState,
  sessionId: string,
  ev: { agentId: AgentId; output: AgentOutput | null },
): ResearchStudioState {
  if (state.sessionId !== sessionId) return state;
  return {
    ...state,
    agents: {
      ...state.agents,
      [ev.agentId]: { ...state.agents[ev.agentId], status: "done", progress: 100, hasOutput: true },
    },
    agentOutputs: { ...state.agentOutputs, [ev.agentId]: ev.output },
  };
}

/** Apply agent-error event immutably. */
export function applyAgentError(
  state: ResearchStudioState,
  sessionId: string,
  ev: { agentId: AgentId; message?: string },
): ResearchStudioState {
  if (state.sessionId !== sessionId) return state;
  return {
    ...state,
    agentErrors: { ...state.agentErrors, [ev.agentId]: ev.message || "Agent failed" },
  };
}

export const STUDIO_CONSTANTS = {
  ALL_AGENT_IDS,
  maxQueryLength: 500,
  maxKeywords: 10,
  maxKeywordLength: 60,
};
