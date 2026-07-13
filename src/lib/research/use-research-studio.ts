"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchWithCsrfStrict, RateLimitError } from "@/lib/api/csrf-client";
import { stage2HeadersFromCurrentUrl } from "@/lib/analytics/stage2-context";
import type {
  AgentId,
  AgentOutput,
  AgentState,
  EvidenceLedger,
  ValidationLedger,
} from "@/lib/schema/research-schema";
import type { CachedSession } from "@/lib/research/session-cache";
import type { DeepRunProgress } from "@/lib/research/deep-research/model";
import {
  DEFAULT_RESEARCH_MODE,
  normalizeResearchMode,
  type ResearchModeId,
} from "@/lib/research/research-modes";

export interface ResearchStudioState {
  sessionId: string | null;
  query: string;
  keywords: string[];
  mode: ResearchModeId;
  createdAt: string | null;
  updatedAt: string | null;
  status: "idle" | "loading" | "running" | "completed" | "cancelled" | "error" | "cancelling";
  agents: Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean; degraded?: boolean; degradedReason?: AgentState["degradedReason"] }>;
  agentOutputs: Record<AgentId, AgentOutput | null>;
  /** Retrieval provenance and URL-membership allowlist results for this run. */
  evidence: EvidenceLedger | null;
  /** Structural evidence-integrity checks; never semantic factual verification. */
  validation: ValidationLedger | null;
  /** Durable fixed-graph progress for Deep Research observer sessions. */
  deepRun: DeepRunProgress | null;
  activeAgentTab: AgentId;
  error: string | null;
  /** Per-agent error message if the engine reported a failure. */
  agentErrors: Partial<Record<AgentId, string>>;
  /** Wall-clock time (ms) at which a rate-limit cooldown ends. */
  rateLimitUntilMs: number | null;
  /** Bumped when the rate-limit cooldown expires — focuses the submit button. */
  retryReadyPulse: number;
  /** R225: number of consecutive rate-limited attempts for the current query.
   *  Incremented each time the server returns 429; reset to 0 on a successful
   *  start or an explicit reset. Surfaced in the rate-limit banner so the user
   *  knows how many retries they've burned. */
  retryCount: number;
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
  mode: DEFAULT_RESEARCH_MODE,
  createdAt: null,
  updatedAt: null,
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
  evidence: null,
  validation: null,
  deepRun: null,
  activeAgentTab: "market-sizer",
  error: null,
  agentErrors: {},
  rateLimitUntilMs: null,
  retryReadyPulse: 0,
  retryCount: 0,
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
  const finalizedSessionIdRef = useRef<string | null>(null);
  const cancelInFlightSessionIdRef = useRef<string | null>(null);
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

  const fetchSessionData = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) {
          finalizedSessionIdRef.current = sessionId;
          clearPolling();
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev, status: "error", error: "Session expired. Please start a new research.", reconnectUntilMs: null, pollingIntervalMs: null }
              : prev,
          );
          return true;
        }
        return false;
      }
      const data = await res.json() as StudioSessionSnapshot;
      const terminal = isTerminalStudioStatus(data.status);
      if (terminal) finalizedSessionIdRef.current = sessionId;
      setState((prev) =>
        finalizedSessionIdRef.current === sessionId && !terminal
          ? prev
          : mergeStudioSessionSnapshot(prev, sessionId, data),
      );
      if (terminal) {
        clearPolling();
        clearReconnectTimer();
      }
      return terminal;
    } catch (err) {
      console.error("Failed to fetch session data:", err);
      return false;
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
      // Constructing EventSource only starts a connection attempt. Retry state
      // is reset after the server proves the stream is healthy with `state`.

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
      let pollingActive = false;

      const closeProbe = () => {
        if (probeEs) {
          probeEs.close();
          probeEs = null;
        }
      };

      const attemptSseProbe = () => {
        if (sessionIdRef.current !== sessionId) return;
        if (finalizedSessionIdRef.current === sessionId) return;
        if (probeEs) return; // probe already in flight
        const probe = new EventSource(`/api/research/${sessionId}/stream`);
        probeEs = probe;
        const cleanup = () => {
          if (probeEs === probe) probeEs = null;
          probe.close();
        };
        const onState = () => {
          // SSE is alive. Stop the fallback before rebuilding the full stream;
          // otherwise its already-scheduled timer keeps GET polling forever.
          if (sessionIdRef.current !== sessionId) return cleanup();
          pollingActive = false;
          clearPolling();
          reconnectAttemptsRef.current = 0;
          setState((prev) =>
            prev.sessionId === sessionId
              ? { ...prev, reconnectUntilMs: null, pollingIntervalMs: null }
              : prev,
          );
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
        if (!pollingActive) return;
        if (sessionIdRef.current !== sessionId) return;
        if (finalizedSessionIdRef.current === sessionId) return;
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
          if (!pollingActive || sessionIdRef.current !== sessionId) return;
          void fetchSessionData(sessionId).then((terminal) => {
            const stillActive = pollingActive && sessionIdRef.current === sessionId;
            if (!shouldScheduleStudioPoll(terminal, stillActive)) return;
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
        pollingActive = true;
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
        void fetchSessionData(sessionId).then((terminal) => {
          const stillActive = sessionIdRef.current === sessionId;
          if (shouldScheduleStudioPoll(terminal, stillActive)) scheduleNextPoll();
        });
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
          const stateData = JSON.parse(e.data) as StudioSessionSnapshot;
          const terminal = isTerminalStudioStatus(stateData.status);
          reconnectAttemptsRef.current = 0;
          pollingActive = false;
          clearPolling();
          if (terminal) finalizedSessionIdRef.current = sessionId;
          setState((prev) => {
            const merged = mergeStudioSessionSnapshot(prev, sessionId, stateData);
            return merged === prev
              ? prev
              : { ...merged, reconnectUntilMs: null, pollingIntervalMs: null };
          });
          if (terminal) {
            clearPolling();
            clearReconnectTimer();
          }
        } catch (err) {
          console.error("Bad state event:", err);
        }
      });

      es.addEventListener("agent-progress", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId && !isTerminalStudioStatus(prev.status)
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
            prev.sessionId === sessionId && !isTerminalStudioStatus(prev.status)
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
                  evidence: d.evidence
                    ? {
                        version: 1,
                        agents: {
                          ...(prev.evidence?.agents ?? {}),
                          [d.agentId as AgentId]: d.evidence,
                        },
                      }
                    : prev.evidence,
                  validation: d.validation ?? prev.validation,
                }
              : prev,
          );
        } catch {}
      });

      es.addEventListener("agent-error", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setState((prev) =>
            prev.sessionId === sessionId && !isTerminalStudioStatus(prev.status)
              ? {
                  ...prev,
                  agentErrors: { ...prev.agentErrors, [d.agentId as AgentId]: d.message || "Agent failed" },
                }
              : prev,
          );
        } catch {}
      });

      const finalize = (
        event: Event,
        fallbackStatus: "completed" | "cancelled",
      ) => {
        if (sessionIdRef.current === sessionId) {
          finalizedSessionIdRef.current = sessionId;
          let snapshot: StudioSessionSnapshot = { status: fallbackStatus };
          if ("data" in event && typeof event.data === "string") {
            try {
              snapshot = JSON.parse(event.data) as StudioSessionSnapshot;
            } catch {
              // Keep the terminal status even if a legacy server sent no JSON.
            }
          }
          if (!isTerminalStudioStatus(snapshot.status)) {
            snapshot = { ...snapshot, status: fallbackStatus };
          }
          setState((prev) =>
            mergeStudioSessionSnapshot(prev, sessionId, snapshot),
          );
        }
        closeEventSource();
      };

      es.addEventListener("complete", (event) => finalize(event, "completed"));
      // Legacy stream versions emitted a dedicated `cancelled` event. Keep it
      // on the same terminal-snapshot path as the current `terminal` event so
      // partial outputs/evidence are retained instead of resetting to idle.
      es.addEventListener("cancelled", (event) => finalize(event, "cancelled"));
      es.addEventListener("terminal", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data) as StudioSessionSnapshot & {
            reason?: string;
            message?: string;
          };
          if (d.reason === "not-found" || d.reason === "expired") {
            finalizedSessionIdRef.current = sessionId;
            setState((prev) =>
              prev.sessionId === sessionId
                ? {
                    ...prev,
                    status: "error",
                    error: d.reason === "expired"
                      ? "Session expired. Please start a new research."
                      : "Session expired or not found. Please start a new research.",
                    reconnectUntilMs: null,
                    pollingIntervalMs: null,
                  }
                : prev,
            );
          } else if (d.reason === "cancelled" || d.reason === "error") {
            finalizedSessionIdRef.current = sessionId;
            setState((prev) =>
              prev.sessionId !== sessionId
                ? prev
                : {
                    ...mergeStudioSessionSnapshot(prev, sessionId, {
                      ...d,
                      status: d.reason,
                    }),
                    error: d.reason === "error" ? d.message || "Research failed." : null,
                    agentErrors: d.reason === "cancelled" ? {} : prev.agentErrors,
                  },
            );
          } else if (d.reason === "deleted") {
            finalizedSessionIdRef.current = sessionId;
            sessionIdRef.current = null;
            setState((prev) =>
              prev.sessionId === sessionId
                ? { ...initialState, mode: prev.mode }
                : prev,
            );
          }
        } catch {}
        closeEventSource();
      });
      es.onerror = () => {
        const wasActive = eventSourceRef.current === es;
        es.close();
        if (wasActive) eventSourceRef.current = null;
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        // Defer to the next tick to let a terminal event flush first.
        setTimeout(() => {
          if (finalizedSessionIdRef.current === sessionId) {
            closeEventSource();
          } else if (wasActive && eventSourceRef.current === null) {
            // Only schedule if nobody replaced the ES (e.g. a fresh connectSSE).
            scheduleReconnect();
          }
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

  /**
   * Re-attach the workspace to a durable run after a refresh or a copied
   * `?session=<id>` link. The GET snapshot is authoritative for hydration;
   * SSE is opened only when the recovered run is still active.
   */
  const resumeResearch = useCallback(
    async (candidateSessionId: string) => {
      const sessionId = normalizeResumeSessionId(candidateSessionId);
      if (!sessionId) {
        setState({
          ...initialState,
          status: "error",
          error: "Invalid research session id.",
        });
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      closeEventSource();
      sessionIdRef.current = sessionId;
      finalizedSessionIdRef.current = null;
      cancelInFlightSessionIdRef.current = null;
      setState({
        ...initialState,
        sessionId,
        status: "loading",
      });

      try {
        const response = await fetch(`/api/research/${sessionId}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const message = response.status === 404 || response.status === 410
            ? "Research session expired or was not found."
            : parseApiError(body, response.status, response);
          throw new Error(message);
        }

        const snapshot = await response.json() as StudioSessionSnapshot;
        if (snapshot.id && snapshot.id !== sessionId) {
          throw new Error("Research session response did not match the requested session.");
        }
        if (sessionIdRef.current !== sessionId || controller.signal.aborted) return;

        const hydrated = studioStateFromRemoteSession(sessionId, snapshot);
        setState(hydrated);
        if (isTerminalStudioStatus(hydrated.status)) {
          finalizedSessionIdRef.current = sessionId;
          return;
        }
        connectSSE(sessionId);
      } catch (error) {
        if (controller.signal.aborted || sessionIdRef.current !== sessionId) return;
        sessionIdRef.current = null;
        finalizedSessionIdRef.current = null;
        setState({
          ...initialState,
          status: "error",
          error: error instanceof Error ? error.message : "Failed to resume research.",
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [closeEventSource, connectSSE],
  );

  const startResearch = useCallback(
    async (
      query: string,
      keywords: string[],
      mode: ResearchModeId = DEFAULT_RESEARCH_MODE,
    ) => {
      const normalizedMode = normalizeResearchMode(mode);
      const startedAt = new Date().toISOString();
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
      closeEventSource();
      sessionIdRef.current = null;
      finalizedSessionIdRef.current = null;
      cancelInFlightSessionIdRef.current = null;
      setState((prev) => ({
        ...initialState,
        query,
        keywords,
        mode: normalizedMode,
        createdAt: startedAt,
        updatedAt: startedAt,
        status: "loading",
        // Preserve any active rate-limit cooldown so a spammed submit can't
        // race past the server-side bucket.
        rateLimitUntilMs: prev.rateLimitUntilMs,
      }));

      try {
        const res = await fetchWithCsrfStrict("/api/research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...stage2HeadersFromCurrentUrl(),
          },
          body: JSON.stringify({ query, keywords, mode: normalizedMode }),
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
          mode: normalizeResearchMode(data.mode ?? normalizedMode),
          createdAt: typeof data.createdAt === "string" ? data.createdAt : prev.createdAt,
          updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : prev.updatedAt,
          status: "running",
          rateLimitUntilMs: null,
          retryCount: 0,
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
            retryCount: prev.retryCount + 1,
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

  /**
   * Hydrate a completed local snapshot without starting or fetching a run.
   * This keeps "restore" semantically distinct from "run again".
   */
  const restoreCachedSession = useCallback(
    (cached: CachedSession) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
      closeEventSource();
      sessionIdRef.current = cached.id;
      finalizedSessionIdRef.current = cached.id;
      cancelInFlightSessionIdRef.current = null;
      setState(studioStateFromCachedSession(cached));
    },
    [closeEventSource],
  );

  const setActiveAgentTab = useCallback((agentId: AgentId) => {
    setState((prev) => ({ ...prev, activeAgentTab: agentId }));
  }, []);

  const cancel = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (
      !sid ||
      finalizedSessionIdRef.current === sid ||
      cancelInFlightSessionIdRef.current === sid
    ) return;
    cancelInFlightSessionIdRef.current = sid;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    closeEventSource();
    setState((prev) => ({
      ...prev,
      status: isTerminalStudioStatus(prev.status) ? prev.status : "cancelling",
      error: null,
      rateLimitUntilMs: null,
      reconnectUntilMs: null,
      pollingIntervalMs: null,
    }));

    try {
      // Explicit cancellation is the only observer-authorized stop signal.
      // Await and validate the response: cancellation is a user-visible state
      // transition, not a best-effort telemetry request.
      const response = await fetchWithCsrfStrict(`/api/research/${sid}/cancel`, {
        method: "POST",
        keepalive: true,
      });
      const body = await response.json().catch(() => null) as {
        ok?: unknown;
        sessionId?: unknown;
        status?: unknown;
      } | null;

      if (!response.ok) {
        const actualStatus = body?.status;
        const message = parseApiError(body, response.status, response);
        if (isTerminalStudioStatus(actualStatus)) {
          finalizedSessionIdRef.current = sid;
          setState((prev) => {
            const merged = mergeStudioSessionSnapshot(prev, sid, {
              status: actualStatus as "completed" | "cancelled" | "error",
            });
            return merged === prev ? prev : { ...merged, error: message };
          });
          await fetchSessionData(sid);
          setState((prev) => prev.sessionId === sid ? { ...prev, error: message } : prev);
          return;
        }
        if (response.status === 404 || response.status === 410) {
          finalizedSessionIdRef.current = sid;
          setState((prev) =>
            prev.sessionId === sid
              ? { ...prev, status: "error", error: message }
              : prev,
          );
          return;
        }
        throw new Error(message);
      }

      if (body?.ok !== true || body.sessionId !== sid || body.status !== "cancelled") {
        throw new Error("Cancellation response was invalid. Research status was not changed.");
      }

      finalizedSessionIdRef.current = sid;
      setState((prev) =>
        mergeStudioSessionSnapshot(prev, sid, { status: "cancelled" }),
      );
      // The API does not return the full terminal dossier. Its response is
      // checkpoint-gated, so this GET can safely enrich the cancelled state
      // with every partial output/evidence item that became durable.
      await fetchSessionData(sid);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel research.";
      finalizedSessionIdRef.current = null;
      setState((prev) =>
        prev.sessionId === sid && !isTerminalStudioStatus(prev.status)
          ? {
              ...prev,
              status: "running",
              error: message,
              reconnectUntilMs: null,
              pollingIntervalMs: null,
            }
          : prev,
      );
      if (sessionIdRef.current === sid) connectSSE(sid);
    } finally {
      if (cancelInFlightSessionIdRef.current === sid) {
        cancelInFlightSessionIdRef.current = null;
      }
    }
  }, [closeEventSource, connectSSE, fetchSessionData]);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    closeEventSource();
    sessionIdRef.current = null;
    finalizedSessionIdRef.current = null;
    cancelInFlightSessionIdRef.current = null;
    setState(initialState);
  }, [closeEventSource]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
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
    /**
     * R219: split the returned state so consumers can subscribe to just
     * the long-lived session fields (query, agents, agentOutputs, etc.)
     * without re-rendering on every transient tick (rate-limit cooldown,
     * reconnect deadline, polling interval). The studio page, the agent
     * cards, and the report view bind to `session`. The rate-limit pill
     * and the connection-status banner bind to `transient`. Without the
     * split, a single `state` object caused every consumer to re-render
     * on every tick.
     */
    session: state,
    transient: {
      rateLimitUntilMs: state.rateLimitUntilMs,
      retryReadyPulse: state.retryReadyPulse,
      retryCount: state.retryCount,
      reconnectUntilMs: state.reconnectUntilMs,
      pollingIntervalMs: state.pollingIntervalMs,
    },
    startResearch,
    resumeResearch,
    restoreCachedSession,
    cancel,
    setActiveAgentTab,
    reset,
    allAgentIds: ALL_AGENT_IDS,
  };
}

/* ------------------------------------------------------------------ */
/*  Pure studio helpers (round 162) -- no React, no network            */
/* ------------------------------------------------------------------ */

export interface StudioSessionSnapshot {
  id?: string;
  query?: string;
  keywords?: string[];
  status?: string;
  mode?: ResearchModeId | string;
  createdAt?: string;
  updatedAt?: string;
  agents?: Partial<Record<AgentId, {
    status?: string;
    progress?: number;
    currentStep?: string;
    hasOutput?: boolean;
    output?: AgentOutput | null;
    degraded?: boolean;
    degradedReason?: AgentState["degradedReason"];
  }>>;
  evidence?: EvidenceLedger | null;
  validation?: ValidationLedger | null;
  deepRun?: DeepRunProgress | null;
}

export function isTerminalStudioStatus(status: unknown): boolean {
  return status === "completed" || status === "cancelled" || status === "error";
}

const RESUME_SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;

/** Accept only the same opaque session-id shape used by the public API. */
export function normalizeResumeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && RESUME_SESSION_ID_PATTERN.test(normalized) ? normalized : null;
}

/** Build a fresh workspace state from one server-authoritative session snapshot. */
export function studioStateFromRemoteSession(
  sessionId: string,
  snapshot: StudioSessionSnapshot,
): ResearchStudioState {
  const base: ResearchStudioState = {
    ...initialState,
    sessionId,
    query: typeof snapshot.query === "string" ? snapshot.query : "",
    keywords: Array.isArray(snapshot.keywords)
      ? snapshot.keywords.filter((keyword): keyword is string => typeof keyword === "string")
      : [],
    mode: normalizeResearchMode(snapshot.mode),
    createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : null,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null,
    status: "loading",
  };
  const merged = mergeStudioSessionSnapshot(base, sessionId, snapshot);
  return (snapshot.status === "pending" || snapshot.status === "running") && merged.status === "loading"
    ? { ...merged, status: "running" }
    : merged;
}

export function shouldScheduleStudioPoll(
  terminal: boolean,
  sessionStillActive: boolean,
): boolean {
  return !terminal && sessionStillActive;
}

function preferValidationLedger(
  current: ValidationLedger | null,
  incoming: ValidationLedger | null | undefined,
): ValidationLedger | null {
  if (!incoming) return current;
  if (current?.stage === "final" && incoming.stage !== "final") return current;
  return incoming;
}

/**
 * Merge GET/SSE snapshots monotonically. Once a session is final, a delayed
 * running/pre-synthesis response is ignored wholesale; a final validation
 * ledger also cannot be replaced by a pre-synthesis revision.
 */
export function mergeStudioSessionSnapshot(
  current: ResearchStudioState,
  sessionId: string,
  snapshot: StudioSessionSnapshot,
): ResearchStudioState {
  if (current.sessionId !== sessionId) return current;
  const incomingTerminal = isTerminalStudioStatus(snapshot.status);
  const currentTerminal = isTerminalStudioStatus(current.status);

  // Every terminal status is sticky. A delayed GET/state/progress response may
  // enrich a terminal state only when it reports the same terminal status; it
  // can never revive the run or convert a user cancellation into completion.
  if (currentTerminal && snapshot.status !== current.status) return current;
  if (currentTerminal && incomingTerminal) {
    const currentUpdatedAt = current.updatedAt ? Date.parse(current.updatedAt) : Number.NaN;
    const incomingUpdatedAt = snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : Number.NaN;
    if (
      Number.isFinite(currentUpdatedAt) &&
      Number.isFinite(incomingUpdatedAt) &&
      incomingUpdatedAt < currentUpdatedAt
    ) return current;
  }

  const agents = { ...current.agents };
  const agentOutputs = { ...current.agentOutputs };
  for (const agentId of ALL_AGENT_IDS) {
    const incoming = snapshot.agents?.[agentId];
    if (!incoming) continue;
    agents[agentId] = {
      ...agents[agentId],
      ...(typeof incoming.status === "string" ? { status: incoming.status } : {}),
      ...(typeof incoming.progress === "number"
        ? { progress: Math.max(0, Math.min(100, incoming.progress)) }
        : {}),
      ...(typeof incoming.currentStep === "string"
        ? { currentStep: incoming.currentStep }
        : {}),
      hasOutput:
        typeof incoming.hasOutput === "boolean"
          ? incoming.hasOutput
          : incoming.output != null || agents[agentId].hasOutput,
      ...(incoming.degraded
        ? { degraded: true, degradedReason: incoming.degradedReason }
        : {}),
    };
    if (Object.prototype.hasOwnProperty.call(incoming, "output")) {
      agentOutputs[agentId] = incoming.output ?? null;
    }
  }

  const status: ResearchStudioState["status"] =
    snapshot.status === "completed"
      ? "completed"
      : snapshot.status === "cancelled"
        ? "cancelled"
        : snapshot.status === "error"
          ? "error"
          : current.status === "loading" && snapshot.status === "running"
            ? "running"
            : current.status;
  const terminal = isTerminalStudioStatus(status);

  return {
    ...current,
    query: typeof snapshot.query === "string" ? snapshot.query : current.query,
    keywords: Array.isArray(snapshot.keywords) && snapshot.keywords.every((keyword) => typeof keyword === "string")
      ? [...snapshot.keywords]
      : current.keywords,
    mode: normalizeResearchMode(snapshot.mode ?? current.mode),
    createdAt:
      typeof snapshot.createdAt === "string" ? snapshot.createdAt : current.createdAt,
    updatedAt:
      typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : current.updatedAt,
    status,
    agents,
    agentOutputs,
    evidence: snapshot.evidence ?? current.evidence,
    validation: preferValidationLedger(current.validation, snapshot.validation),
    deepRun: snapshot.deepRun ?? current.deepRun,
    error: status === "completed" || status === "cancelled" ? null : current.error,
    agentErrors: status === "cancelled" ? {} : current.agentErrors,
    reconnectUntilMs: terminal ? null : current.reconnectUntilMs,
    pollingIntervalMs: terminal ? null : current.pollingIntervalMs,
  };
}

/** Convert a localStorage snapshot into a complete, offline studio state. */
export function studioStateFromCachedSession(cached: CachedSession): ResearchStudioState {
  const agents = {} as ResearchStudioState["agents"];
  const agentOutputs = {} as ResearchStudioState["agentOutputs"];
  const agentErrors: ResearchStudioState["agentErrors"] = {};

  for (const agentId of ALL_AGENT_IDS) {
    const cachedAgent = cached.agentStatuses?.[agentId];
    const output = cached.outputs?.[agentId] ?? null;
    const status = typeof cachedAgent?.status === "string"
      ? cachedAgent.status
      : output
        ? "done"
        : "idle";

    agents[agentId] = {
      status,
      progress: Math.max(0, Math.min(100, Number(cachedAgent?.progress) || (output ? 100 : 0))),
      currentStep:
        typeof cachedAgent?.currentStep === "string" && cachedAgent.currentStep
          ? cachedAgent.currentStep
          : output
            ? "Restored from local snapshot"
            : "No cached output",
      hasOutput: !!output,
      ...(cachedAgent?.degraded
        ? {
            degraded: true,
            degradedReason: cachedAgent.degradedReason,
          }
        : {}),
    };
    agentOutputs[agentId] = output;
    if (status === "error") agentErrors[agentId] = "Agent failed in cached run";
  }

  const firstOutputAgent = ALL_AGENT_IDS.find((agentId) => agentOutputs[agentId])
    ?? "market-sizer";
  const hasAnyOutput = ALL_AGENT_IDS.some((agentId) => agentOutputs[agentId]);
  const restoredStatus: ResearchStudioState["status"] =
    cached.status === "completed"
      ? "completed"
      : cached.status === "cancelled"
        ? "cancelled"
        : "error";
  const restoredError = restoredStatus === "error"
    ? cached.status === "error"
      ? hasAnyOutput
        ? "Cached research failed. Partial results are shown."
        : "Cached research failed."
      : "Cached research is incomplete and cannot be resumed."
    : null;

  return {
    ...initialState,
    sessionId: cached.id,
    query: cached.query,
    keywords: [...cached.keywords],
    mode: normalizeResearchMode(cached.mode),
    createdAt: cached.createdAt,
    updatedAt: cached.updatedAt,
    status: restoredStatus,
    agents,
    agentOutputs,
    evidence: cached.evidence ?? null,
    validation: cached.validation ?? null,
    deepRun: null,
    activeAgentTab: firstOutputAgent,
    error: restoredError,
    agentErrors,
  };
}

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

export type StudioPhase = "idle" | "loading" | "running" | "completed" | "cancelled" | "error" | "mixed" | "cancelling";

/** Derive human-friendly phase from state/agents. */
export function deriveStudioPhase(state: Pick<ResearchStudioState, "status" | "agents">): StudioPhase {
  if (
    state.status === "idle" ||
    state.status === "loading" ||
    state.status === "cancelled" ||
    state.status === "error" ||
    state.status === "cancelling"
  ) return state.status;
  if (state.status === "completed") return "completed";
  const statuses = new Set(Object.values(state.agents).map((a) => a.status));
  if (statuses.has("running")) return "running";
  if (statuses.has("done") && statuses.size > 1) return "mixed";
  return state.status;
}

/** Deep equality of the studio state snapshot (good for memoization checks). */
export function studioStateEqual(a: ResearchStudioState, b: ResearchStudioState): boolean {
  if (a.sessionId !== b.sessionId) return false;
  if (a.query !== b.query || a.mode !== b.mode || a.status !== b.status || a.error !== b.error) return false;
  if (a.createdAt !== b.createdAt || a.updatedAt !== b.updatedAt) return false;
  if (a.activeAgentTab !== b.activeAgentTab) return false;
  if (a.evidence !== b.evidence || a.validation !== b.validation || a.deepRun !== b.deepRun) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  if (a.keywords.some((k, i) => k !== b.keywords[i])) return false;
  if (a.rateLimitUntilMs !== b.rateLimitUntilMs) return false;
  if (a.retryReadyPulse !== b.retryReadyPulse) return false;
  if (a.retryCount !== b.retryCount) return false;
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
  if (state.sessionId !== sessionId || isTerminalStudioStatus(state.status)) return state;
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
  if (state.sessionId !== sessionId || isTerminalStudioStatus(state.status)) return state;
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
  if (state.sessionId !== sessionId || isTerminalStudioStatus(state.status)) return state;
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

