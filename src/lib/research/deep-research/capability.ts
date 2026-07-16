import { selectProvider } from "@/lib/providers/provider-registry";
import { selectStructuredCompletionProvider } from "@/lib/providers/structured-completion-registry";
import { getRedis } from "@/lib/research/redis-client";
import { RESEARCH_MODE_CONFIGS } from "@/lib/research/research-modes";
import { isSafeProviderBaseUrl } from "@/lib/security/provider-base-url";
import {
  resolveProviderCredentials,
  type LlmProvider,
  type ResolvedProviderCredential,
} from "@/lib/admin/provider-credentials";
import {
  isManagedKeyringEnabled,
  resolveManagedKeyringProvider,
} from "@/lib/providers/managed-keyring-config";
import {
  readRecoveryHeartbeat,
  readRecoveryHistory,
  MIN_CONSECUTIVE_OK_FOR_HEALTHY,
  type RecoveryHeartbeat,
  type RecoveryHistoryEntry,
} from "./recovery-heartbeat";
import {
  QSTASH_RECOVERY_PRODUCTION_URL,
  QSTASH_RECOVERY_SCHEDULE_ID,
} from "./qstash-recovery-auth";

export type DeepCapabilityRequirementId =
  | "explicit_opt_in"
  | "durable_state"
  | "generation_provider"
  | "retrieval_provider"
  | "semantic_reviewer"
  | "worker_wake"
  | "independent_recovery"
  | "recovery_freshness";

/**
 * Discrete states for the independent-recovery capability observation:
 *
 *   - `configured`: cron recovery is structurally declared (env OK) but
 *     no heartbeat has ever been observed yet (cold deploy, fresh Redis,
 *     or post-reset). The scheduler has not yet proven it can fire.
 *
 *   - `warming`: at least one successful tick has been observed but the
 *     series is too short (`MIN_CONSECUTIVE_OK_FOR_HEALTHY`) to call the
 *     scheduler reliable. New deployments and Preview environments live
 *     here until the series fills.
 *
 *   - `healthy`: at least `MIN_CONSECUTIVE_OK_FOR_HEALTHY` consecutive
 *     successful ticks are visible in the rolling history AND the most
 *     recent tick is within the freshness budget. The scheduler is
 *     observably meeting its cadence.
 *
 *   - `delayed`: a healthy series exists but the latest tick is older
 *     than the freshness budget, OR the last observed tick failed. The
 *     scheduler stopped firing or has started failing.
 *
 * The state is reported via the `recovery_freshness` requirement; the
 * `recoveryState` field on `DeepResearchCapability` exposes the same
 * value to callers that want to drive UI without re-parsing the detail.
 */
export type RecoveryState = "configured" | "warming" | "healthy" | "delayed";

export interface RecoveryObservation {
  state: RecoveryState;
  /** Number of consecutive ok ticks at the tail of the rolling history. */
  consecutiveOk: number;
  /** Number of ticks required for the gate to call the series healthy. */
  requiredForHealthy: number;
  /** Most recent tick timestamp (ISO) or null if no tick was ever observed. */
  lastTickAt: string | null;
  /** Milliseconds since the most recent tick; null if none observed. */
  lastTickAgeMs: number | null;
  /** Whether the most recent tick was successful. */
  lastTickOk: boolean;
  /** Detailed reason string suitable for UI rendering. */
  detail: string;
  /** Total observed ticks across the bounded history window. */
  observedTicks: number;
  /** Number of failed ticks across the bounded history window. */
  observedFailures: number;
  /** Smallest interval in the tail window used for cadence proof. */
  minObservedIntervalMs: number | null;
  /** Largest interval in the tail window used for cadence proof. */
  maxObservedIntervalMs: number | null;
  /** Wall-clock span covered by the tail window used for cadence proof. */
  cadenceSpanMs: number | null;
}

export interface DeepCapabilityRequirement {
  id: DeepCapabilityRequirementId;
  ready: boolean;
  label: string;
  detail: string;
}

export interface DeepResearchCapability {
  mode: "deep";
  id: "deep";
  label: string;
  description: string;
  depthLabel: string;
  availability: "available" | "preview";
  /** True when a required control is unmet AND the heart-beat is also stale. */
  degraded?: boolean;
  checkedAt: string;
  requirements: DeepCapabilityRequirement[];
  blockers: DeepCapabilityRequirementId[];
  capabilityNotice: string;
  expectedDurationSec: { min: number; max: number };
  expectedDurationLabel: string;
  validationPasses: 3;
  retrieval: "required";
  requiresAsyncExecution: true;
  maxSynchronousDurationSec: 300;
  /** Last successful recovery tick timestamp (ISO) or null if never. */
  lastRecoveryAt: string | null;
  /** Milliseconds since the last successful tick; null if never. */
  lastRecoveryAgeMs: number | null;
  /** Discrete recovery state derived from the rolling heartbeat series. */
  recoveryState: RecoveryState;
  /** Detailed recovery observation (consecutive-ok count, ticks, age, etc.). */
  recoveryObservation: RecoveryObservation;
}

export interface ProbeDeepCapabilityOptions {
  env?: Readonly<Record<string, string | undefined>>;
  probeRedis?: () => Promise<boolean>;
  readHeartbeat?: () => Promise<RecoveryHeartbeat>;
  readHistory?: () => Promise<RecoveryHistoryEntry[]>;
  resolveManagedCredentials?: (provider: LlmProvider, observedAt: Date) => Promise<boolean>;
  now?: () => Date;
}

const MIN_RECOVERY_DELAY_SECONDS = 60;
const MAX_RECOVERY_DELAY_SECONDS = 6 * 60;
const DEFAULT_MAX_RECOVERY_FRESHNESS_MS = MAX_RECOVERY_DELAY_SECONDS * 1000;

/** Configuration + reachability gate. It never tests capability with paid model calls. */
export async function probeDeepResearchCapability(
  options: ProbeDeepCapabilityOptions = {},
): Promise<DeepResearchCapability> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const observedAt = now();
  const explicitOptIn = env.LAUNCHLENS_DEEP_ENABLED === "1";
  const redisConfigured = hasRedisPair(env);
  let redisReachable = false;
  if (redisConfigured) {
    try {
      redisReachable = await (options.probeRedis ?? defaultRedisProbe)();
    } catch {
      redisReachable = false;
    }
  }

  const generation = selectProvider(env as NodeJS.ProcessEnv);
  const reviewer = selectStructuredCompletionProvider(env);
  const keyringEnabled = isManagedKeyringEnabled(env);
  const keyringProvider = resolveManagedKeyringProvider(env);
  let managedCredentialsReady = !keyringEnabled;
  if (keyringProvider && redisReachable) {
    try {
      managedCredentialsReady = await (
        options.resolveManagedCredentials ?? defaultResolveManagedCredentials
      )(keyringProvider, observedAt);
    } catch {
      managedCredentialsReady = false;
    }
  }
  const generationReady = !generation.isMock && managedCredentialsReady;
  const reviewerReady =
    reviewer.kind === "configured" &&
    !reviewer.provider.isMock &&
    managedCredentialsReady;
  const retrievalReady = hasRealRetrievalConfiguration(env);
  const workerOrigin = resolveDeepWorkerOrigin(env);
  const workerSecretReady = (env.LAUNCHLENS_DEEP_WORKER_SECRET?.length ?? 0) >= 24;
  const recoveryDelay = parsePositiveInteger(env.LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS);
  const recoverySource = resolveRecoverySource(env.LAUNCHLENS_DEEP_RECOVERY_SOURCE);
  const qstashBinding = resolveQStashRecoveryBinding(env);
  const recoveryReady =
    env.LAUNCHLENS_DEEP_RECOVERY_MODE === "cron" &&
    recoveryDelay !== null &&
    recoveryDelay >= MIN_RECOVERY_DELAY_SECONDS &&
    recoveryDelay <= MAX_RECOVERY_DELAY_SECONDS &&
    recoverySource === "qstash" &&
    qstashBinding.ready;

  // Heartbeat freshness & series: only meaningful when the cron recovery
  // is the declared mechanism. The freshness threshold is the smaller of
  // the declared max delay and 6 minutes — the system's recovery budget.
  // The state is derived from the rolling history so a single sample
  // cannot unlock the gate.
  const readHb = options.readHeartbeat ?? defaultReadHeartbeat;
  const readHistory = options.readHistory ?? defaultReadHistory;
  const [heartbeat, history] = await Promise.all([readHb(), readHistory()]);
  const qstashScopeReady = recoverySource === "qstash" &&
    qstashBinding.scheduleId !== null &&
    qstashBinding.destination !== null;
  const scopedHistory = qstashScopeReady
    ? history.filter((entry) =>
      entry.source === "qstash" &&
      entry.scheduleId === qstashBinding.scheduleId &&
      entry.destination === qstashBinding.destination)
    : [];
  const scopedHeartbeat = !qstashScopeReady || !heartbeatMatchesQStashBinding(
    heartbeat,
    qstashBinding,
  )
    ? { ...heartbeat, lastOkAt: null }
    : heartbeat;
  const freshnessBudgetMs = Math.min(
    (recoveryDelay ?? 0) * 1000,
    DEFAULT_MAX_RECOVERY_FRESHNESS_MS,
  );
  const recoveryObservation = computeRecoveryObservation({
    history: scopedHistory,
    heartbeat: scopedHeartbeat,
    freshnessBudgetMs,
    now: observedAt,
    recoveryDeclared: recoveryReady,
  });
  const lastRecoveryAt = qstashScopeReady
    ? latestSuccessfulTickAt(scopedHistory) ?? scopedHeartbeat.lastOkAt
    : null;
  const lastRecoveryAgeMs = lastTickAgeFromObservation(recoveryObservation);
  const heartbeatFresh =
    recoveryObservation.state === "healthy";

  const requirements: DeepCapabilityRequirement[] = [
    {
      id: "explicit_opt_in",
      ready: explicitOptIn,
      label: "Operator opt-in",
      detail: explicitOptIn
        ? "Deep execution is explicitly enabled."
        : "Set LAUNCHLENS_DEEP_ENABLED=1 only after every production dependency is verified.",
    },
    {
      id: "durable_state",
      ready: redisConfigured && redisReachable,
      label: "Durable state",
      detail: !redisConfigured
        ? "Upstash Redis is not configured."
        : redisReachable
          ? "Redis authority is reachable."
          : "Redis is configured but the authority probe failed.",
    },
    {
      id: "generation_provider",
      ready: generationReady,
      label: "Research model",
      detail: !generationReady
        ? keyringEnabled
          ? "The managed keyring must contain at least one enabled, decryptable provider credential."
          : "A real generation provider is required; mock fallback is forbidden."
        : `Configured provider: ${generation.id}.`,
    },
    {
      id: "retrieval_provider",
      ready: retrievalReady,
      label: "Independent retrieval",
      detail: retrievalReady
        ? "A real Tavily retrieval configuration is present."
        : "Tavily retrieval must be configured and mock retrieval must not be forced.",
    },
    {
      id: "semantic_reviewer",
      ready: reviewerReady,
      label: "Semantic reviewer",
      detail:
        reviewerReady && reviewer.kind === "configured"
          ? `Structured reviewer: ${reviewer.provider.id} (${reviewer.provider.model}).`
          : "A strict structured-completion reviewer is required.",
    },
    {
      id: "worker_wake",
      ready: Boolean(workerOrigin) && workerSecretReady,
      label: "Worker wake",
      detail:
        Boolean(workerOrigin) && workerSecretReady
          ? "Authenticated fast worker wake is configured."
          : "Configure a worker origin and a dedicated secret of at least 24 characters.",
    },
    {
      id: "independent_recovery",
      ready: recoveryReady,
      label: "Independent recovery",
      detail: recoveryReady
        ? `QStash recovery is bound to schedule ${qstashBinding.scheduleId} and the exact production destination with a maximum ${recoveryDelay}-second delay.`
        : `QStash recovery requires a declared delay of ${MIN_RECOVERY_DELAY_SECONDS}-${MAX_RECOVERY_DELAY_SECONDS} seconds, both distinct signing keys, the fixed schedule id, and the exact HTTPS production scheduler URL.`,
    },
    {
      id: "recovery_freshness",
      ready: heartbeatFresh,
      label: "Recovery heartbeat",
      detail: !recoveryReady
        ? "Skipped: independent recovery is not declared."
        : describeRecoveryState(recoveryObservation),
    },
  ];
  const blockers = requirements
    .filter((item) => item.id !== "recovery_freshness" && !item.ready)
    .map((item) => item.id);
  const recoveryDeclared = recoveryReady;
  // Available iff: every required control is ready AND the recovery
  // series is healthy (or recovery is not declared — handled by blockers).
  // A `warming` series shows the scheduler hasn't yet proven its cadence;
  // a `delayed` series means the cron source stopped firing.
  const available = blockers.length === 0 && (
    !recoveryDeclared || recoveryObservation.state === "healthy"
  );
  const degraded = recoveryDeclared && recoveryObservation.state === "delayed" && blockers.length === 0;
  return {
    mode: "deep",
    id: "deep",
    label: RESEARCH_MODE_CONFIGS.deep.label,
    description: RESEARCH_MODE_CONFIGS.deep.description,
    depthLabel: RESEARCH_MODE_CONFIGS.deep.depthLabel,
    availability: available ? "available" : "preview",
    degraded,
    checkedAt: observedAt.toISOString(),
    requirements,
    blockers,
    capabilityNotice: available
      ? "Durable 10-20 minute Deep Research is ready with mandatory retrieval and three semantic validation passes."
      : degraded
        ? "Independent recovery trigger was healthy but the latest observed tick exceeded the budget. The cron source may have stopped firing; check QStash or the configured external scheduler and the heartbeat history."
        : blockers.length === 0 && recoveryObservation.state === "warming"
          ? `Independent recovery is configured and the first ticks have been observed (${recoveryObservation.consecutiveOk} ok of ${recoveryObservation.requiredForHealthy} needed). Showing Preview while the series fills.`
          : `Durable async Deep Research remains Preview until ${blockers.length} production requirement${blockers.length === 1 ? "" : "s"} are ready.`,
    expectedDurationSec: { ...RESEARCH_MODE_CONFIGS.deep.expectedDurationSec },
    expectedDurationLabel: RESEARCH_MODE_CONFIGS.deep.expectedDurationLabel,
    validationPasses: 3,
    retrieval: "required",
    requiresAsyncExecution: true,
    maxSynchronousDurationSec: 300,
    lastRecoveryAt,
    lastRecoveryAgeMs,
    recoveryState: recoveryObservation.state,
    recoveryObservation,
  };
}

export function resolveDeepWorkerOrigin(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const explicitOrigin = env.LAUNCHLENS_DEEP_WORKER_BASE_URL?.trim();
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  const vercelOrigin = vercelEnvironment === "production"
    ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
    : env.VERCEL_URL;
  const raw = explicitOrigin || vercelOrigin?.trim() || "";
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function hasRedisPair(env: Readonly<Record<string, string | undefined>>): boolean {
  return Boolean(
    (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) ||
      (env.KV_REST_API_URL && env.KV_REST_API_TOKEN),
  );
}

function hasRealRetrievalConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const forced = env.LAUNCHLENS_SEARCH_PROVIDER?.toLowerCase();
  if (forced === "mock") return false;
  if (forced && forced !== "tavily") return false;
  return Boolean(env.TAVILY_API_KEY) && isSafeProviderBaseUrl(
    env.TAVILY_BASE_URL,
    "https://api.tavily.com",
    { nodeEnv: env.NODE_ENV },
  );
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type RecoverySource = "qstash";

interface QStashRecoveryBinding {
  ready: boolean;
  scheduleId: string | null;
  destination: string | null;
}

function resolveRecoverySource(value: string | undefined): RecoverySource | null {
  const normalized = value?.trim();
  if (normalized === "qstash") return "qstash";
  return null;
}

function resolveQStashRecoveryBinding(
  env: Readonly<Record<string, string | undefined>>,
): QStashRecoveryBinding {
  // The LaunchLens-prefixed names allow a dedicated recovery configuration;
  // the standard Upstash names remain a compatibility fallback. A non-empty
  // custom value deliberately wins so an explicitly bad override fails closed.
  const currentSigningKey = preferredQStashValue(
    env.LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY,
    env.QSTASH_CURRENT_SIGNING_KEY,
  );
  const nextSigningKey = preferredQStashValue(
    env.LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY,
    env.QSTASH_NEXT_SIGNING_KEY,
  );
  const configuredScheduleId = exactNonEmptyValue(
    env.LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID,
  );
  const scheduleId = configuredScheduleId === QSTASH_RECOVERY_SCHEDULE_ID
    ? QSTASH_RECOVERY_SCHEDULE_ID
    : null;
  const configuredDestination = exactHttpsRecoveryUrl(
    env.LAUNCHLENS_QSTASH_RECOVERY_URL,
  );
  const destination = configuredDestination === QSTASH_RECOVERY_PRODUCTION_URL
    ? QSTASH_RECOVERY_PRODUCTION_URL
    : null;
  const signingKeysReady =
    isSigningKey(currentSigningKey) &&
    isSigningKey(nextSigningKey) &&
    currentSigningKey !== nextSigningKey;
  return {
    ready: signingKeysReady && scheduleId !== null && destination !== null,
    scheduleId,
    destination,
  };
}

function preferredQStashValue(
  preferred: string | undefined,
  fallback: string | undefined,
): string | null {
  const preferredTrimmed = preferred?.trim();
  if (preferredTrimmed) return preferredTrimmed;
  const fallbackTrimmed = fallback?.trim();
  return fallbackTrimmed || null;
}

function isSigningKey(value: string | null): value is string {
  return value !== null && value.length >= 24;
}

function exactNonEmptyValue(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  return value.length <= 256 ? value : null;
}

function exactHttpsRecoveryUrl(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.pathname !== "/api/cron/scheduler" || url.search || url.hash) return null;
    // Reject alternative textual forms (default ports, dot-segments, etc.).
    // Heartbeat provenance is compared byte-for-byte with this exact value.
    return url.toString() === value ? value : null;
  } catch {
    return null;
  }
}

function heartbeatMatchesQStashBinding(
  heartbeat: RecoveryHeartbeat,
  binding: QStashRecoveryBinding,
): boolean {
  return Boolean(
    binding.scheduleId &&
    binding.destination &&
    heartbeat.source === "qstash" &&
    heartbeat.scheduleId === binding.scheduleId &&
    heartbeat.destination === binding.destination,
  );
}

function latestSuccessfulTickAt(history: RecoveryHistoryEntry[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].ok) return history[index].at;
  }
  return null;
}

async function defaultRedisProbe(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  return (await redis.ping()) === "PONG";
}

async function defaultReadHeartbeat(): Promise<RecoveryHeartbeat> {
  return readRecoveryHeartbeat();
}

async function defaultReadHistory(): Promise<RecoveryHistoryEntry[]> {
  return readRecoveryHistory();
}

async function defaultResolveManagedCredentials(
  provider: LlmProvider,
  observedAt: Date,
): Promise<boolean> {
  const credentials = await resolveProviderCredentials(provider);
  return credentials.some((credential) =>
    isManagedCredentialAdmissible(credential, observedAt),
  );
}

export function isManagedCredentialAdmissible(
  credential: Pick<ResolvedProviderCredential, "health">,
  observedAt: Date,
): boolean {
  if (credential.health.status !== "cooldown") return true;
  if (!credential.health.cooldownUntil) return false;
  const cooldownUntil = Date.parse(credential.health.cooldownUntil);
  return Number.isFinite(cooldownUntil) && cooldownUntil <= observedAt.getTime();
}

/**
 * R1C: derive the discrete recovery state from the bounded history
 * series plus the latest-heartbeat freshness. The state machine is:
 *
 *   configured  no ticks observed at all
 *   warming     one or more ticks observed but the tail does not yet
 *               contain MIN_CONSECUTIVE_OK_FOR_HEALTHY consecutive oks
 *   healthy     tail has >= MIN_CONSECUTIVE_OK_FOR_HEALTHY consecutive
 *               oks AND the latest tick is within the freshness budget
 *   delayed     latest tick is older than the budget OR the latest
 *               tick failed; even a previously-healthy series decays
 *               to delayed if the cron source stops firing
 *
 * The function is pure — it does not read Redis. Callers are
 * responsible for fetching `heartbeat` and `history`.
 */
export function computeRecoveryObservation(args: {
  history: RecoveryHistoryEntry[];
  heartbeat: RecoveryHeartbeat;
  freshnessBudgetMs: number;
  recoveryDeclared: boolean;
  now: Date;
  requiredForHealthy?: number;
}): RecoveryObservation {
  const required = args.requiredForHealthy ?? MIN_CONSECUTIVE_OK_FOR_HEALTHY;
  const series = args.history ?? [];
  const last = series.length > 0 ? series[series.length - 1] : null;
  const lastTickAt = last?.at ?? args.heartbeat.lastOkAt ?? null;
  const lastTickAgeMs = lastTickAt
    ? Math.max(0, args.now.getTime() - new Date(lastTickAt).getTime())
    : null;
  const lastTickOk = last?.ok ?? false;
  const observedTicks = series.length;
  const observedFailures = series.reduce((n, entry) => n + (entry.ok ? 0 : 1), 0);
  let consecutiveOk = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (!series[i].ok) break;
    consecutiveOk++;
  }
  const cadenceWindow = series.slice(-Math.min(required, consecutiveOk));
  const cadenceTimes = cadenceWindow.map((entry) => new Date(entry.at).getTime());
  const cadenceIntervals = cadenceTimes.slice(1).map((time, index) => time - cadenceTimes[index]);
  const cadenceTimestampsValid = cadenceTimes.every(Number.isFinite) && cadenceIntervals.every((value) => value > 0);
  const minObservedIntervalMs = cadenceIntervals.length > 0 && cadenceTimestampsValid
    ? Math.min(...cadenceIntervals)
    : null;
  const maxObservedIntervalMs = cadenceIntervals.length > 0 && cadenceTimestampsValid
    ? Math.max(...cadenceIntervals)
    : null;
  const cadenceSpanMs = cadenceTimes.length > 1 && cadenceTimestampsValid
    ? cadenceTimes[cadenceTimes.length - 1] - cadenceTimes[0]
    : null;
  const cadenceMetrics = { minObservedIntervalMs, maxObservedIntervalMs, cadenceSpanMs };
  if (!args.recoveryDeclared) {
    return {
      state: "configured",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: "Independent recovery is not declared; the heartbeat series is observed but does not gate availability.",
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  if (observedTicks === 0) {
    return {
      state: "configured",
      consecutiveOk: 0,
      requiredForHealthy: required,
      lastTickAt: null,
      lastTickAgeMs: null,
      lastTickOk: false,
      detail: "No recovery tick observed yet. The cron trigger has not completed a tick since the last deploy.",
      observedTicks: 0,
      observedFailures: 0,
      ...cadenceMetrics,
    };
  }
  // We have at least one tick. The latest tick is the arbiter of `delayed`.
  if (!lastTickOk || lastTickAgeMs === null || lastTickAgeMs > args.freshnessBudgetMs) {
    const reason = !lastTickOk
      ? "the most recent tick failed"
      : lastTickAgeMs === null
        ? "the most recent tick has no timestamp"
        : `the most recent tick is ${Math.round(lastTickAgeMs / 1000)}s old, exceeding the ${Math.round(args.freshnessBudgetMs / 1000)}s budget`;
    return {
      state: "delayed",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: `Recovery is delayed because ${reason}. ${consecutiveOk} consecutive ok tick${consecutiveOk === 1 ? "" : "s"} observed at the tail.`,
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  if (consecutiveOk < required) {
    return {
      state: "warming",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: `Recovery is warming: ${consecutiveOk} consecutive ok tick${consecutiveOk === 1 ? "" : "s"} observed; ${required} are required to call the scheduler healthy.`,
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  const minimumProofIntervalMs = Math.min(
    60_000,
    Math.max(1, Math.floor(args.freshnessBudgetMs / 2)),
  );
  if (!cadenceTimestampsValid || cadenceIntervals.length < required - 1) {
    return {
      state: "warming",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: "Recovery is warming: the scheduler has not produced a complete, chronological cadence window yet.",
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  if (maxObservedIntervalMs !== null && maxObservedIntervalMs > args.freshnessBudgetMs) {
    return {
      state: "delayed",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: `Recovery is delayed because the observed maximum interval is ${Math.round(maxObservedIntervalMs / 1000)}s, exceeding the ${Math.round(args.freshnessBudgetMs / 1000)}s budget.`,
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  if (minObservedIntervalMs !== null && minObservedIntervalMs < minimumProofIntervalMs) {
    return {
      state: "warming",
      consecutiveOk,
      requiredForHealthy: required,
      lastTickAt,
      lastTickAgeMs,
      lastTickOk,
      detail: `Recovery is warming: ticks arrived only ${Math.round(minObservedIntervalMs / 1000)}s apart, below the ${Math.round(minimumProofIntervalMs / 1000)}s minimum observation interval, so a manual burst cannot prove scheduler cadence.`,
      observedTicks,
      observedFailures,
      ...cadenceMetrics,
    };
  }
  return {
    state: "healthy",
    consecutiveOk,
    requiredForHealthy: required,
    lastTickAt,
    lastTickAgeMs,
    lastTickOk,
    detail: `Recovery is healthy: ${consecutiveOk} consecutive ok ticks at the tail; maximum observed interval ${Math.round((maxObservedIntervalMs ?? 0) / 1000)}s; the most recent completed ${Math.round(lastTickAgeMs / 1000)}s ago.`,
    observedTicks,
    observedFailures,
    ...cadenceMetrics,
  };
}

/**
 * Convert a recovery observation into a UI-friendly copy fragment.
 * Distinct copy for each of the four states; identical shape across
 * environments so a screenshot test can pin the wording.
 */
export function describeRecoveryState(observation: RecoveryObservation): string {
  return observation.detail;
}

function lastTickAgeFromObservation(observation: RecoveryObservation): number | null {
  if (observation.state === "configured") return null;
  return observation.lastTickAgeMs;
}
