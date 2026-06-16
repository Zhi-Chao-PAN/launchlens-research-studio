"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

export interface ResearchStudioState {
  sessionId: string | null;
  query: string;
  keywords: string[];
  status: "idle" | "loading" | "running" | "completed" | "error";
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
      const es = new EventSource(`/api/research/${sessionId}/stream`);
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
        const res = await fetch("/api/research", {
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

  const reset = useCallback(() => {
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
    setActiveAgentTab,
    reset,
    allAgentIds: ALL_AGENT_IDS,
  };
}
