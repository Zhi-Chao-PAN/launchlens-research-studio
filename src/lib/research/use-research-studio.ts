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
};

export function useResearchStudio() {
  const [state, setState] = useState<ResearchStudioState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const fetchSessionData = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setState((prev) => {
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
      }
    } catch (err) {
      console.error("Failed to fetch session data:", err);
    }
  }, []);

  const startResearch = useCallback(async (query: string, keywords: string[]) => {
    closeEventSource();
    setState((prev) => ({ ...initialState, query, keywords, status: "loading" }));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, keywords }),
      });

      if (!res.ok) throw new Error("Failed to create research session");

      const data = await res.json();
      const sessionId = data.sessionId;
      setState((prev) => ({ ...prev, sessionId, status: "running" }));

      const eventSource = new EventSource(`/api/research/${sessionId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("state", (e: MessageEvent) => {
        const stateData = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          status: stateData.status === "completed" ? "completed" : "running",
          agents: { ...prev.agents, ...stateData.agents },
        }));
        if (stateData.status === "completed") {
          fetchSessionData(sessionId);
        }
      });

      eventSource.addEventListener("agent-progress", (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          agents: {
            ...prev.agents,
            [d.agentId]: {
              ...prev.agents[d.agentId as AgentId],
              progress: d.progress,
              currentStep: d.step,
              status: "running",
            },
          },
        }));
      });

      eventSource.addEventListener("agent-output", (e: MessageEvent) => {
        const d = JSON.parse(e.data);
        setState((prev) => ({
          ...prev,
          agents: {
            ...prev.agents,
            [d.agentId]: {
              ...prev.agents[d.agentId as AgentId],
              status: "done",
              progress: 100,
              hasOutput: true,
            },
          },
          agentOutputs: {
            ...prev.agentOutputs,
            [d.agentId]: d.output,
          },
        }));
      });

      eventSource.addEventListener("complete", () => {
        setState((prev) => ({ ...prev, status: "completed" }));
        fetchSessionData(sessionId);
        closeEventSource();
      });

      eventSource.onerror = () => {
        closeEventSource();
        setState((prev) => ({ ...prev, status: "completed" }));
        fetchSessionData(sessionId);
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [closeEventSource, fetchSessionData]);

  const setActiveAgentTab = useCallback((agentId: AgentId) => {
    setState((prev) => ({ ...prev, activeAgentTab: agentId }));
  }, []);

  const reset = useCallback(() => {
    closeEventSource();
    setState(initialState);
  }, [closeEventSource]);

  useEffect(() => {
    return () => { closeEventSource(); };
  }, [closeEventSource]);

  return { state, startResearch, setActiveAgentTab, reset };
}
