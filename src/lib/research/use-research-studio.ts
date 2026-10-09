/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { CachedSession } from "@/lib/research/session-cache";
import {
  parseApiErrorResponse,
  networkError,
  wrapThrownError,
  type StructuredApiError,
} from "@/lib/api/error-codes";
import { isAbortError } from "@/lib/utils/retry";

export interface ResearchStudioState {
  sessionId: string | null;
  query: string;
  keywords: string[];
  status: "idle" | "loading" | "running" | "completed" | "error";
  agents: Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean }>;
  agentOutputs: Record<AgentId, AgentOutput | null>;
  activeAgentTab: AgentId;
  /** @deprecated Use `formError` for user-facing messages; kept for backward compatibility with the error banner. */
  error: string | null;
  /** Per-agent error message if the engine reported a failure. */
  agentErrors: Partial<Record<AgentId, string>>;
  /** Realtime transport state: idle (no session), connected (SSE live), reconnecting (SSE retry), polling (polling fallback) */
  connectionStatus: "idle" | "connecting" | "connected" | "reconnecting" | "polling";
  /**
   * Structured error surfaced by the most recent startResearch attempt.
   * Null when the form is idle / research is in flight / completed successfully.
   * The `field` discriminator lets the UI attach the message inline to the
   * query or keywords input, or show it as a form-level banner (RATE_LIMITED,
   * NETWORK_ERROR, etc.).
   */
  formError: StructuredApiError | null;
  /**
   * Seconds remaining until a rate-limited request may be retried.
   * Counts down from formError.retryAfterSeconds once per second while > 0.
   * When it reaches 0, the submit button re-enables. Always 0 when
   * formError is null or when formError.code !== "RATE_LIMITED".
   */
  retryAfterSeconds: number;
}

const initialAgentState = {
  status: "idle",
  progress: 0,
  currentStep: "step.waiting",
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
  connectionStatus: "idle" as const,
  formError: null,
  retryAfterSeconds: 0,
};

const ALL_AGENT_IDS: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

const POLL_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

export function useResearchStudio() {
  const [state, setState] = useState<ResearchStudioState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  /** AbortController for the in-flight start-research POST; used by reset()/new submit to cancel. */
  const startAbortRef = useRef<AbortController | null>(null);
  /**
   * Set to the sessionId we deliberately just cancelled (via reset/new submit).
   * When the polling 404 comes back for that same id we treat it as an expected
   * outcome and go back to idle silently, rather than showing the red
   * "Session expired" banner.
   */
  const intentionalCancelRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  /** Abort any in-flight start-research POST without surfacing an error. */
  const abortPendingStart = useCallback(() => {
    if (startAbortRef.current) {
      startAbortRef.current.abort();
      startAbortRef.current = null;
    }
  }, []);

  /**
   * Fire-and-forget DELETE to tell the server to abort in-flight provider
   * work. Uses keepalive fetch so the request survives navigation/unload.
   * We intentionally do not await — this is best-effort cancellation.
   */
  const cancelServerSession = useCallback((sid: string | null) => {
    if (!sid || typeof window === "undefined") return;
    // Remember we initiated this cancellation so the eventual 404 from
    // polling doesn't trigger a scary "Session expired" banner.
    intentionalCancelRef.current = sid;
    void fetch(`/api/research/${sid}`, {
      method: "DELETE",
      keepalive: true,
      signal: undefined,
    }).catch(() => {
      /* best-effort */
    });
  }, []);

  const closeEventSource = useCallback(() => {
    abortPendingStart();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopPolling();
  }, [abortPendingStart, stopPolling]);

  // fetchSessionData performs a one-shot GET and merges server state into
  // local React state. It is written as a stable callback that reads the
  // current sessionId from a ref so interval/SSE callbacks always use the
  // latest version without creating stale closures.
  const fetchSessionData = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          stopPolling();
          closeEventSource();
          // If we just cancelled this session ourselves (reset / new submit)
          // don't alarm the user with an "expired" banner — go back to idle
          // silently. Clear the flag so subsequent real 404s still surface.
          if (intentionalCancelRef.current === sessionId) {
            intentionalCancelRef.current = null;
            setState((prev) =>
              prev.sessionId === sessionId
                ? { ...initialState, connectionStatus: "idle" }
                : prev,
            );
            sessionIdRef.current = null;
            return;
          }
          // Session expired (server restart / in-memory eviction). Use a structured
          // code so the page can render a localized message; the English string is
          // kept as state.error for backward compatibility.
          const expiredError: StructuredApiError = {
            code: "SESSION_EXPIRED",
            field: "general",
            // English fallback kept here; page.tsx maps SESSION_EXPIRED to the
            // translated errors.sessionExpired key when rendering the banner.
            message: "Session expired. Please start a new research.",
          };
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  status: "error",
                  error: expiredError.message,
                  formError: expiredError,
                  retryAfterSeconds: 0,
                  connectionStatus: "idle",
                }
              : prev,
          );
        }
        return;
      }
      const data = await res.json();
      let reachedTerminal = false;
      setState((prev) => {
        if (prev.sessionId !== sessionId) return prev;
        const newAgentOutputs = { ...prev.agentOutputs };
        const newAgents = { ...prev.agents };
        const newAgentErrors = { ...prev.agentErrors };
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
          if (agentState.status === "error" && agentState.error) {
            newAgentErrors[agentId] = agentState.error;
          }
        }
        const nextStatus =
          data.status === "completed"
            ? "completed"
            : data.status === "error"
            ? "error"
            : prev.status;
        if (nextStatus === "completed" || nextStatus === "error") {
          reachedTerminal = true;
        }
        return {
          ...prev,
          status: nextStatus,
          agents: newAgents,
          agentOutputs: newAgentOutputs,
          agentErrors: newAgentErrors,
        };
      });
      if (reachedTerminal) {
        stopPolling();
      }
    } catch (err) {
      console.error("Failed to fetch session data:", err);
    }
  }, [stopPolling]);

  const startPolling = useCallback((sessionId: string) => {
    stopPolling();
    // Poll every 2s as a fallback when SSE has permanently failed.
    // We stop polling once the session reaches completed/error state.
    pollingTimerRef.current = setInterval(() => {
      if (sessionIdRef.current !== sessionId) {
        stopPolling();
        return;
      }
      fetchSessionData(sessionId);
    }, POLL_INTERVAL_MS);
    // Immediately fetch so the UI updates without waiting an interval.
    fetchSessionData(sessionId);
  }, [fetchSessionData, stopPolling]);

  const setConnStatus = useCallback((cs: ResearchStudioState["connectionStatus"]) => {
    setState((prev) => (prev.connectionStatus === cs ? prev : { ...prev, connectionStatus: cs }));
  }, []);

  const connectSSE = useCallback(
    (sessionId: string) => {
      closeEventSource();
      const es = new EventSource(`/api/research/${sessionId}/stream`);
      eventSourceRef.current = es;
      reconnectAttemptsRef.current = 0;
      setConnStatus("connecting");

      es.onopen = () => {
        if (sessionIdRef.current === sessionId) setConnStatus("connected");
      };

      const scheduleReconnect = () => {
        if (sessionIdRef.current !== sessionId) return;
        const attempts = reconnectAttemptsRef.current;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          // Give up on SSE — fall back to polling the session state
          es.close();
          eventSourceRef.current = null;
          setConnStatus("polling");
          startPolling(sessionId);
          return;
        }
        setConnStatus("reconnecting");
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

      es.addEventListener("agent-status", (e: MessageEvent) => {
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
                      status: "running",
                    },
                  },
                }
              : prev,
          );
        } catch {}
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
                      currentStep: "step.complete",
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

      // Server tells us an agent was cancelled by a user action (DELETE / reset).
      // Don't surface as a red error — just mark the agent as skipped/error with
      // a dedicated "cancelled" flag so the UI can render it neutrally.
      es.addEventListener("agent-cancelled", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) => {
            if (prev.sessionId !== sessionId) return prev;
            return {
              ...prev,
              agents: {
                ...prev.agents,
                [d.agentId as AgentId]: {
                  ...prev.agents[d.agentId as AgentId],
                  status: "cancelled",
                  currentStep: "step.skipped",
                  hasOutput: false,
                },
              },
            };
          });
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
        if (sessionIdRef.current !== sessionId) {
          closeEventSource();
          return;
        }
        // Defer to next tick to allow the 'state' event to flush first.
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
    [closeEventSource, fetchSessionData, startPolling, setConnStatus],
  );

  const startResearch = useCallback(
    async (query: string, keywords: string[]) => {
      // Cancel any running session before starting a new one — both locally
      // (abort in-flight POST, drop SSE) and on the server (fire-and-forget
      // DELETE so in-flight provider HTTP calls are released).
      const prevSid = sessionIdRef.current;
      if (prevSid) {
        cancelServerSession(prevSid);
      }
      abortPendingStart();
      closeEventSource();
      sessionIdRef.current = null;
      // Clear any previous formError immediately on submit; retryAfterSeconds
      // is reset to 0 so the submit button is enabled (it was only disabled
      // during the previous RATE_LIMITED cooldown).
      setState({ ...initialState, query, keywords, status: "loading", formError: null, retryAfterSeconds: 0 });

      const ac = new AbortController();
      startAbortRef.current = ac;
      const generation = ac;

      let structured: StructuredApiError;
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, keywords }),
          signal: ac.signal,
        });

        // Stale-response guard: if another submit/reset fired since we started,
        // drop the result on the floor.
        if (startAbortRef.current !== generation || ac.signal.aborted) return;

        if (!res.ok) {
          structured = await parseApiErrorResponse(res);
          if (startAbortRef.current !== generation || ac.signal.aborted) return;
          setState((prev) => ({
            ...prev,
            status: "error",
            error: structured.details ? `${structured.message} (${structured.details})` : structured.message,
            formError: structured,
            retryAfterSeconds: structured.retryAfterSeconds ?? 0,
            connectionStatus: "idle",
          }));
          return;
        }

        const data = await res.json();
        if (startAbortRef.current !== generation || ac.signal.aborted) return;
        const sessionId = data.sessionId;
        sessionIdRef.current = sessionId;
        startAbortRef.current = null;
        setState((prev) => ({
          ...prev,
          sessionId,
          status: "running",
          error: null,
          formError: null,
          retryAfterSeconds: 0,
          connectionStatus: "connecting",
        }));
        connectSSE(sessionId);
        return;
      } catch (err) {
        if (isAbortError(err)) return; // deliberate cancel — don't show error
        structured = err instanceof TypeError ? networkError() : wrapThrownError(err);
      }

      if (startAbortRef.current !== generation || ac.signal.aborted) return;
      startAbortRef.current = null;
      setState((prev) => ({
        ...prev,
        status: "error",
        error: structured.message,
        formError: structured,
        retryAfterSeconds: 0,
        connectionStatus: "idle",
      }));
    },
    [abortPendingStart, closeEventSource, connectSSE],
  );

  /**
   * Clear the current formError entirely (dismiss button), or just the error
   * attached to a specific field (called by QueryInput when the user edits
   * that field so stale validation errors don't linger after correction).
   */
  const clearFormError = useCallback((field?: StructuredApiError["field"]) => {
    setState((prev) => {
      if (!prev.formError) return prev;
      // Field-scoped clear: only drop the error if it belongs to that field.
      if (field && prev.formError.field !== field) return prev;
      return {
        ...prev,
        formError: null,
        error: prev.formError.field === "general" ? null : prev.error,
        retryAfterSeconds: 0,
      };
    });
  }, []);

  const setActiveAgentTab = useCallback((agentId: AgentId) => {
    setState((prev) => ({ ...prev, activeAgentTab: agentId }));
  }, []);

  const reset = useCallback(() => {
    // Tell the server to cancel any in-flight provider work before dropping
    // the session locally. closeEventSource() tears down SSE/POST but the
    // server would otherwise keep running agents until natural completion.
    const sid = sessionIdRef.current;
    closeEventSource();
    sessionIdRef.current = null;
    setState(initialState);
    cancelServerSession(sid);
  }, [cancelServerSession, closeEventSource]);
  /**
   * Hydrate state directly from a cached session without contacting the server.
   * Used when the user clicks a past-research entry so results appear instantly
   * (server is in-memory only and loses sessions on restart anyway).
   */
  const hydrateFromCache = useCallback((cached: CachedSession) => {
    closeEventSource();
    sessionIdRef.current = cached.id;
    const outputs = { ...initialState.agentOutputs } as Record<AgentId, AgentOutput | null>;
    const agents = { ...initialState.agents };
    const agentErrors: Partial<Record<AgentId, string>> = {};
    for (const id of ALL_AGENT_IDS) {
      const out = cached.outputs?.[id] ?? null;
      outputs[id] = out;
      const cachedStatus = cached.agentStatuses?.[id];
      agents[id] = {
        status: out ? "done" : cachedStatus?.status ?? "done",
        progress: out ? 100 : cachedStatus?.progress ?? 100,
        currentStep: cachedStatus?.currentStep ?? "Complete",
        hasOutput: !!out,
      };
      if (cachedStatus?.status === "error") {
        agentErrors[id] = "Agent error (from cache)";
      }
    }
    setState({
      sessionId: cached.id,
      query: cached.query,
      keywords: cached.keywords,
      status: "completed",
      agents,
      agentOutputs: outputs,
      activeAgentTab: "synthesis",
      error: null,
      agentErrors,
      connectionStatus: "idle",
      formError: null,
      retryAfterSeconds: 0,
    });
  }, [closeEventSource]);

  // Count down retryAfterSeconds once per second while a RATE_LIMITED
  // cooldown is active. Lets the submit button auto-re-enable and the UI
  // show a live "Retry in Ns" indicator without user interaction.
  useEffect(() => {
    if (state.retryAfterSeconds <= 0) return;
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.retryAfterSeconds <= 1) {
          return { ...prev, retryAfterSeconds: 0 };
        }
        return { ...prev, retryAfterSeconds: prev.retryAfterSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.retryAfterSeconds]);

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
    clearFormError,
    hydrateFromCache,
    allAgentIds: ALL_AGENT_IDS,
  };
}
