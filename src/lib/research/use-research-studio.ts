"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchWithCsrfStrict, RateLimitError } from "@/lib/api/csrf-client";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

export interface ResearchStudioState {
  sessionId: string | null;
  query: string;
  keywords: string[];
  status: "idle" | "loading" | "running" | "completed" | "error" | "cancelling";
  agents: Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean; degraded?: boolean; degradedReason?: "provider_fallback" | "breaker_open" }>;
  agentOutputs: Record<AgentId, AgentOutput | null>;
  activeAgentTab: AgentId;
  error: string | null;
  /** Per-agent error message if the engine reported a failure. */
  agentErrors: Partial<Record<AgentId, string>>;
  /** Wall-clock time (ms) at which a rate-limit cooldown ends. */
  rateLimitUntilMs: number | null;
  /** Bumped when the rate-limit cooldown expires — focuses the submit button. */
  retryReadyPulse: number;
  /** Wall-clock time (ms) at which the next SSE reconnect attempt fires. */
  reconnectUntilMs: number | null;
  /** Current polling interval in ms while in SSE fallback; null when not polling.
   *  Interval grows with exponential backoff up to a cap to reduce server load. */
  pollingIntervalMs: number | null;
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
  rateLimitUntilMs: null,
  retryReadyPulse: 0,
  reconnectUntilMs: null,
  pollingIntervalMs: null,
};

const ALL_AGENT_IDS: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

function parseApiError(body: unknown, status: number, response?: Response | null): string {
  const retryAfter = response?.headers?.get("Retry-After");
  const bodyReset = body && typeof body === "object" && "resetMs" in body ? (body as { resetMs?: number }).resetMs : undefined;
  const waitSec = retryAfter ? parseInt(retryAfter, 10) : bodyReset ? Math.ceil(bodyReset / 1000) : NaN;
  if (status === 429 && waitSec && waitSec > 0) {
    return `Too many requests. Please wait ${waitSec}s before trying again.`;
  }
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
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearReconnectTimer();
    clearPolling();
    reconnectAttemptsRef.current = 0;
    setState((prev) =>
      prev.reconnectUntilMs || prev.pollingIntervalMs
        ? { ...prev, reconnectUntilMs: null, pollingIntervalMs: null }
        : prev,
    );
  }, [clearReconnectTimer, clearPolling]);

  const fetchSessionData = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          clearPolling();
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev, status: "error", error: "Session expired. Please start a new research.", reconnectUntilMs: null, pollingIntervalMs: null }
              : prev,
          );
        }
        return;
      }
      const data = await res.json();
      let terminal = false;
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
            // R203: preserve the degraded marker on the polling fallback path.
            ...(agentState.degraded
              ? { degraded: true, degradedReason: agentState.degradedReason }
              : {}),
          };
          if (agentState.output) {
            newAgentOutputs[agentId] = agentState.output;
          }
        }
        const nextStatus =
          data.status === "completed" || data.status === "cancelled"
            ? "completed"
            : data.status === "error"
              ? "error"
              : prev.status;
        terminal = data.status === "completed" || data.status === "cancelled" || data.status === "error";
        return {
          ...prev,
          status: nextStatus,
          agents: newAgents,
          agentOutputs: newAgentOutputs,
          reconnectUntilMs: terminal ? null : prev.reconnectUntilMs,
          pollingIntervalMs: terminal ? null : prev.pollingIntervalMs,
        };
      });
      if (terminal) {
        clearPolling();
        clearReconnectTimer();
      }
    } catch (err) {
      console.error("Failed to fetch session data:", err);
    }
  }, [clearPolling, clearReconnectTimer]);

  // The SSE setup is split out and held in a ref so the body can reference
  // itself (the inner `attemptSseProbe` calls back into setup on a successful
  // probe) without hitting a temporal-dead-zone error on a `const` wrapper.
  // A plain useCallback for setupSse would also TDZ on its own definition;
  // a ref is the canonical pattern for self-referential event handlers. The
  // function body is assigned in a useEffect so we never write to a ref
  // during render (the react-hooks/refs rule).
  const setupSseRef = useRef<(sessionId: string) => void>(() => {});
  useEffect(() => {
    setupSseRef.current = (sessionId: string) => {
      const es = new EventSource(`/api/research/${sessionId}/stream${reconnectAttemptsRef.current > 0 ? '?reconnect=1' : ''}`);
      eventSourceRef.current = es;
      reconnectAttemptsRef.current = 0;
      // (Re)connected — clear reconnect/polling banners.
      setState((prev) =>
        prev.sessionId === sessionId && (prev.reconnectUntilMs || prev.pollingIntervalMs)
          ? { ...prev, reconnectUntilMs: null, pollingIntervalMs: null }
          : prev,
      );

      // Polling fallback: exponential backoff 2s → 4s → 8s → 16s (cap 16s).
      // Each fetch that reaches a non-terminal state schedules the next poll.
      // Periodically we probe the SSE endpoint to see if the connection can be
      // restored. On repeated probe failures we back off the probe cadence too
      // (every 4 → 8 → 16 polls, cap 16) so long outages don't waste requests.
      const POLL_BASE = 2000;
      const POLL_CAP = 16000;
      const POLL_BACKOFF = 2;
      const POLL_RECONNECT_EVERY_START = 4;
      const POLL_RECONNECT_EVERY_MAX = 16;
      let pollInterval = POLL_BASE;
      let pollAttempts = 0;
      let probeFailures = 0;
      let probeEs: EventSource | null = null;

      const closeProbe = () => {
        if (probeEs) {
          probeEs.close();
          probeEs = null;
        }
      };

      const attemptSseProbe = () => {
        if (sessionIdRef.current !== sessionId) return;
        if (probeEs) return; // probe already in flight
        const probe = new EventSource(`/api/research/${sessionId}/stream`);
        probeEs = probe;
        const cleanup = () => {
          if (probeEs === probe) probeEs = null;
          probe.close();
        };
        const onState = () => {
          // SSE is alive — rebuild a proper EventSource connection with full
          // handlers (which will also clear polling state).
          if (sessionIdRef.current !== sessionId) return cleanup();
          cleanup();
          // Reset probe-failure counter so the next time we fall back to
          // polling we start probing again quickly.
          probeFailures = 0;
          setupSseRef.current(sessionId);
        };
        const onError = () => {
          probeFailures = Math.min(probeFailures + 1, 8); // cap at 2^8=256x (unreachable with cap=16)
          cleanup();
        };
        probe.addEventListener("state", onState, { once: true });
        probe.addEventListener("error", onError);
        // Probe times out after 3s — keep polling if the endpoint is still dead.
        setTimeout(() => {
          if (probeEs === probe) {
            probeFailures = Math.min(probeFailures + 1, 8);
            cleanup();
          }
        }, 3000);
      };

      /** Number of polls between SSE probes. Doubles each time a probe
       *  fails/expires; resets to the starting cadence when a probe succeeds. */
      const probeEvery = () => {
        const mult = 2 ** Math.min(probeFailures, 4); // cap at 16 polls = ~4 min at 16s cap
        return Math.min(POLL_RECONNECT_EVERY_START * mult, POLL_RECONNECT_EVERY_MAX);
      };

      const scheduleNextPoll = () => {
        if (sessionIdRef.current !== sessionId) return;
        clearPolling();
        // Exponential backoff with small jitter to avoid herd thundering.
        const jitter = pollInterval * 0.1 * Math.random();
        const interval = Math.min(POLL_CAP, pollInterval + jitter);
        pollInterval = Math.min(POLL_CAP, pollInterval * POLL_BACKOFF);
        pollAttempts += 1;
        setState((prev) =>
          prev.sessionId === sessionId ? { ...prev, pollingIntervalMs: interval } : prev,
        );
        pollingTimerRef.current = setTimeout(() => {
          pollingTimerRef.current = null;
          if (sessionIdRef.current !== sessionId) return;
          void fetchSessionData(sessionId).then(() => {
            if (sessionIdRef.current !== sessionId) return;
            // Periodically probe whether SSE has come back so we can return to
            // realtime updates instead of staying on polling indefinitely.
            // Cadence backs off with each failed probe to reduce load.
            if (pollAttempts >= probeEvery()) {
              pollAttempts = 0;
              attemptSseProbe();
            }
            scheduleNextPoll();
          });
        }, interval);
      };

      const beginPolling = () => {
        if (sessionIdRef.current !== sessionId) return;
        clearReconnectTimer();
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        closeProbe();
        pollInterval = POLL_BASE;
        pollAttempts = 0;
        setState((prev) =>
          prev.sessionId === sessionId
            ? { ...prev, reconnectUntilMs: null, pollingIntervalMs: POLL_BASE }
            : prev,
        );
        // Immediate first fetch, then back off.
        void fetchSessionData(sessionId).then(() => scheduleNextPoll());
      };

      const scheduleReconnect = () => {
        if (sessionIdRef.current !== sessionId) return;
        const attempts = reconnectAttemptsRef.current;
        if (attempts >= 3) {
          beginPolling();
          return;
        }
        const delay = Math.min(2000 * Math.pow(2, attempts), 8000);
        reconnectAttemptsRef.current = attempts + 1;
        const until = Date.now() + delay;
        setState((prev) =>
          prev.sessionId === sessionId ? { ...prev, reconnectUntilMs: until } : prev,
        );
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (sessionIdRef.current === sessionId) {
            setupSseRef.current(sessionId);
          }
        }, delay);
      };

      es.addEventListener("state", (e: MessageEvent) => {
        try {
          const stateData = JSON.parse(e.data);
          const terminal =
            stateData.status === "completed" ||
            stateData.status === "cancelled" ||
            stateData.status === "error";
          setState((prev) =>
            prev.sessionId === sessionId
              ? {
                  ...prev,
                  status: stateData.status === "completed" ? "completed" : "running",
                  agents: { ...prev.agents, ...stateData.agents },
                  reconnectUntilMs: terminal ? null : prev.reconnectUntilMs,
                  pollingIntervalMs: null, // SSE is healthy if we receive state events
                }
              : prev,
          );
          if (stateData.status === "completed") {
            clearPolling();
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
                      // R203: capture the degraded marker forwarded by the
                      // stream route so AgentCard can show a "demo data" badge.
                      ...(d.degraded ? { degraded: true, degradedReason: d.degradedReason } : {}),
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
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev, status: "completed", reconnectUntilMs: null, pollingIntervalMs: null }
              : prev,
          );
          fetchSessionData(sessionId);
        }
        closeEventSource();
      };

      es.addEventListener("complete", finalize);
      es.addEventListener("cancelled", () => {
        if (sessionIdRef.current === sessionId) {
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev,
                  status: "idle",
                  error: null,
                  agentErrors: {},
                  reconnectUntilMs: null,
                  pollingIntervalMs: null }
              : prev,
          );
        }
        closeEventSource();
      });
      es.addEventListener("terminal", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.reason === "not-found") {
            setState((prev) =>
              prev.sessionId === sessionId
                ? { ...prev, status: "error", error: "Session expired or not found. Please start a new research.", reconnectUntilMs: null, pollingIntervalMs: null }
                : prev,
            );
          } else if (d.reason === "cancelled" || d.reason === "deleted") {
            if (sessionIdRef.current === sessionId) {
              setState((prev) =>
                prev.sessionId === sessionId
                  ? { ...prev,
                      status: "idle",
                      sessionId: d.reason === "deleted" ? null : prev.sessionId,
                      error: null,
                      agentErrors: {},
                      reconnectUntilMs: null,
                      pollingIntervalMs: null }
                  : prev,
              );
              if (d.reason === "deleted") sessionIdRef.current = null;
            }
          } else if (d.message) {
            setState((prev) =>
              prev.sessionId === sessionId
                ? { ...prev, status: "error", error: d.message, reconnectUntilMs: null, pollingIntervalMs: null }
                : prev,
            );
          }
        } catch {}
        closeEventSource();
      });
      es.onerror = () => {
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
            } else if (eventSourceRef.current === es) {
              // Only schedule if nobody replaced the ES (e.g. a fresh connectSSE).
              scheduleReconnect();
            }
            return prev;
          });
        }, 100);
      };
    };
    // We intentionally bind this exactly once per mount: the function reads
    // everything via refs (sessionIdRef, eventSourceRef, reconnectAttemptsRef)
    // and stable useCallbacks (closeEventSource, fetchSessionData, clearPolling,
    // clearReconnectTimer) so a re-bind on every render would only churn refs
    // for no behavioural change. Re-running on dep change would also create a
    // brief window where setupSseRef.current still points at the old closure
    // — acceptable for a self-referential polling/SSE handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectSSE = useCallback(
    (sessionId: string) => {
      closeEventSource();
      setupSseRef.current(sessionId);
    },
    [closeEventSource],
  );

  const startResearch = useCallback(
    async (query: string, keywords: string[]) => {
      closeEventSource();
      sessionIdRef.current = null;
      setState((prev) => ({
        ...initialState,
        query,
        keywords,
        status: "loading",
        // Preserve any active rate-limit cooldown so a spammed submit can't
        // race past the server-side bucket.
        rateLimitUntilMs: prev.rateLimitUntilMs,
      }));

      try {
        const res = await fetchWithCsrfStrict("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, keywords }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(parseApiError(body, res.status, res));
        }

        const data = await res.json();
        const sessionId = data.sessionId;
        sessionIdRef.current = sessionId;
        setState((prev) => ({
          ...prev,
          sessionId,
          status: "running",
          rateLimitUntilMs: null,
          error: null,
          agentErrors: {},
          reconnectUntilMs: null,
          pollingIntervalMs: null,
        }));
        connectSSE(sessionId);
      } catch (err) {
        if (err instanceof RateLimitError) {
          const until = Date.now() + Math.max(1000, err.retryAfterMs);
          setState((prev) => ({
            ...prev,
            status: "idle",
            error: null, // rendered via i18n interpolation in the UI
            rateLimitUntilMs: until,
            reconnectUntilMs: null,
            pollingIntervalMs: null,
          }));
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to start research.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: message,
          rateLimitUntilMs: null,
          reconnectUntilMs: null,
          pollingIntervalMs: null,
        }));
      }
    },
    [closeEventSource, connectSSE],
  );

  const setActiveAgentTab = useCallback((agentId: AgentId) => {
    setState((prev) => ({ ...prev, activeAgentTab: agentId }));
  }, []);

  const cancel = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    closeEventSource();
    if (sid) {
      // Best-effort: tell the server to abort agents immediately instead of
      // waiting for the SSE idle grace to expire. keepalive lets it complete
      // even if the user navigates away mid-request.
      try { fetchWithCsrfStrict(`/api/research/${sid}/cancel`, { method: "POST", keepalive: true }).catch(() => {}); } catch {}
    }
    sessionIdRef.current = null;
    setState((prev) => ({
      ...prev,
      status: "idle",
      error: null,
      agentErrors: {},
      rateLimitUntilMs: null,
      reconnectUntilMs: null,
      pollingIntervalMs: null,
    }));
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

  // Cooldown tick: runs at ~4Hz while any deadline is active.
  // - rate-limit deadline → clear deadline + bump retryReadyPulse
  // - reconnect deadline → clear after 2s of being past-due (defensive)
  const hasActiveCooldown = !!(state.rateLimitUntilMs || state.reconnectUntilMs);
  useEffect(() => {
    if (!hasActiveCooldown) return;
    const tick = () => {
      setState((prev) => {
        const now = Date.now();
        let next = prev;
        if (prev.rateLimitUntilMs && prev.rateLimitUntilMs - now <= 0) {
          next = {
            ...next,
            rateLimitUntilMs: null,
            error: null,
            retryReadyPulse: next.retryReadyPulse + 1,
          };
        }
        if (prev.reconnectUntilMs && prev.reconnectUntilMs - now <= 0) {
          if (now - prev.reconnectUntilMs > 2000) {
            next = { ...next, reconnectUntilMs: null };
          }
        }
        return next;
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [hasActiveCooldown]);

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
  if (a.rateLimitUntilMs !== b.rateLimitUntilMs) return false;
  if (a.retryReadyPulse !== b.retryReadyPulse) return false;
  if (a.reconnectUntilMs !== b.reconnectUntilMs) return false;
  if (a.pollingIntervalMs !== b.pollingIntervalMs) return false;
  for (const id of ALL_AGENT_IDS) {
    const x = a.agents[id], y = b.agents[id];
    if (x.status !== y.status || x.progress !== y.progress || x.hasOutput !== y.hasOutput || x.currentStep !== y.currentStep) return false;
    // R203: degraded flag affects the AgentCard badge, so include it.
    if (!!x.degraded !== !!y.degraded) return false;
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

