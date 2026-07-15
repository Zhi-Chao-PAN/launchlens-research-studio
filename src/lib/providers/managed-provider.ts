import {
  acquireProviderCredentialProbe,
  recordProviderCredentialFailure,
  recordProviderCredentialSuccess,
  releaseProviderCredentialProbe,
  resolveProviderCredentials,
  type LlmProvider,
  type ProviderCredentialFailureReason,
  type ProviderCredentialProbeLease,
  type ProviderCredentialSlot,
  type ResolvedProviderCredential,
} from "@/lib/admin/provider-credentials";
import { createAnthropicProvider } from "@/lib/providers/anthropic-provider";
import { createAnthropicStructuredCompletionProvider } from "@/lib/providers/anthropic-structured-completion";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { createOpenAIProvider } from "@/lib/providers/openai-provider";
import { createOpenAIStructuredCompletionProvider } from "@/lib/providers/openai-structured-completion";
import {
  isAbortError,
  ProviderRequestError,
} from "@/lib/providers/provider-request-error";
import {
  StructuredCompletionError,
  type StructuredCompletionProvider,
  type StructuredCompletionRequest,
} from "@/lib/providers/structured-completion";
import type {
  ProviderContext,
  ProviderFallbackReason,
  ResearchProvider,
} from "@/lib/providers/provider.types";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { RetriableSseError } from "@/lib/utils/sse-reconnect";

const AUTH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const TRANSIENT_COOLDOWN_MS = 30 * 1000;

export interface ManagedProviderDependencies {
  resolve: (provider: LlmProvider) => Promise<ResolvedProviderCredential[]>;
  recordSuccess: (
    provider: LlmProvider,
    slot: ProviderCredentialSlot,
    credentialId: string,
  ) => Promise<void>;
  recordFailure: (
    provider: LlmProvider,
    slot: ProviderCredentialSlot,
    credentialId: string,
    reason: ProviderCredentialFailureReason,
    cooldownMs: number,
  ) => Promise<void>;
  acquireProbe: (
    provider: LlmProvider,
    slot: ProviderCredentialSlot,
    credentialId: string,
  ) => Promise<ProviderCredentialProbeLease | null>;
  releaseProbe: (lease: ProviderCredentialProbeLease) => Promise<boolean>;
  now: () => number;
}

const defaultDependencies: ManagedProviderDependencies = {
  resolve: (provider) => resolveProviderCredentials(provider),
  recordSuccess: (provider, slot, credentialId) =>
    recordProviderCredentialSuccess(provider, slot, credentialId),
  recordFailure: (provider, slot, credentialId, reason, cooldownMs) =>
    recordProviderCredentialFailure(provider, slot, credentialId, reason, cooldownMs),
  acquireProbe: (provider, slot, credentialId) =>
    acquireProviderCredentialProbe(provider, slot, credentialId),
  releaseProbe: (lease) => releaseProviderCredentialProbe(lease),
  now: Date.now,
};

export interface ManagedResearchProviderOptions {
  provider: LlmProvider;
  failureMode: "fallback" | "throw";
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  dependencies?: Partial<ManagedProviderDependencies>;
}

export interface ManagedStructuredProviderOptions {
  provider: LlmProvider;
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  dependencies?: Partial<ManagedProviderDependencies>;
}

export interface FailoverDecision {
  action: "switch" | "stop" | "abort";
  reason: ProviderCredentialFailureReason | null;
  cooldownMs: number;
  fallbackReason: ProviderFallbackReason;
}

export class ManagedProviderUnavailableError extends Error {
  readonly code = "MANAGED_PROVIDER_UNAVAILABLE";

  constructor(message = "Managed provider credentials are unavailable.") {
    super(message);
    this.name = "ManagedProviderUnavailableError";
  }
}

export function classifyManagedProviderError(
  error: unknown,
  signal?: AbortSignal,
): FailoverDecision {
  if (isAbortError(error, signal)) {
    return { action: "abort", reason: null, cooldownMs: 0, fallbackReason: "network_error" };
  }
  if (error instanceof ProviderRequestError) {
    if (error.kind === "network") {
      return { action: "switch", reason: "network", cooldownMs: TRANSIENT_COOLDOWN_MS, fallbackReason: "network_error" };
    }
    return classifyHttpStatus(error.status);
  }
  if (error instanceof RetriableSseError) {
    return {
      action: "switch",
      reason: "network",
      cooldownMs: TRANSIENT_COOLDOWN_MS,
      fallbackReason: "network_error",
    };
  }
  if (error instanceof Error) {
    const status = /^sse HTTP (\d+)$/u.exec(error.message)?.[1];
    if (status) return classifyHttpStatus(Number(status));
    if (/validation|schema/iu.test(error.message)) {
      return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "validation_error" };
    }
    if (/empty/iu.test(error.message)) {
      return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "empty_response" };
    }
    if (/json|parse/iu.test(error.message)) {
      return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "parse_error" };
    }
  }
  return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "validation_error" };
}

export function classifyManagedStructuredError(error: unknown): FailoverDecision {
  if (!(error instanceof StructuredCompletionError)) {
    return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "validation_error" };
  }
  if (error.code === "aborted" || error.code === "timeout") {
    return { action: "abort", reason: null, cooldownMs: 0, fallbackReason: "network_error" };
  }
  if (error.code === "network_error") {
    return { action: "switch", reason: "network", cooldownMs: TRANSIENT_COOLDOWN_MS, fallbackReason: "network_error" };
  }
  if (error.code === "http_error") return classifyHttpStatus(error.status);
  if (error.code === "empty_response") {
    return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "empty_response" };
  }
  if (error.code === "invalid_json" || error.code === "invalid_response") {
    return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "parse_error" };
  }
  return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "validation_error" };
}

export function createManagedResearchProvider(
  options: ManagedResearchProviderOptions,
): ResearchProvider {
  const deps = dependencies(options.dependencies);
  const env = options.env ?? process.env;
  return {
    id: `${options.provider}-keyring`,
    displayName: `${providerLabel(options.provider)} · managed 1→2→3`,
    isMock: false,
    supportsStreaming: true,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      let credentials: ResolvedProviderCredential[];
      try {
        credentials = await deps.resolve(options.provider);
      } catch {
        return finalGenerationFailure(options.failureMode, agentId, ctx, "network_error");
      }

      let finalReason: ProviderFallbackReason = "network_error";
      let lastStoppedError: unknown;
      for (const credential of credentials.slice(0, 3)) {
        const lease = await admitCredential(credential, deps);
        if (lease === false) continue;
        try {
          const adapter = createStrictResearchAdapter(
            options.provider,
            credential.apiKey,
            env,
            options.fetchImpl,
          );
          const output = await adapter.generate(agentId, { ...ctx, onFallback: undefined });
          await bestEffort(() => deps.recordSuccess(options.provider, credential.slot, credential.credentialId));
          return output;
        } catch (error) {
          const decision = classifyManagedProviderError(error, ctx.signal);
          finalReason = decision.fallbackReason;
          if (decision.action === "abort") throw error;
          if (decision.action === "stop") {
            lastStoppedError = error;
            break;
          }
          await bestEffort(() => deps.recordFailure(
            options.provider,
            credential.slot,
            credential.credentialId,
            decision.reason ?? "unknown",
            decision.cooldownMs,
          ));
        } finally {
          if (lease) await bestEffort(() => deps.releaseProbe(lease));
        }
      }

      if (options.failureMode === "throw" && lastStoppedError) throw lastStoppedError;
      return finalGenerationFailure(options.failureMode, agentId, ctx, finalReason);
    },
  };
}

export function createManagedStructuredCompletionProvider(
  options: ManagedStructuredProviderOptions,
): StructuredCompletionProvider {
  const deps = dependencies(options.dependencies);
  const env = options.env ?? process.env;
  return {
    id: `${options.provider}-keyring`,
    displayName: `${providerLabel(options.provider)} · managed 1→2→3 reviewer`,
    model: modelFor(options.provider, env, true),
    isMock: false,
    async complete<T>(request: StructuredCompletionRequest<T>): Promise<T> {
      let credentials: ResolvedProviderCredential[];
      try {
        credentials = await deps.resolve(options.provider);
      } catch {
        throw managedStructuredUnavailable(options.provider);
      }
      let lastError: unknown;
      for (const credential of credentials.slice(0, 3)) {
        const lease = await admitCredential(credential, deps);
        if (lease === false) continue;
        try {
          const adapter = createStrictStructuredAdapter(
            options.provider,
            credential.apiKey,
            env,
            options.fetchImpl,
          );
          const output = await adapter.complete<T>(request);
          await bestEffort(() => deps.recordSuccess(options.provider, credential.slot, credential.credentialId));
          return output;
        } catch (error) {
          lastError = error;
          const decision = classifyManagedStructuredError(error);
          if (decision.action !== "switch") throw error;
          await bestEffort(() => deps.recordFailure(
            options.provider,
            credential.slot,
            credential.credentialId,
            decision.reason ?? "unknown",
            decision.cooldownMs,
          ));
        } finally {
          if (lease) await bestEffort(() => deps.releaseProbe(lease));
        }
      }
      if (lastError) throw lastError;
      throw managedStructuredUnavailable(options.provider);
    },
  };
}

function classifyHttpStatus(status: number | undefined): FailoverDecision {
  if (status === 401 || status === 403) {
    return { action: "switch", reason: "auth", cooldownMs: AUTH_COOLDOWN_MS, fallbackReason: "http_error" };
  }
  if (status === 402) {
    return { action: "switch", reason: "auth", cooldownMs: QUOTA_COOLDOWN_MS, fallbackReason: "http_error" };
  }
  if (status === 429) {
    return { action: "switch", reason: "rate_limit", cooldownMs: RATE_LIMIT_COOLDOWN_MS, fallbackReason: "http_error" };
  }
  if (status === 408 || (typeof status === "number" && status >= 500)) {
    return { action: "switch", reason: "server", cooldownMs: TRANSIENT_COOLDOWN_MS, fallbackReason: "http_error" };
  }
  return { action: "stop", reason: null, cooldownMs: 0, fallbackReason: "http_error" };
}

async function admitCredential(
  credential: ResolvedProviderCredential,
  deps: ManagedProviderDependencies,
): Promise<ProviderCredentialProbeLease | null | false> {
  if (credential.health.status !== "cooldown") return null;
  const cooldownUntil = credential.health.cooldownUntil
    ? Date.parse(credential.health.cooldownUntil)
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(cooldownUntil) || cooldownUntil > deps.now()) return false;
  try {
    return await deps.acquireProbe(
      credential.provider,
      credential.slot,
      credential.credentialId,
    ) || false;
  } catch {
    return false;
  }
}

function createStrictResearchAdapter(
  provider: LlmProvider,
  apiKey: string,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): ResearchProvider {
  if (provider === "anthropic") {
    return createAnthropicProvider({
      apiKey,
      baseUrl: env.ANTHROPIC_BASE_URL,
      model: env.ANTHROPIC_MODEL,
      fetchImpl,
      failureMode: "throw",
      maxAttempts: 1,
    });
  }
  return createOpenAIProvider({
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    fetchImpl,
    failureMode: "throw",
    maxAttempts: 1,
    allowStructuredRepair: false,
  });
}

function createStrictStructuredAdapter(
  provider: LlmProvider,
  apiKey: string,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): StructuredCompletionProvider {
  if (provider === "anthropic") {
    return createAnthropicStructuredCompletionProvider({
      apiKey,
      baseUrl: env.LAUNCHLENS_REVIEW_BASE_URL || env.ANTHROPIC_BASE_URL,
      model: modelFor(provider, env, true),
      fetchImpl,
    });
  }
  return createOpenAIStructuredCompletionProvider({
    apiKey,
    baseUrl: env.LAUNCHLENS_REVIEW_BASE_URL || env.OPENAI_BASE_URL,
    model: modelFor(provider, env, true),
    fetchImpl,
  });
}

function modelFor(
  provider: LlmProvider,
  env: Readonly<Record<string, string | undefined>>,
  review = false,
): string {
  return (review ? env.LAUNCHLENS_REVIEW_MODEL : undefined) ||
    (provider === "anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL) ||
    (provider === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini");
}

function providerLabel(provider: LlmProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI-compatible";
}

function dependencies(
  overrides: Partial<ManagedProviderDependencies> | undefined,
): ManagedProviderDependencies {
  return { ...defaultDependencies, ...overrides };
}

async function bestEffort(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Credential health is operational telemetry. The encrypted keyring is
    // still authoritative and each logical call remains bounded to 3 slots.
  }
}

async function finalGenerationFailure(
  failureMode: "fallback" | "throw",
  agentId: AgentId,
  ctx: ProviderContext,
  reason: ProviderFallbackReason,
): Promise<AgentOutput> {
  if (failureMode === "throw") throw new ManagedProviderUnavailableError();
  ctx.onFallback?.(reason, { message: "All configured provider credential slots are unavailable." });
  return mockResearchProvider.generate(agentId, ctx);
}

function managedStructuredUnavailable(provider: LlmProvider): StructuredCompletionError {
  return new StructuredCompletionError({
    code: "configuration_error",
    providerId: `${provider}-keyring`,
    message: "No managed provider credential is currently available.",
    retryable: false,
  });
}
