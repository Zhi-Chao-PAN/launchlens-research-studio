import type {
  AgentId,
  AgentState,
  ResearchSession,
  ResearchEvent,
  AgentOutput,
} from "@/lib/schema/research-schema";
import type { Stage2TrackingContext } from "@/lib/analytics/stage2-context";
import type { ProviderFallbackDetail, ProviderFallbackReason } from "@/lib/providers/provider.types";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { applyPersona } from "@/lib/providers/mock-persona";
import { selectProvider } from "@/lib/providers/provider-registry";
import { recordTelemetry } from "@/lib/telemetry/telemetry";
import { isOpen as breakerIsOpen, recordSuccess as breakerRecordSuccess, recordFailure as breakerRecordFailure } from "@/lib/utils/circuit-breaker";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { saveResearchRun } from "@/lib/research/storage";
import { researchRunFromSession, storePersistentResearchRun } from "@/lib/research/run-store";
import { sleep } from "@/lib/utils/sleep";
import { createConcurrencyLimiter } from "@/lib/utils/concurrency-limiter";
import { recordResearchFunnelEvent } from "@/lib/research/funnel-analytics";
import {
  storeSession,
  fetchSession,
  removeSession,
  setCancelFlag,
  isCancelledRemotely,
  publishEvent,
  subscribeEvents,
} from "@/lib/research/session-store";

// In-memory session store for the research engine.
// In production this would be backed by a database with proper persistence.
const sessions = new Map<string, ResearchSession>();
const cancelledSessions = new Set<string>();
const sessionAborts = new Map<string, AbortController>();
const eventListeners = new Map<string, Set<(event: ResearchEvent) => void>>();
const sseIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SSE_IDLE_GRACE_MS = 12000;
const DEFAULT_AGENT_TIMEOUT_MS = 180_000;
const MIN_AGENT_TIMEOUT_MS = 1000;

// R241: cap how many real-provider (LLM) calls may be in flight at once.
// The 5 research agents run concurrently via Promise.allSettled, and each
// issues a *streaming* request to the upstream model. Reasoning models
// (MiniMax-M3, DeepSeek-R1, o1-style) hold the connection open for a long
// time before emitting the first token (they "think" first). Opening all 5
// streams in the same tick stresses the provider gateway: connections stall,
// drop mid-stream, or never close cleanly, which surfaces as flaky
// `network_error` degradations on whichever agents lose the race.
//
// R245 default 3: before the streaming adapter fix, every logical agent opened
// two upstream requests, so a concurrency of 3 overloaded the gateway. The
// adapter now owns one request per agent and retries only after a failure.
// Three logical streams keep the five research agents plus synthesis inside
// Vercel's 300s request ceiling while remaining below the old effective load
// of four upstream streams at logical concurrency 2. Tunable via
// LAUNCHLENS_PROVIDER_CONCURRENCY. The mock provider bypasses the limiter so
// unit tests that force mock aren't serialized.
const PROVIDER_CONCURRENCY = (() => {
  const raw = process.env.LAUNCHLENS_PROVIDER_CONCURRENCY;
  if (!raw) return 3;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 3;
})();
const providerLimiter = createConcurrencyLimiter(PROVIDER_CONCURRENCY);

function formatProviderFallbackTelemetry(
  reason: ProviderFallbackReason,
  detail?: ProviderFallbackDetail,
): string {
  const parts = ["provider fallback: " + reason];
  if (typeof detail?.status === "number") {
    parts.push("status=" + detail.status);
  }
  if (detail?.message) {
    parts.push("message=" + detail.message.slice(0, 180));
  }
  return parts.join(" ");
}


// R217: cap how long a terminal (completed/cancelled/errored) session
// stays in the in-memory map. Sessions hold AbortController closures
// and listener Sets; without eviction, a long-running server leaks
// unbounded memory. 30 minutes is well past any reasonable SSE idle
// window and covers a user who navigates away from the page mid-run.
const SESSION_RETENTION_MS = (() => {
  const raw = process.env.LAUNCHLENS_SESSION_RETENTION_MS;
  if (!raw) return 30 * 60 * 1000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : 30 * 60 * 1000;
})();

// R216: per-agent wall-clock timeout. A real LLM call or retrieval query
// can hang on a flaky network or a slow upstream; without a budget the
// session sits in "running" forever and only an explicit user-cancel
// recovers it. Default 180s, env-overridable for ops. Production evidence
// from the reasoning-model gateway showed the competitor agent can need
// slightly more than 120s while the full two-at-a-time pipeline still fits
// inside the 300s serverless request budget.
//
// Read on every invocation so test setups that mutate process.env between
// cases see the updated value, and so ops can change the budget without a
// restart in dev.
function readAgentTimeoutMs(): number {
  const raw = process.env.LAUNCHLENS_AGENT_TIMEOUT_MS;
  if (!raw) return DEFAULT_AGENT_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= MIN_AGENT_TIMEOUT_MS
    ? parsed
    : DEFAULT_AGENT_TIMEOUT_MS;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// R231: throttle how often a session is re-mirrored to Redis during a run.
// emitEvent fires on every agent progress step (potentially dozens per run),
// and each storeSession is an HTTP round-trip to Upstash. Coalescing to at
// most one write per MIRROR_INTERVAL_MS keeps Redis load bounded while still
// ensuring a reconnecting instance sees a reasonably fresh session (worst
// case staleness = MIRROR_INTERVAL_MS). Terminal events bypass the throttle.
const REDIS_MIRROR_INTERVAL_MS = 2000;
const redisMirrorPending = new Set<string>();
const redisMirrorLastFlush = new Map<string, number>();

/**
 * Best-effort, throttled mirror of the live session into Redis so a
 * reconnecting SSE client on a different instance hydrates a *current* session
 * (status + agent progress) instead of the stale "pending" snapshot written at
 * creation time. No-op when Redis is not configured (storeSession returns
 * immediately). `force` bypasses the throttle for terminal transitions.
 */
function mirrorSessionToRedis(session: ResearchSession, force = false): void {
  if (!session) return;
  const id = session.id;
  if (!force && redisMirrorPending.has(id)) return;
  const now = Date.now();
  if (!force) {
    const last = redisMirrorLastFlush.get(id) ?? 0;
    if (now - last < REDIS_MIRROR_INTERVAL_MS) return;
  }
  redisMirrorLastFlush.set(id, now);
  redisMirrorPending.add(id);
  // Fire-and-forget: must never block the agent loop. Re-fetch the session
  // from the local map at flush time so we mirror its latest state, not a
  // potentially stale closure capture.
  setTimeout(() => {
    redisMirrorPending.delete(id);
    const live = sessions.get(id);
    if (live) void storeSession(live);
  }, force ? 0 : REDIS_MIRROR_INTERVAL_MS);
}

// R216: detect a timeout-triggered abort vs an external (cancel) abort.
// We need the distinction so we can label the agent as degraded rather
// than erroring out the whole session.
function isTimeoutAbort(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string };
  if (err.name === "AbortError") return true;
  if (typeof err.message === "string" && err.message.includes("agent timeout")) return true;
  return false;
}

export function getAgentTimeoutMs(): number {
  return readAgentTimeoutMs();
}

/**
 * R217: sweep terminal sessions older than SESSION_RETENTION_MS from
 * the in-memory map. Returns the number of sessions evicted. Safe to
 * call from a setInterval or on demand. Run on a fixed cadence (every
 * 5 minutes) so the map never grows unbounded.
 */
export function pruneStaleSessions(now: number = Date.now()): number {
  let evicted = 0;
  for (const [id, session] of sessions) {
    if (
      (session.status === "completed" ||
        session.status === "cancelled" ||
        session.status === "error") &&
      now - new Date(session.updatedAt).getTime() > SESSION_RETENTION_MS
    ) {
      // Local pruning is memory hygiene, not a user-requested deletion.
      // Keep the durable Redis snapshot so report and brief URLs remain
      // recoverable for the terminal-session retention window.
      evictSessionFromMemory(id);
      evicted++;
    }
  }
  return evicted;
}

/** R217: read the current retention budget (ms). */
export function getSessionRetentionMs(): number {
  return SESSION_RETENTION_MS;
}

function createInitialAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    progress: 0,
    currentStep: "Waiting to start...",
  };
}

export type CreateResearchSessionOptions = {
  stage2?: Stage2TrackingContext | null;
};

export function createResearchSession(
  query: string,
  keywords: string[],
  personaId?: string,
  options: CreateResearchSessionOptions = {},
): ResearchSession {
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
  // R205: derive the model name from the provider displayName so history
  // records the actual model (e.g. "gpt-4o-mini") rather than falling back
  // to the provider id. Display names follow the "Label (model)" convention;
  // for the mock provider there is no parenthetical, so we keep the id.
  const modelFromName = /\(([^)]+)\)\s*$/.exec(provider.displayName);
  const providerModel = modelFromName ? modelFromName[1] : provider.id;

  const session: ResearchSession = {
    id,
    query,
    keywords,
    // R203: the 3rd parameter is now properly named (was `agentId` which
    // shadowed the loop variable and was always undefined). The persona
    // flows from the API/batch path all the way to provider context.
    ...(personaId ? { personaId } : {}),
    ...(options.stage2 ? { stage2Tracking: options.stage2 } : {}),
    // R203: record real provider so history is accurate.
    providerId: provider.id,
    // R205: record the resolved model name for accurate history rows.
    providerModel,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    agents: agents as ResearchSession["agents"],
    citations: [],
  };

  sessions.set(id, session);
  sessionAborts.set(id, new AbortController());
  // Mirror to Redis so other instances can recover this session on
  // reconnect / GET / SSE. Fire-and-forget: storeSession swallows its own
  // errors and returns when Redis is not configured.
  void storeSession(session);
  return session;
}

export function getResearchSession(id: string): ResearchSession | undefined {
  const local = sessions.get(id);
  if (local) return local;
  // Fall back to Redis for sessions created on a different instance. We
  // intentionally do NOT await here — the engine uses this synchronously in
  // many places. When Redis is configured, the SSE/GET callers should call
  // `hydrateSessionFromRedis(id)` first if they need cross-instance recovery
  // before invoking the engine. This keeps single-instance behavior
  // identical (synchronous, in-memory) and adds the Redis path only as an
  // opt-in layer.
  return undefined;
}

/**
 * Best-effort cross-instance session recovery. Looks up a session id in
 * Redis and returns the freshest snapshot. It installs the remote snapshot
 * into the local Map only when no local object exists; replacing an active
 * local run object would detach the agent loop from future mirrors. Returns
 * the recovered session, or undefined if no Redis session exists. Callers
 * that need cross-instance visibility (e.g. the SSE stream route) should
 * invoke this before falling back to the "session not found" terminal.
 *
 * Installing into an empty local Map also restores the AbortController if
 * the recovered session is still running, so cancel propagation continues
 * to work on the recovering instance.
 */
export async function hydrateSessionFromRedis(id: string): Promise<ResearchSession | undefined> {
  const local = sessions.get(id);
  // If we have a local copy that is already terminal (completed/cancelled/
  // error), it is the most authoritative state — the run finished on this
  // instance — so return it without a Redis round-trip. But if the local
  // copy is still pending/running, it may be a stale creation snapshot on
  // an instance where the actual run is happening elsewhere: re-fetch from
  // Redis and prefer the fresher copy. This is what lets the post-run GET
  // (which often lands on the POST instance holding the initial pending
  // snapshot) return the completed state written by the SSE instance.
  if (local && (local.status === "completed" || local.status === "cancelled" || local.status === "error")) {
    return local;
  }
  const remote = await fetchSession(id);
  if (!remote) return local;
  // Prefer whichever copy is newer by updatedAt. The remote is usually
  // fresher when the run happened on another instance; local wins only if
  // this instance advanced it more recently (rare for a GET-only instance).
  const localTs = local ? Date.parse(local.updatedAt) : 0;
  const remoteTs = Date.parse(remote.updatedAt) || 0;
  const fresher = remoteTs >= localTs ? remote : local;
  if (!local && fresher === remote) {
    sessions.set(id, remote);
    if (!sessionAborts.has(id)) {
      sessionAborts.set(id, new AbortController());
    }
  }
  return fresher;
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

  // R212: persist cancelled runs so they show up in History instead of
  // vanishing on restart. Best-effort — storage failures must not break cancel.
  persistRunSnapshot(session, "cancelled");
  // Cross-instance: flag cancellation in Redis so any agent loop running on
  // a different instance can observe it, and mirror the cancelled state into
  // the session JSON so other instances see "cancelled" on GET.
  void setCancelFlag(id);
  void storeSession(session);
  return true;
}

/**
 * R212: write the session to durable storage with the requested status.
 * Best-effort: storage failures are swallowed so they never bubble up
 * to break the user's primary action (cancel / completion).
 *
 * Status semantics:
 *   - "completed" — partial JSON of whatever the synthesis (or last
 *     successful agent) produced. Matches the prior persistence path.
 *   - "cancelled" — JSON dump of the per-agent outputs that finished
 *     before the user cancelled, so they can revisit partial results.
 */
function persistRunSnapshot(session: ResearchSession, status: "completed" | "cancelled"): void {
  try {
    const run = researchRunFromSession(session, status);
    saveResearchRun(run);
    void storePersistentResearchRun(run);
  } catch {
    // Storage is best-effort — never break the caller.
  }
}

function evictSessionFromMemory(id: string): boolean {
  if (!sessions.has(id)) return false;

  const listeners = eventListeners.get(id);
  if (listeners) listeners.clear();
  eventListeners.delete(id);

  const pending = sseIdleTimers.get(id);
  if (pending) clearTimeout(pending);
  sseIdleTimers.delete(id);

  sessionAborts.delete(id);
  cancelledSessions.delete(id);
  sessions.delete(id);
  redisMirrorPending.delete(id);
  redisMirrorLastFlush.delete(id);
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
  evictSessionFromMemory(id);
  // Cross-instance: remove from Redis so deleted sessions don't resurface
  // on a future instance. Best-effort.
  void removeSession(id);
  return true;
}

function isCancelled(id: string): boolean { return cancelledSessions.has(id); }

/**
 * Pre-flight check used by the SSE stream route before subscribing to a
 * session. Hydrates the local cancelledSessions Set from Redis so the
 * synchronous `isCancelled()` check inside `runAgent` observes a remote
 * cancellation that originated on a different instance. Best-effort; if
 * Redis is not configured or the check fails, the local Set remains the
 * sole source of truth (single-instance behavior).
 */
export async function awaitCancelFromRedis(id: string): Promise<boolean> {
  const remote = await isCancelledRemotely(id);
  if (remote) {
    cancelledSessions.add(id);
    // Also abort any in-flight AbortController on this instance so an
    // active runAgent that holds a reference aborts immediately.
    sessionAborts.get(id)?.abort();
  }
  return remote;
}

function emitEvent(sessionId: string, event: ResearchEvent): void {
  // Local fan-out first — must remain synchronous so existing tests that
  // assert on cancel/listener behavior (e.g. research-engine.test.ts cancel
  // block) keep passing.
  const listeners = eventListeners.get(sessionId);
  if (listeners) {
    for (const l of Array.from(listeners)) {
      try { l(event); } catch (err) { console.error(`[research] listener for ${sessionId} threw:`, err); }
    }
  }
  // Cross-instance fan-out via Redis Pub/Sub — fire-and-forget so the
  // engine loop is never blocked by a Redis publish.
  publishEvent(sessionId, event);
  // R231: keep the Redis session snapshot fresh so a reconnecting instance
  // hydrates current progress/status rather than the stale creation snapshot.
  // Terminal events (complete/cancelled) flush immediately; progress/status
  // events are coalesced by the throttle.
  const session = sessions.get(sessionId);
  if (session) {
    const isTerminal = event.type === "complete" || event.type === "cancelled";
    mirrorSessionToRedis(session, isTerminal);
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
        // R216: timeout controller + handle must live outside the inner
        // try block so the finally below can clear the timer. (The
        // JS scoping rule: a finally clause cannot see const/let declared
        // inside its own try.)
        const timeoutController = new AbortController();
        const agentTimeoutMs = readAgentTimeoutMs();
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
        // Snapshot whether the per-session cancel was already fired so
        // we can distinguish a user cancel (don't degrade) from a
        // timeout-induced abort (do degrade) later on.
        const acEarly = sessionAborts.get(session.id);
        const userCancelledBeforeCall = !!(acEarly && acEarly.signal.aborted);
        const useLimiter = !selected.isMock;
        // R241: the actual generate() call, factored out so it can be run
        // either directly (mock) or through the concurrency limiter (real
        // provider). The wall-clock timeout is armed INSIDE the limiter
        // closure so an agent queued behind siblings doesn't burn its 180s
        // budget merely waiting for a slot — the budget covers the LLM call
        // itself, not the queue wait.
        const runGenerate = async () => {
          const ac = sessionAborts.get(session.id);
          // Combine the per-session cancel signal with a per-agent
          // wall-clock budget. Either side aborts the LLM call. The
          // timeout controller is cleaned up in finally so a slow call
          // doesn't leak an active AbortController into the next attempt.
          timeoutTimer = setTimeout(() => {
            timeoutController.abort(new Error(`agent timeout after ${agentTimeoutMs}ms`));
          }, agentTimeoutMs);
          // Combine signals safely: AbortSignal.any requires all entries to
          // be AbortSignal instances, so guard against undefined or null
          // (no per-session cancel signal in some test paths).
          const combinedSignal =
            ac && ac.signal
              ? AbortSignal.any([ac.signal, timeoutController.signal])
              : timeoutController.signal;
          // A user cancel that landed while we were queued for a slot should
          // abort here rather than fire a pointless (and billable) call.
          if (ac?.signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          return provider.generate(agentId, {
            query: session.query,
            keywords: session.keywords,
            upstream: allOutputs,
            signal: combinedSignal,
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
            onFallback: (reason, detail) => {
              if (selected.isMock) return;
              isDegradedHere = true;
              degradedReasonCaptured = reason;
              telemetryOk = false;
              telemetryErr = formatProviderFallbackTelemetry(reason, detail);
            },
          });
        };
        try {
          // Route real-provider calls through the concurrency limiter so at
          // most PROVIDER_CONCURRENCY streams are open at once; mock calls
          // run directly (tests that force mock must not be serialized).
          output = useLimiter
            ? await providerLimiter.run(runGenerate)
            : await runGenerate();
        } catch (e) {
          telemetryOk = false;
          telemetryErr = e instanceof Error ? e.message : String(e);
          output = applyPersona(generateMockAgentOutput(agentId, session.query, session.keywords, allOutputs), session.personaId);
          // R203/R216: provider.generate() fell into its outer catch and
          // returned mock. The agent ran on demo data, not on the real
          // provider's output, so we must flag it degraded so the UI shows
          // a "demo data" badge. The pre-existing onFallback path also
          // flips these flags; this block catches the case where the
          // provider silently absorbed the error without calling onFallback
          // (e.g. a timeout abort that the provider's outer try-catch saw
          // as a clean cancel).
          if (!isDegradedHere && provider !== selected) {
            // Breaker had pre-routed us to mock — already degraded, no
            // extra reason needed (the engine sets breaker_open elsewhere).
          } else if (!isDegradedHere) {
            isDegradedHere = true;
            degradedReasonCaptured = isTimeoutAbort(e)
              ? "network_error"
              : "http_error";
          }
        } finally {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          // R216: if the call returned *without* throwing but the timeout
          // controller fired, the provider silently swallowed the abort and
          // returned mock. We still need to mark the agent degraded so the
          // user sees the real provider never produced output. (Cancel paths
          // are detected via isCancelled() in the outer catch.)
          if (
            !isDegradedHere &&
            provider === selected &&
            timeoutController.signal.aborted &&
            !userCancelledBeforeCall
          ) {
            isDegradedHere = true;
            degradedReasonCaptured = "network_error";
          }
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
    for (const citation of (output?.citations ?? [])) {
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
  // R231: immediately mirror the "running" transition to Redis (force-flush,
  // bypassing the throttle) so a reconnecting instance sees the run has
  // started rather than the stale "pending" creation snapshot.
  void storeSession(session);

  const stepDelay = 300 / (options?.speedMultiplier || 1);

  // Run research agents in parallel. A single agent failure should not stop
  // the rest; we collect all results and report the failure via the session
  // status.
  //
  // R244: dispatch order is "lightest first" so the heaviest agent
  // (market-sizer) runs last. The first wave under PROVIDER_CONCURRENCY=3 is
  // (pricing-scout + channel-scout + pain-detective). As the two light agents
  // finish, competitor and market immediately use their slots while the
  // slower pain analysis continues. This reduces the critical path without
  // opening more upstream streams than the gateway has already handled.
  const researchAgentIds: AgentId[] = [
    "pricing-scout",
    "channel-scout",
    "pain-detective",
    "competitor-analyst",
    "market-sizer",
  ];

  const settled = await Promise.allSettled(
    researchAgentIds.map((agentId) => runAgent(session, agentId, stepDelay)),
  );

  if (isCancelled(sessionId)) {
    session.status = "cancelled";
    session.updatedAt = new Date().toISOString();
    cancelledSessions.delete(sessionId);
    persistRunSnapshot(session, "cancelled"); // R212
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

  if (isCancelled(sessionId)) {
    session.status = "cancelled";
    cancelledSessions.delete(sessionId);
    session.updatedAt = new Date().toISOString();
    persistRunSnapshot(session, "cancelled"); // R212
    return session;
  }
  session.status = "completed";


  session.updatedAt = new Date().toISOString();



  sessionAborts.delete(sessionId);

  // Persist completed snapshot (R212: routed through helper for parity with
  // the cancelled/failed paths).
  persistRunSnapshot(session, "completed");
  if (session.stage2Tracking) {
    await recordResearchFunnelEvent("research_completed", session.id, {
      stage2: session.stage2Tracking,
    });
  } else {
    await recordResearchFunnelEvent("research_completed", session.id);
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
  // Cross-instance fan-out: also subscribe to the Redis Pub/Sub channel so
  // events emitted from a different lambda instance reach this listener.
  // subscribeEvents is synchronous (Upstash returns a Subscriber instance
  // immediately) and returns an unsub function we capture here.
  const remoteUnsub = subscribeEvents(sessionId, (e) => {
    try { listener(e); } catch (err) { console.error(`[research] pubsub listener for ${sessionId} threw:`, err); }
  });
  return () => {
    try { remoteUnsub(); } catch { /* ignore */ }
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

