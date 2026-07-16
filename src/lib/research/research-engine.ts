import type {
  AgentId,
  AgentState,
  ResearchSession,
  ResearchEvent,
  AgentOutput,
} from "@/lib/schema/research-schema";
import type { Stage2TrackingContext } from "@/lib/analytics/stage2-context";
import { randomBytes } from "node:crypto";
import { getDomain } from "tldts";
import type { ProviderFallbackDetail, ProviderFallbackReason } from "@/lib/providers/provider.types";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { applyPersona } from "@/lib/providers/mock-persona";
import { selectProvider } from "@/lib/providers/provider-registry";
import { recordTelemetry } from "@/lib/telemetry/telemetry";
import { isOpen as breakerIsOpen, recordSuccess as breakerRecordSuccess, recordFailure as breakerRecordFailure } from "@/lib/utils/circuit-breaker";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { selectRetrievalProvider } from "@/lib/providers/retrieval-registry";
import {
  RetrievalError,
  type RetrievedSource,
} from "@/lib/providers/retrieval.types";
import { saveResearchRun } from "@/lib/research/storage";
import { researchRunFromSession, storePersistentResearchRun } from "@/lib/research/run-store";
import {
  allowlistAgentOutput,
  buildDeepRetrievalQueries,
  buildDeepRetrievalRescueQueries,
  buildFocusedRetrievalQuery,
  canonicalizeRetrievedSources,
  createAgentEvidenceEntry,
  createEvidenceLedger,
  ensureEvidenceLedger,
  shouldRestrictDeepVocDomains,
  specialistAllowlistedSourceUnion,
} from "@/lib/research/evidence-ledger";
import { buildResearchValidation } from "@/lib/research/validation-ledger";
import { sleep } from "@/lib/utils/sleep";
import { createConcurrencyLimiter } from "@/lib/utils/concurrency-limiter";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import { recordResearchFunnelEvent } from "@/lib/research/funnel-analytics";
import {
  DEFAULT_RESEARCH_MODE,
  getResearchModeConfig,
  normalizeResearchMode,
  type ResearchModeId,
} from "@/lib/research/research-modes";
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
const DEFAULT_AGENT_TIMEOUT_MS = 180_000;
const MIN_AGENT_TIMEOUT_MS = 1000;
const DEFAULT_STANDARD_SESSION_BUDGET_MS = 270_000;
const MIN_STANDARD_SESSION_BUDGET_MS = 100;
const MAX_STANDARD_SESSION_BUDGET_MS = 285_000;
const MAX_DEEP_AGENT_STAGE_BUDGET_MS = 240_000;
const MIN_DEEP_RETRIEVED_SOURCES = 2;
const MAX_DEEP_RETRIEVED_SOURCES = 6;
const DEEP_MIN_RETRIEVAL_SCORE = 0.35;
const DEEP_CANCEL_POLL_INTERVAL_MS = 500;

const SPECIALIST_AGENT_IDS = new Set<AgentId>([
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
]);

export type ResearchAgentStageErrorCode =
  | "session_not_found"
  | "session_not_runnable"
  | "invalid_agent"
  | "session_cancelled"
  | "aborted"
  | "deadline_exceeded"
  | "model_provider_unavailable"
  | "provider_degraded"
  | "retrieval_unavailable"
  | "retrieval_insufficient"
  | "evidence_insufficient";

/** Stable failure surface consumed by the durable Deep Research runner. */
export class ResearchAgentStageError extends Error {
  readonly code: ResearchAgentStageErrorCode;

  constructor(
    code: ResearchAgentStageErrorCode,
    message: string,
    readonly degradedReason?: NonNullable<AgentState["degradedReason"]>,
    /** Explicit durable retry decision when the stage has stronger evidence than its error code. */
    readonly retryable?: boolean,
  ) {
    super(message);
    this.name = "ResearchAgentStageError";
    this.code = code;
  }
}

export interface RunResearchAgentStageOptions {
  /** Deep execution is fail-closed by default. False preserves Standard fallback semantics. */
  strict?: boolean;
  /** Caller lifecycle signal (for example, a lost worker lease). */
  signal?: AbortSignal;
  /** Absolute epoch deadline. The engine also enforces its own 240s ceiling. */
  deadlineAt?: number;
  /** Mainly useful for deterministic tests; production keeps the normal progress cadence. */
  stepDelayMs?: number;
  /** Strict mode never accepts fewer than two usable retrieved sources. */
  minimumRetrievedSources?: number;
  /** Fenced record snapshot. When present, execution never touches the shared session Map. */
  sessionSnapshot?: ResearchSession;
}

export interface ResearchAgentStageResult {
  output: AgentOutput;
  /** Immutable-by-convention snapshot for the fenced repository commit. */
  session: ResearchSession;
}

// All Redis session writes from this process are serialized per session. This
// prevents a slower pre-synthesis write from landing after the terminal
// snapshot and regressing durable state back to "running"/"pre_synthesis".
const sessionWriteQueues = new Map<string, Promise<void>>();
const terminalCheckpoints = new Map<string, Promise<void>>();
const terminalEventsEmitted = new Set<string>();

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

/** Leave part of the 300s SSE window for the final durable checkpoint. */
function readStandardSessionBudgetMs(): number {
  const raw = process.env.LAUNCHLENS_STANDARD_SESSION_BUDGET_MS;
  if (!raw) return DEFAULT_STANDARD_SESSION_BUDGET_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) &&
    parsed >= MIN_STANDARD_SESSION_BUDGET_MS &&
    parsed <= MAX_STANDARD_SESSION_BUDGET_MS
    ? parsed
    : DEFAULT_STANDARD_SESSION_BUDGET_MS;
}

function generateId(): string {
  // Session ids are capability handles in the no-login flow: they grant
  // access to live state, evidence and cancellation. Keep them unguessable.
  return randomBytes(16).toString("hex");
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

function cloneSessionSnapshot(session: ResearchSession): ResearchSession {
  return JSON.parse(JSON.stringify(session)) as ResearchSession;
}

/**
 * Queue an immutable snapshot behind every earlier write for this session.
 * Capturing before the async boundary prevents later mutations from changing
 * what a particular revision represents; chaining prevents completion order
 * at the remote store from reversing revision order.
 */
function enqueueSessionSnapshot(session: ResearchSession): Promise<void> {
  const snapshot = cloneSessionSnapshot(session);
  const previous = sessionWriteQueues.get(session.id) ?? Promise.resolve();
  const write = previous
    .catch(() => {})
    .then(() => storeSession(snapshot));
  sessionWriteQueues.set(session.id, write);
  const clearIfCurrent = () => {
    if (sessionWriteQueues.get(session.id) === write) {
      sessionWriteQueues.delete(session.id);
    }
  };
  void write.then(clearIfCurrent, clearIfCurrent);
  return write;
}

/**
 * Best-effort, throttled mirror of the live session into Redis so a
 * reconnecting SSE client on a different instance hydrates a *current* session
 * (status + agent progress) instead of the stale "pending" snapshot written at
 * creation time. No-op when Redis is not configured (storeSession returns
 * immediately). Terminal transitions use `checkpointTerminalSession`
 * directly and never depend on this progress mirror.
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
    if (live) void enqueueSessionSnapshot(live);
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

export function getStandardSessionBudgetMs(): number {
  return readStandardSessionBudgetMs();
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
  mode?: ResearchModeId;
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
    mode: normalizeResearchMode(options.mode ?? DEFAULT_RESEARCH_MODE),
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
    evidence: createEvidenceLedger(now),
  };

  sessions.set(id, session);
  sessionAborts.set(id, new AbortController());
  // Mirror to Redis so other instances can recover this session on
  // reconnect / GET / SSE. Fire-and-forget: storeSession swallows its own
  // errors and returns when Redis is not configured.
  void enqueueSessionSnapshot(session);
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
  // A pending local copy is only the POST creation snapshot; replacing it
  // with a newer remote revision is safe and lets a cancel request landing on
  // the POST instance act on the actual cross-instance run state. Never
  // replace a locally running object because the agent loop mutates it by
  // reference.
  if ((!local || local.status === "pending") && fresher === remote) {
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
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "error"
  ) return false;
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

  // The public cancel API stays synchronous, but its terminal event is gated
  // by an awaited checkpoint. Observers therefore cannot see "cancelled"
  // before the final session and partial dossier are durable.
  void checkpointTerminalSession(session, "cancelled", "Research cancelled");
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
async function persistRunSnapshot(
  session: ResearchSession,
  status: "completed" | "cancelled",
): Promise<void> {
  try {
    const run = researchRunFromSession(session, status);
    saveResearchRun(run);
    await storePersistentResearchRun(run);
  } catch {
    // Storage is best-effort — never break the caller.
  }
}

function terminalEventData(session: ResearchSession): Record<string, unknown> {
  return {
    status: session.status,
    mode: normalizeResearchMode(session.mode),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agents: Object.fromEntries(
      Object.entries(session.agents).map(([id, state]) => [
        id,
        {
          status: state.status,
          progress: state.progress,
          currentStep: state.currentStep,
          hasOutput: !!state.output,
          ...(state.output ? { output: state.output } : {}),
          ...(state.degraded
            ? { degraded: true, degradedReason: state.degradedReason }
            : {}),
        },
      ]),
    ),
    evidence: session.evidence,
    validation: session.validation,
  };
}

/**
 * The sole completed/cancelled publication seam. Every earlier queued session
 * revision drains first; then the terminal session and full dossier are
 * awaited; only then is the terminal event visible locally or via Pub/Sub.
 */
function checkpointTerminalSession(
  session: ResearchSession,
  status: "completed" | "cancelled",
  message: string,
): Promise<void> {
  const existing = terminalCheckpoints.get(session.id);
  if (existing) return existing;

  const snapshot = cloneSessionSnapshot(session);
  const checkpoint = (async () => {
    await Promise.all([
      enqueueSessionSnapshot(snapshot),
      persistRunSnapshot(snapshot, status),
      ...(status === "cancelled" ? [setCancelFlag(snapshot.id)] : []),
    ]);

    if (terminalEventsEmitted.has(snapshot.id)) return;
    terminalEventsEmitted.add(snapshot.id);
    emitEvent(snapshot.id, {
      type: status === "completed" ? "complete" : "cancelled",
      agentId: "synthesis",
      timestamp: new Date().toISOString(),
      message,
      data: terminalEventData(snapshot),
    });
  })();
  terminalCheckpoints.set(session.id, checkpoint);
  return checkpoint;
}

/** Await a previously scheduled cancel/completion checkpoint (tests/routes). */
export function awaitTerminalCheckpoint(id: string): Promise<void> {
  return terminalCheckpoints.get(id) ?? Promise.resolve();
}

function evictSessionFromMemory(id: string): boolean {
  if (!sessions.has(id)) return false;

  const listeners = eventListeners.get(id);
  if (listeners) listeners.clear();
  eventListeners.delete(id);

  sessionAborts.delete(id);
  cancelledSessions.delete(id);
  sessions.delete(id);
  redisMirrorPending.delete(id);
  redisMirrorLastFlush.delete(id);
  sessionWriteQueues.delete(id);
  terminalCheckpoints.delete(id);
  terminalEventsEmitted.delete(id);
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
  // Progress/status events are coalesced by the throttle. Terminal events are
  // emitted only by checkpointTerminalSession, which has already awaited the
  // definitive session snapshot and must not schedule a second write here.
  const session = sessions.get(sessionId);
  if (session) {
    const isTerminal = event.type === "complete" || event.type === "cancelled";
    if (!isTerminal) mirrorSessionToRedis(session);
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

interface AgentEvidenceInput {
  retrievedSources: RetrievedSource[];
  useStrictAllowlist: boolean;
  retrievalFailure?: {
    code: string;
    retryable: boolean;
  };
  deepCoverage?: {
    rawStructuralPerQuery: number[];
    admittedPerQuery: number[];
    highestScorePerQuery: Array<number | null>;
    coveredQueries: number;
    distinctHosts: number;
    queryCount: number;
  };
}

const DEEP_VOC_DOMAINS = [
  "reddit.com",
  "indiehackers.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
];

async function prepareAgentEvidence(
  session: ResearchSession,
  agentId: AgentId,
  canUseRetrievedEvidence: boolean,
  signal?: AbortSignal,
  minimumSources: number = MIN_DEEP_RETRIEVED_SOURCES,
): Promise<AgentEvidenceInput> {
  const ledger = ensureEvidenceLedger(session);
  const entry = ledger.agents[agentId]!;
  const now = new Date().toISOString();

  if (!canUseRetrievedEvidence) {
    entry.retrieval = {
      status: "not_requested",
      sourceOrigin: "none",
      sourceCount: 0,
      sources: [],
    };
    entry.grounding = "ungrounded";
    entry.updatedAt = now;
    return { retrievedSources: [], useStrictAllowlist: false };
  }

  if (agentId === "synthesis") {
    const retrievedSources = specialistAllowlistedSourceUnion(session);
    entry.retrieval = {
      status: "not_requested",
      sourceOrigin: retrievedSources.length > 0 ? "specialist_union" : "none",
      sourceCount: retrievedSources.length,
      sources: retrievedSources,
    };
    entry.grounding = "ungrounded";
    entry.updatedAt = now;
    return {
      retrievedSources,
      useStrictAllowlist: retrievedSources.length > 0,
    };
  }

  const retrievalProvider = selectRetrievalProvider();
  if (retrievalProvider.isMock) {
    entry.retrieval = {
      status: "not_configured",
      sourceOrigin: "none",
      providerId: retrievalProvider.id,
      sourceCount: 0,
      sources: [],
    };
    entry.grounding = "ungrounded";
    entry.updatedAt = now;
    return { retrievedSources: [], useStrictAllowlist: false };
  }

  const deepRetrieval = session.mode === "deep";
  const focusedQueries = deepRetrieval
    ? buildDeepRetrievalQueries(session.query, agentId, session.keywords)
    : [buildFocusedRetrievalQuery(session.query, agentId)];
  const executedQueries = [...focusedQueries];
  const focusedQuery = focusedQueries[0];
  try {
    const primarySettled = await Promise.allSettled(
      focusedQueries.map((query, queryIndex) =>
        retrievalProvider.search({
          query,
          keywords: deepRetrieval ? undefined : session.keywords,
          agentId,
          maxResults: deepRetrieval ? 5 : 6,
          searchDepth: deepRetrieval ? "advanced" : "basic",
          includeDomains:
            deepRetrieval &&
            agentId === "pain-detective" &&
            queryIndex === 0 &&
            shouldRestrictDeepVocDomains(session.query, session.keywords)
              ? DEEP_VOC_DOMAINS
              : undefined,
          signal,
        }),
      ),
    );
    const failures = rejectedReasons(primarySettled);
    if (!deepRetrieval && primarySettled[0]?.status === "rejected") {
      throw primarySettled[0].reason;
    }
    if (
      deepRetrieval &&
      failures.length > 0 &&
      primarySettled.every((result) => result.status === "rejected")
    ) {
      throw preferredRetrievalFailure(failures);
    }
    const structuralResultSets = primarySettled.map((result) =>
      result.status === "fulfilled"
        ? (deepRetrieval ? deepStructuralSourceCandidates(result.value) : result.value)
        : [],
    );
    const resultSets = deepRetrieval
      ? structuralResultSets.map(admitDeepSourceCandidates)
      : structuralResultSets;
    const rawStructuralPerQuery = deepRetrieval
      ? structuralResultSets.map((sources) => sources.length)
      : [];
    const admittedPerQuery = deepRetrieval
      ? resultSets.map((sources) => sources.length)
      : [];
    const highestScorePerQuery = deepRetrieval
      ? structuralResultSets.map(highestDeepCandidateScore)
      : [];
    let deepSelection = deepRetrieval
      ? selectDeepRetrievedSources(resultSets, 8)
      : undefined;

    if (
      deepRetrieval &&
      deepSelection &&
      needsDeepRetrievalRescue(deepSelection, minimumSources)
    ) {
      const rescueQueries = buildDeepRetrievalRescueQueries(
        session.query,
        agentId,
        session.keywords,
      );
      for (const query of rescueQueries) {
        if (!needsDeepRetrievalRescue(deepSelection, minimumSources)) break;
        const excludedDomains = sourcePublisherDomains(deepSelection.sources);
        executedQueries.push(query);
        try {
          const rescueSources = await retrievalProvider.search({
            query,
            agentId,
            maxResults: 8,
            searchDepth: "advanced",
            excludeDomains: excludedDomains,
            signal,
          });
          const structuralSources = deepStructuralSourceCandidates(rescueSources);
          const admittedSources = admitDeepSourceCandidates(structuralSources);
          resultSets.push(admittedSources);
          rawStructuralPerQuery.push(structuralSources.length);
          admittedPerQuery.push(admittedSources.length);
          highestScorePerQuery.push(highestDeepCandidateScore(structuralSources));
        } catch (error) {
          failures.push(error);
          resultSets.push([]);
          rawStructuralPerQuery.push(0);
          admittedPerQuery.push(0);
          highestScorePerQuery.push(null);
          if (signal?.aborted) throw error;
        }
        deepSelection = selectDeepRetrievedSources(resultSets, 8);
      }
    }

    if (
      deepRetrieval &&
      deepSelection &&
      needsDeepRetrievalRescue(deepSelection, minimumSources) &&
      failures.length > 0
    ) {
      throw preferredRetrievalFailure(failures);
    }

    const rawSources = deepSelection?.sources ?? resultSets[0] ?? [];

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const retrievedSources = canonicalizeRetrievedSources(rawSources, agentId, now);
    entry.retrieval = {
      status: retrievedSources.length > 0 ? "retrieved" : "unavailable",
      sourceOrigin: retrievedSources.length > 0 ? "agent_retrieval" : "none",
      providerId: retrievalProvider.id,
      focusedQuery,
      ...(deepRetrieval ? { focusedQueries: executedQueries } : {}),
      sourceCount: retrievedSources.length,
      sources: retrievedSources,
      ...(retrievedSources.length === 0 ? { unavailableReason: "no_usable_sources" } : {}),
    };
    entry.grounding = "ungrounded";
    entry.updatedAt = new Date().toISOString();
    return {
      retrievedSources,
      useStrictAllowlist: retrievedSources.length > 0,
      ...(deepSelection
        ? {
            deepCoverage: {
              rawStructuralPerQuery,
              admittedPerQuery,
              highestScorePerQuery,
              coveredQueries: deepSelection.coveredQueries,
              distinctHosts: deepSelection.distinctHosts,
              queryCount: executedQueries.length,
            },
          }
        : {}),
    };
  } catch (error) {
    const aborted =
      signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    if (aborted) throw error;

    entry.retrieval = {
      status: "unavailable",
      sourceOrigin: "none",
      providerId: retrievalProvider.id,
      focusedQuery,
      ...(deepRetrieval ? { focusedQueries: executedQueries } : {}),
      sourceCount: 0,
      sources: [],
      // Keep provider exception text out of persisted sessions: upstream
      // errors can contain request metadata or credentials.
      unavailableReason: "retrieval_request_failed",
    };
    entry.grounding = "ungrounded";
    entry.updatedAt = new Date().toISOString();
    return {
      retrievedSources: [],
      useStrictAllowlist: false,
      retrievalFailure: error instanceof RetrievalError
        ? { code: error.code, retryable: error.retryable }
        : { code: "unexpected_failure", retryable: true },
    };
  }
}

function mergeSessionCitations(session: ResearchSession, citations: AgentOutput["citations"]): void {
  const seen = new Set(
    session.citations.map((citation) =>
      citation.url ? `url:${citation.url.trim().toLowerCase()}` : `id:${citation.id}`,
    ),
  );
  for (const citation of citations) {
    const key = citation.url ? `url:${citation.url.trim().toLowerCase()}` : `id:${citation.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    session.citations.push(citation);
  }
}

interface RunAgentExecutionOptions {
  signal?: AbortSignal;
  strict?: boolean;
  minimumRetrievedSources?: number;
  deadlineMessage?: string;
  publishEvents?: boolean;
}

function selectDeepRetrievedSources(
  resultSets: readonly (readonly RetrievedSource[])[],
  maxSources: number,
): { sources: RetrievedSource[]; coveredQueries: number; distinctHosts: number } {
  const merged: RetrievedSource[] = [];
  const seenUrls = new Set<string>();
  const publisherCounts = new Map<string, number>();
  const coveredQueryIndexes = new Set<number>();
  const maxLength = Math.max(0, ...resultSets.map((sources) => sources.length));
  for (let index = 0; index < maxLength && merged.length < maxSources; index += 1) {
    for (let queryIndex = 0; queryIndex < resultSets.length; queryIndex += 1) {
      const sources = resultSets[queryIndex];
      const source = sources[index];
      if (!source?.url) continue;
      const normalizedUrl = canonicalizeSafeExternalUrl(source.url);
      if (!normalizedUrl) continue;
      const publisherDomain = publisherDomainForUrl(normalizedUrl);
      if (
        !publisherDomain ||
        seenUrls.has(normalizedUrl) ||
        (publisherCounts.get(publisherDomain) ?? 0) >= 2
      ) continue;
      seenUrls.add(normalizedUrl);
      publisherCounts.set(
        publisherDomain,
        (publisherCounts.get(publisherDomain) ?? 0) + 1,
      );
      coveredQueryIndexes.add(queryIndex);
      merged.push({ ...source, url: normalizedUrl });
      if (merged.length >= maxSources) break;
    }
  }
  return {
    sources: merged,
    coveredQueries: coveredQueryIndexes.size,
    // Kept under the existing field name for the public progress contract;
    // the count is PSL-aware publisher domains, not attacker-controlled subdomains.
    distinctHosts: publisherCounts.size,
  };
}

function admitDeepSourceCandidates(
  sources: readonly RetrievedSource[],
): RetrievedSource[] {
  return deepStructuralSourceCandidates(sources).filter((source) =>
    source.score! >= DEEP_MIN_RETRIEVAL_SCORE,
  );
}

function deepStructuralSourceCandidates(
  sources: readonly RetrievedSource[],
): RetrievedSource[] {
  return sources.filter((source) =>
    typeof source.url === "string" &&
    source.url.trim().length > 0 &&
    typeof source.title === "string" &&
    source.title.trim().length > 0 &&
    typeof source.snippet === "string" &&
    source.snippet.trim().length > 0 &&
    typeof source.score === "number" &&
    Number.isFinite(source.score),
  );
}

function highestDeepCandidateScore(
  sources: readonly RetrievedSource[],
): number | null {
  if (sources.length === 0) return null;
  const highest = Math.max(...sources.map((source) => source.score!));
  const bounded = Math.max(0, Math.min(1, highest));
  return Math.round(bounded * 1_000) / 1_000;
}

function rejectedReasons(
  results: readonly PromiseSettledResult<unknown>[],
): unknown[] {
  return results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
}

function preferredRetrievalFailure(failures: readonly unknown[]): unknown {
  return (
    failures.find(
      (failure) => failure instanceof RetrievalError && failure.retryable,
    ) ??
    failures.find((failure) => failure instanceof RetrievalError) ??
    failures[0] ??
    new RetrievalError(
      "network_error",
      true,
      "Deep retrieval fan-out failed without a typed provider error.",
    )
  );
}

function needsDeepRetrievalRescue(
  selection: ReturnType<typeof selectDeepRetrievedSources>,
  minimumSources: number,
): boolean {
  return (
    selection.sources.length < minimumSources ||
    selection.coveredQueries < 2 ||
    selection.distinctHosts < 3
  );
}

function sourcePublisherDomains(sources: readonly RetrievedSource[]): string[] {
  const domains = new Set<string>();
  for (const source of sources) {
    const safeUrl = canonicalizeSafeExternalUrl(source.url);
    if (!safeUrl) continue;
    const publisherDomain = publisherDomainForUrl(safeUrl);
    if (publisherDomain) domains.add(publisherDomain);
  }
  return [...domains].slice(0, 20);
}

function publisherDomainForUrl(safeUrl: string): string {
  const hostname = new URL(safeUrl).hostname.toLowerCase();
  return getDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

// Simulate agent work progress with step-by-step updates.
// In a real implementation, this would call actual LLM + search tools.
async function runAgent(
  session: ResearchSession,
  agentId: AgentId,
  stepDelayMs: number = 400,
  deadlineAt: number = Date.now() + readStandardSessionBudgetMs(),
  execution: RunAgentExecutionOptions = {},
): Promise<AgentOutput> {
  const strict = execution.strict === true;
  const executionSignal = execution.signal ?? sessionAborts.get(session.id)?.signal;
  const deadlineMessage = execution.deadlineMessage ?? "Standard session deadline reached";
  const emitAgentEvent = (event: ResearchEvent) => {
    if (execution.publishEvents !== false) emitEvent(session.id, event);
  };
  const requestedMinimumSources = execution.minimumRetrievedSources;
  const minimumRetrievedSources = Number.isFinite(requestedMinimumSources)
    ? Math.max(
        MIN_DEEP_RETRIEVED_SOURCES,
        Math.min(
          MAX_DEEP_RETRIEVED_SOURCES,
          Math.floor(requestedMinimumSources!),
        ),
      )
    : MIN_DEEP_RETRIEVED_SOURCES;
  if (Date.now() >= deadlineAt) {
    throw new DOMException(deadlineMessage, "AbortError");
  }
  const steps = getAgentSteps(agentId);

  updateAgentState(session, agentId, {
    status: "running",
    startedAt: new Date().toISOString(),
    currentStep: steps[0],
    progress: 0,
    completedAt: undefined,
    output: undefined,
    error: undefined,
    degraded: undefined,
    degradedReason: undefined,
    resolvedProviderId: undefined,
  });

  emitAgentEvent({
    type: "status",
    agentId,
    timestamp: new Date().toISOString(),
    message: `${agentId} started`,
  });

  try {
    const selected = selectProvider(process.env, {
      failureMode: strict ? "throw" : "fallback",
    });
    const breakerOpen = !selected.isMock && breakerIsOpen("provider:" + selected.id);
    if (strict && selected.isMock) {
      throw new ResearchAgentStageError(
        "model_provider_unavailable",
        "Deep Research requires a configured real model provider.",
      );
    }
    if (strict && breakerOpen) {
      throw new ResearchAgentStageError(
        "provider_degraded",
        "The configured model provider is temporarily unavailable.",
        "breaker_open",
      );
    }
    const provider = breakerOpen ? mockResearchProvider : selected;

    for (let i = 0; i < steps.length; i++) {
      if (Date.now() >= deadlineAt) {
        throw new DOMException(deadlineMessage, "AbortError");
      }
      await sleep(stepDelayMs, { signal: executionSignal });

      if (isCancelled(session.id) || executionSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const progress = Math.round(((i + 1) / steps.length) * 80);
      updateAgentState(session, agentId, {
        currentStep: steps[i],
        progress,
      });

      emitAgentEvent({
        type: "progress",
        agentId,
        timestamp: new Date().toISOString(),
        data: { step: steps[i], progress },
      });
    }

    // Generate final output
    const allOutputs = getCompletedAgentOutputs(session);
    // If the breaker is open for the selected provider, short-circuit to mock
    // for this attempt. Retrieval is also skipped because mock output must not
    // inherit grounded status from sources it did not reason over.
    const evidenceInput = await prepareAgentEvidence(
      session,
      agentId,
      !provider.isMock,
      executionSignal,
      minimumRetrievedSources,
    );
    if (strict) {
      const retrieval = ensureEvidenceLedger(session).agents[agentId]!.retrieval;
      if (
        retrieval.status === "not_configured" ||
        (retrieval.status === "unavailable" &&
          retrieval.unavailableReason !== "no_usable_sources")
      ) {
        const failureCode = retrieval.status === "not_configured"
          ? "not_configured"
          : (evidenceInput.retrievalFailure?.code ?? "unexpected_failure");
        throw new ResearchAgentStageError(
          "retrieval_unavailable",
          `Deep Research retrieval provider is unavailable (${failureCode}).`,
          undefined,
          retrieval.status === "unavailable"
            ? (evidenceInput.retrievalFailure?.retryable ?? true)
            : false,
        );
      }
      if (
        session.mode === "deep" &&
        evidenceInput.deepCoverage &&
        (evidenceInput.retrievedSources.length < minimumRetrievedSources ||
          evidenceInput.deepCoverage.coveredQueries < 2 ||
          evidenceInput.deepCoverage.distinctHosts < 3)
      ) {
        throw new ResearchAgentStageError(
          "retrieval_insufficient",
          `Deep retrieval admitted ${evidenceInput.retrievedSources.length}/${minimumRetrievedSources} usable sources from ${evidenceInput.deepCoverage.coveredQueries}/${evidenceInput.deepCoverage.queryCount} queries across ${evidenceInput.deepCoverage.distinctHosts}/3 publisher domains after bounded diversity rescue; per-query raw structural counts ${JSON.stringify(evidenceInput.deepCoverage.rawStructuralPerQuery)}, admitted counts ${JSON.stringify(evidenceInput.deepCoverage.admittedPerQuery)}, highest scores ${JSON.stringify(evidenceInput.deepCoverage.highestScorePerQuery)}.`,
          undefined,
          false,
        );
      }
      if (evidenceInput.retrievedSources.length < minimumRetrievedSources) {
        throw new ResearchAgentStageError(
          "retrieval_insufficient",
          `Deep Research requires at least ${minimumRetrievedSources} usable retrieved sources for this specialist.`,
          undefined,
          false,
        );
      }
    }
        // R203: track per-agent whether we resolved to the real provider or
        // fell back to mock (so the UI can show a "demo data" badge).
        // isDegradedHere is `let` because the catch block below can flip it
        // when a real provider call throws. R204: degradedReasonCaptured is
        // set by the provider's onFallback callback with a finer-grained
        // reason (http_error / validation_error / ...) than the R203 catch.
        const resolvedProviderId = provider.id;
        let isDegradedHere = provider.id !== selected.id;
        let degradedReasonCaptured: NonNullable<AgentState["degradedReason"]> | undefined;
        let output: AgentOutput;
        const t0 = Date.now();
        let telemetryOk = true;
        let telemetryErr: string | undefined;
        // R216: timeout controller + handle must live outside the inner
        // try block so the finally below can clear the timer. (The
        // JS scoping rule: a finally clause cannot see const/let declared
        // inside its own try.)
        const timeoutController = new AbortController();
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
        // Snapshot whether the per-session cancel was already fired so
        // we can distinguish a user cancel (don't degrade) from a
        // timeout-induced abort (do degrade) later on.
        const userCancelledBeforeCall = executionSignal?.aborted === true;
        const useLimiter = !selected.isMock;
        // R241: the actual generate() call, factored out so it can be run
        // either directly (mock) or through the concurrency limiter (real
        // provider). The wall-clock timeout is armed INSIDE the limiter
        // closure so an agent queued behind siblings doesn't burn its 180s
        // budget merely waiting for a slot — the budget covers the LLM call
        // itself, not the queue wait.
        const runGenerate = async () => {
          const remainingSessionBudgetMs = deadlineAt - Date.now();
          if (remainingSessionBudgetMs <= 0 || executionSignal?.aborted) {
            throw new DOMException(deadlineMessage, "AbortError");
          }
          const agentTimeoutMs = Math.max(
            1,
            Math.min(readAgentTimeoutMs(), remainingSessionBudgetMs),
          );
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
            executionSignal
              ? AbortSignal.any([executionSignal, timeoutController.signal])
              : timeoutController.signal;
          // A user cancel that landed while we were queued for a slot should
          // abort here rather than fire a pointless (and billable) call.
          if (executionSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          return provider.generate(agentId, {
            query: session.query,
            keywords: session.keywords,
            upstream: allOutputs,
            retrievedSources:
              evidenceInput.retrievedSources.length > 0
                ? evidenceInput.retrievedSources
                : undefined,
            validationSummary:
              agentId === "synthesis"
                ? session.validation?.synthesisSummary
                : undefined,
            signal: combinedSignal,
            onProgress: (event) => {
              const overall = 80 + Math.round(event.fraction * 19);
              updateAgentState(session, agentId, {
                progress: Math.min(99, overall),
                currentStep: event.step || session.agents[agentId].currentStep,
              });
              emitAgentEvent({
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
          // A session-level abort is either an explicit cancel or the Standard
          // deadline. Never turn either into fresh mock output after the user
          // or budget has stopped execution.
          if (executionSignal?.aborted) throw e;
          telemetryOk = false;
          telemetryErr = e instanceof Error ? e.message : String(e);
          if (strict) {
            isDegradedHere = true;
            degradedReasonCaptured = isTimeoutAbort(e)
              ? "network_error"
              : "http_error";
            throw new ResearchAgentStageError(
              "provider_degraded",
              "The configured model provider did not complete this Deep Research stage.",
              degradedReasonCaptured,
            );
          }
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

    if (strict && isDegradedHere) {
      throw new ResearchAgentStageError(
        "provider_degraded",
        "The configured model provider degraded while executing this Deep Research stage.",
        degradedReasonCaptured ?? (breakerOpen ? "breaker_open" : "provider_fallback"),
      );
    }

    // Providers are expected to honor AbortSignal, but a non-compliant
    // adapter must not publish a late output after explicit cancellation or
    // the Standard session deadline.
    if (executionSignal?.aborted) {
      throw new DOMException(
        isCancelled(session.id) ? "Aborted" : deadlineMessage,
        "AbortError",
      );
    }

    // Retrieval may have succeeded before a real LLM silently fell back to
    // demo output. In that case retain compatibility semantics and keep the
    // ledger ungrounded; strict allowlisting would lend mock claims authority
    // they did not earn from the retrieved source set.
    const useStrictAllowlist =
      evidenceInput.useStrictAllowlist && !provider.isMock && !isDegradedHere;
    const allowlisted = allowlistAgentOutput(
      output,
      evidenceInput.retrievedSources,
      useStrictAllowlist ? "strict" : "compatible",
    );
    output = allowlisted.output;

    const evidenceEntry = ensureEvidenceLedger(session).agents[agentId]!;
    evidenceEntry.allowlist = allowlisted.stats;
    evidenceEntry.grounding =
      useStrictAllowlist && allowlisted.stats.matched > 0
        ? "grounded"
        : "ungrounded";
    evidenceEntry.updatedAt = new Date().toISOString();

    if (strict && (!useStrictAllowlist || allowlisted.stats.matched === 0)) {
      throw new ResearchAgentStageError(
        "evidence_insufficient",
        "The model output did not retain any citation from the retrieved evidence set.",
      );
    }

    mergeSessionCitations(session, output.citations);

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

    emitAgentEvent({
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
    emitAgentEvent({
      type: "error",
      agentId,
      timestamp: new Date().toISOString(),
      message,
    });
    throw err;
  }
}

function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError"),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Aborted", "AbortError"),
      );
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Execute exactly one specialist unit for the durable Deep Research worker.
 *
 * This seam deliberately does not synthesize, finalize, or transition the
 * overall session to a terminal state. The durable work graph owns those
 * lifecycle decisions. Strict mode is the default and never publishes mock
 * or ungrounded output as a completed specialist result.
 */
export async function runResearchAgentStage(
  sessionId: string,
  agentId: AgentId,
  options: RunResearchAgentStageOptions = {},
): Promise<ResearchAgentStageResult> {
  if (!SPECIALIST_AGENT_IDS.has(agentId)) {
    throw new ResearchAgentStageError(
      "invalid_agent",
      "The single-agent stage accepts specialist agents only.",
    );
  }

  const startedAt = Date.now();
  const requestedDeadline = options.deadlineAt ?? startedAt + MAX_DEEP_AGENT_STAGE_BUDGET_MS;
  const deadlineAt = Math.min(
    requestedDeadline,
    startedAt + MAX_DEEP_AGENT_STAGE_BUDGET_MS,
  );
  if (!Number.isFinite(deadlineAt) || deadlineAt <= startedAt) {
    throw new ResearchAgentStageError(
      "deadline_exceeded",
      "The Deep Research specialist stage deadline has already elapsed.",
    );
  }

  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineController.abort(
      new DOMException("Deep Research specialist stage deadline reached", "AbortError"),
    );
  }, deadlineAt - startedAt);
  const preflightSignal = options.signal
    ? AbortSignal.any([options.signal, deadlineController.signal])
    : deadlineController.signal;

  let session: ResearchSession | undefined;
  let remoteCancelTimer: ReturnType<typeof setInterval> | undefined;
  let remoteCancelPollInFlight = false;
  let remoteCancelled = false;
  const isolatedSnapshot = options.sessionSnapshot !== undefined;

  try {
    session = isolatedSnapshot
      ? structuredClone(options.sessionSnapshot)
      : sessions.get(sessionId);
    if (!session && !isolatedSnapshot) {
      session = await awaitWithSignal(hydrateSessionFromRedis(sessionId), preflightSignal);
    }
    if (!session) {
      throw new ResearchAgentStageError(
        "session_not_found",
        `Research session ${sessionId} was not found.`,
      );
    }
    if (session.id !== sessionId) {
      throw new ResearchAgentStageError(
        "session_not_runnable",
        "The provided research session snapshot does not match the requested session.",
      );
    }
    if (session.status === "cancelled" || isCancelled(sessionId)) {
      throw new ResearchAgentStageError(
        "session_cancelled",
        "The research session was cancelled before this stage started.",
      );
    }
    if (session.status === "completed" || session.status === "error") {
      throw new ResearchAgentStageError(
        "session_not_runnable",
        "A terminal research session cannot execute another specialist stage.",
      );
    }
    if (preflightSignal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // A leased work unit may be retried after a worker dies between model
    // completion and the fenced repository commit. Clear the target's stale
    // projection and rebuild the shared citation list from other committed
    // specialists before attempting the unit again.
    ensureEvidenceLedger(session).agents[agentId] = createAgentEvidenceEntry(agentId);
    session.citations = [];
    for (const [completedAgentId, state] of Object.entries(session.agents)) {
      if (completedAgentId === agentId || state.status !== "done" || !state.output) continue;
      mergeSessionCitations(session, state.output.citations);
    }

    const sessionController = isolatedSnapshot
      ? new AbortController()
      : sessionAborts.get(sessionId) ?? new AbortController();
    if (!isolatedSnapshot) sessionAborts.set(sessionId, sessionController);
    const executionSignal = AbortSignal.any([
      preflightSignal,
      sessionController.signal,
    ]);

    const pollRemoteCancellation = () => {
      if (remoteCancelPollInFlight || executionSignal.aborted) return;
      remoteCancelPollInFlight = true;
      const check = isolatedSnapshot
        ? isCancelledRemotely(sessionId)
        : awaitCancelFromRedis(sessionId);
      void check
        .then((cancelled) => {
          if (!cancelled) return;
          remoteCancelled = true;
          sessionController.abort(new DOMException("Aborted", "AbortError"));
        })
        .finally(() => {
          remoteCancelPollInFlight = false;
        });
    };
    pollRemoteCancellation();
    remoteCancelTimer = setInterval(
      pollRemoteCancellation,
      DEEP_CANCEL_POLL_INTERVAL_MS,
    );

    const stepDelayMs = Number.isFinite(options.stepDelayMs)
      ? Math.max(0, options.stepDelayMs ?? 0)
      : 400;
    const output = await runAgent(session, agentId, stepDelayMs, deadlineAt, {
      signal: executionSignal,
      strict: options.strict !== false,
      minimumRetrievedSources: options.minimumRetrievedSources,
      deadlineMessage: "Deep Research specialist stage deadline reached",
      // The durable runner owns all externally visible projection after a
      // successful lease/fence commit. Legacy events mirror directly to the
      // unfenced session store and therefore must not escape this stage.
      publishEvents: false,
    });
    return { output, session: structuredClone(session) };
  } catch (error) {
    if (deadlineController.signal.aborted || Date.now() >= deadlineAt) {
      throw new ResearchAgentStageError(
        "deadline_exceeded",
        "The Deep Research specialist stage exceeded its deadline.",
      );
    }
    if (remoteCancelled || session?.status === "cancelled" || isCancelled(sessionId)) {
      throw new ResearchAgentStageError(
        "session_cancelled",
        "The research session was cancelled while this stage was running.",
      );
    }
    if (options.signal?.aborted) {
      throw new ResearchAgentStageError(
        "aborted",
        "The Deep Research specialist stage was aborted by its caller.",
      );
    }
    if (error instanceof ResearchAgentStageError) throw error;
    const isAbortError =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    if (isAbortError) {
      throw new ResearchAgentStageError(
        "aborted",
        "The Deep Research specialist stage was aborted.",
      );
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    if (remoteCancelTimer) clearInterval(remoteCancelTimer);
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

const STANDARD_BUDGET_EXHAUSTED_MESSAGE =
  "Standard session deadline reached; partial dossier retained.";

function markStandardBudgetExhausted(session: ResearchSession): void {
  for (const agentId of Object.keys(session.agents) as AgentId[]) {
    const state = session.agents[agentId];
    if (state.status === "done" || state.status === "error") continue;
    updateAgentState(session, agentId, {
      status: "error",
      currentStep: STANDARD_BUDGET_EXHAUSTED_MESSAGE,
      error: STANDARD_BUDGET_EXHAUSTED_MESSAGE,
    });
  }
}

function isTerminalResearchSession(session: ResearchSession): boolean {
  return (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "error"
  );
}

export async function runResearchSession(
  sessionId: string,
  options?: { speedMultiplier?: number },
): Promise<ResearchSession> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Sessions persisted before the mode contract have no `mode`; normalize
  // them at the execution seam so legacy Standard runs remain recoverable.
  session.mode = normalizeResearchMode(session.mode);
  const modeCapabilities = getResearchModeConfig(session.mode);
  if (modeCapabilities.availability !== "available") {
    throw new Error(modeCapabilities.capabilityNotice);
  }
  ensureEvidenceLedger(session);

  if (session.status === "running") {
    return session; // already running
  }

  session.status = "running";
  session.updatedAt = new Date().toISOString();
  // Enqueue the running transition so it cannot complete after a later final
  // revision from this process.
  void enqueueSessionSnapshot(session);

  const stepDelay = 300 / (options?.speedMultiplier || 1);
  const sessionBudgetMs = readStandardSessionBudgetMs();
  const deadlineAt = Date.now() + sessionBudgetMs;
  const sessionAbort = sessionAborts.get(sessionId) ?? new AbortController();
  sessionAborts.set(sessionId, sessionAbort);
  let budgetExpired = false;
  const budgetTimer = setTimeout(() => {
    budgetExpired = true;
    sessionAbort.abort(
      new DOMException("Standard session deadline reached", "AbortError"),
    );
  }, sessionBudgetMs);
  let remoteCancelPollInFlight = false;
  const remoteCancelTimer = setInterval(() => {
    if (remoteCancelPollInFlight || isCancelled(sessionId)) return;
    remoteCancelPollInFlight = true;
    void awaitCancelFromRedis(sessionId).finally(() => {
      remoteCancelPollInFlight = false;
    });
  }, 500);

  try {
    // R244: dispatch lightest specialists first while preserving the 5-agent
    // parallel model. The shared deadline signal covers progress sleeps,
    // retrieval, limiter queue wait, and provider generation.
    const researchAgentIds: AgentId[] = [
      "pricing-scout",
      "channel-scout",
      "pain-detective",
      "competitor-analyst",
      "market-sizer",
    ];

    const settled = await Promise.allSettled(
      researchAgentIds.map((agentId) =>
        runAgent(session, agentId, stepDelay, deadlineAt),
      ),
    );

    if (budgetExpired || Date.now() >= deadlineAt) {
      budgetExpired = true;
      markStandardBudgetExhausted(session);
    }

    // One structural evidence-integrity pass, first captured after all five
    // specialists settle. The final rebuild remains the same pass revision.
    const validationSnapshotAt = new Date().toISOString();
    session.validation = buildResearchValidation(session, validationSnapshotAt);
    session.updatedAt = validationSnapshotAt;
    void enqueueSessionSnapshot(session);

    if (isCancelled(sessionId)) {
      session.status = "cancelled";
      session.updatedAt = new Date().toISOString();
      await checkpointTerminalSession(session, "cancelled", "Research cancelled");
      cancelledSessions.delete(sessionId);
      return session;
    }

    const failedAgents = settled
      .map((result, index) => ({ agentId: researchAgentIds[index], result }))
      .filter((entry) => entry.result.status === "rejected");

    if (failedAgents.length > 0 && !budgetExpired) {
      console.error(
        `[research] session ${sessionId}: ${failedAgents.length} agent(s) failed`,
        failedAgents.map((failure) => failure.agentId),
      );
    }

    const completed = settled.filter((result) => result.status === "fulfilled").length;
    if (!budgetExpired && completed >= 3) {
      try {
        await runAgent(session, "synthesis", stepDelay, deadlineAt);
      } catch (err) {
        if (Date.now() >= deadlineAt || sessionAbort.signal.aborted) {
          budgetExpired = !isCancelled(sessionId);
          if (budgetExpired) markStandardBudgetExhausted(session);
        } else {
          console.error(`[research] synthesis failed for ${sessionId}:`, err);
        }
      }
    } else if (!budgetExpired) {
      updateAgentState(session, "synthesis", {
        status: "error",
        currentStep: "Skipped: too many upstream agent failures",
        error: "Too many specialist agents failed to produce a synthesis.",
      });
    }

    const finalValidationAt = new Date().toISOString();
    session.validation = buildResearchValidation(session, finalValidationAt);
    session.updatedAt = finalValidationAt;

    if (isCancelled(sessionId)) {
      session.status = "cancelled";
      session.updatedAt = new Date().toISOString();
      await checkpointTerminalSession(session, "cancelled", "Research cancelled");
      cancelledSessions.delete(sessionId);
      return session;
    }

    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    const completionMessage = budgetExpired
      ? "Research completed with partial results after reaching the Standard session deadline"
      : "Research complete";
    await checkpointTerminalSession(session, "completed", completionMessage);

    await recordResearchFunnelEvent("research_completed", session.id, {
      mode: session.mode,
      stage2: session.stage2Tracking,
    });

    return session;
  } finally {
    clearTimeout(budgetTimer);
    clearInterval(remoteCancelTimer);
    if (isTerminalResearchSession(session)) {
      sessionAborts.delete(sessionId);
    }
  }
}


/** Subscribe to session events. Returns an unsubscribe function. */
export function subscribeToSession(
  sessionId: string,
  listener: (event: ResearchEvent) => void,
): () => void {
  let set = eventListeners.get(sessionId);
  if (!set) { set = new Set(); eventListeners.set(sessionId, set); }
  set.add(listener);
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
            if (a.keywords.join("\u001f") !== b.keywords.join("\u001f")) return false;
  if (a.citations.length !== b.citations.length) return false;
  const aIds = Object.keys(a.agents).sort().join(",");
  const bIds = Object.keys(b.agents).sort().join(",");
  if (aIds !== bIds) return false;
  if ((a.createdAt || "") !== (b.createdAt || "")) return false;
  return true;
}

