import { selectProvider } from "@/lib/providers/provider-registry";
import { selectStructuredCompletionProvider } from "@/lib/providers/structured-completion-registry";
import { getRedis } from "@/lib/research/redis-client";
import { RESEARCH_MODE_CONFIGS } from "@/lib/research/research-modes";
import { isSafeProviderBaseUrl } from "@/lib/security/provider-base-url";

export type DeepCapabilityRequirementId =
  | "explicit_opt_in"
  | "durable_state"
  | "generation_provider"
  | "retrieval_provider"
  | "semantic_reviewer"
  | "worker_wake"
  | "independent_recovery";

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
}

export interface ProbeDeepCapabilityOptions {
  env?: Readonly<Record<string, string | undefined>>;
  probeRedis?: () => Promise<boolean>;
  now?: () => Date;
}

/** Configuration + reachability gate. It never tests capability with paid model calls. */
export async function probeDeepResearchCapability(
  options: ProbeDeepCapabilityOptions = {},
): Promise<DeepResearchCapability> {
  const env = options.env ?? process.env;
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
  const retrievalReady = hasRealRetrievalConfiguration(env);
  const workerOrigin = resolveDeepWorkerOrigin(env);
  const workerSecretReady = (env.LAUNCHLENS_DEEP_WORKER_SECRET?.length ?? 0) >= 24;
  const recoveryDelay = parsePositiveInteger(env.LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS);
  const recoverySecret = env.CRON_SECRET || env.LAUNCHLENS_CRON_SECRET;
  const recoveryReady =
    env.LAUNCHLENS_DEEP_RECOVERY_MODE === "cron" &&
    recoveryDelay !== null &&
    recoveryDelay <= 300 &&
    (recoverySecret?.length ?? 0) >= 24 &&
    recoverySecret !== env.LAUNCHLENS_DEEP_WORKER_SECRET;

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
      ready: !generation.isMock,
      label: "Research model",
      detail: generation.isMock
        ? "A real generation provider is required; mock fallback is forbidden."
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
      ready: reviewer.kind === "configured" && !reviewer.provider.isMock,
      label: "Semantic reviewer",
      detail:
        reviewer.kind === "configured" && !reviewer.provider.isMock
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
        ? `Cron recovery is declared with a maximum ${recoveryDelay}-second delay.`
        : "A separately scheduled recovery trigger with a declared maximum delay of 300 seconds is required.",
    },
  ];
  const blockers = requirements.filter((item) => !item.ready).map((item) => item.id);
  const available = blockers.length === 0;
  return {
    mode: "deep",
    id: "deep",
    label: RESEARCH_MODE_CONFIGS.deep.label,
    description: RESEARCH_MODE_CONFIGS.deep.description,
    depthLabel: RESEARCH_MODE_CONFIGS.deep.depthLabel,
    availability: available ? "available" : "preview",
    checkedAt: (options.now ?? (() => new Date()))().toISOString(),
    requirements,
    blockers,
    capabilityNotice: available
      ? "Durable 10-20 minute Deep Research is ready with mandatory retrieval and three semantic validation passes."
      : `Durable async Deep Research remains Preview until ${blockers.length} production requirement${blockers.length === 1 ? "" : "s"} are ready.`,
    expectedDurationSec: { ...RESEARCH_MODE_CONFIGS.deep.expectedDurationSec },
    expectedDurationLabel: RESEARCH_MODE_CONFIGS.deep.expectedDurationLabel,
    validationPasses: 3,
    retrieval: "required",
    requiresAsyncExecution: true,
    maxSynchronousDurationSec: 300,
  };
}

export function resolveDeepWorkerOrigin(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const raw =
    env.LAUNCHLENS_DEEP_WORKER_BASE_URL ||
    env.VERCEL_PROJECT_PRODUCTION_URL ||
    env.VERCEL_URL ||
    "";
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

async function defaultRedisProbe(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  return (await redis.ping()) === "PONG";
}
