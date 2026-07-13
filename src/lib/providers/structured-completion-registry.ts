import type { StructuredCompletionProvider } from "./structured-completion";
import { createAnthropicStructuredCompletionProvider } from "./anthropic-structured-completion";
import { createOpenAIStructuredCompletionProvider } from "./openai-structured-completion";
import { isSafeProviderBaseUrl } from "@/lib/security/provider-base-url";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export type StructuredCompletionSelection =
  | { kind: "configured"; provider: StructuredCompletionProvider }
  | {
      kind: "unavailable";
      reason:
        | "mock_selected"
        | "provider_not_configured"
        | "forced_provider_missing_key"
        | "invalid_provider_url";
    };

/**
 * Mirrors the existing Standard provider selection order, but deliberately
 * returns unavailable instead of a mock fallback when no strict provider is
 * configured. Deep capability gating can consume this result directly.
 */
export function selectStructuredCompletionProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = globalThis.fetch,
): StructuredCompletionSelection {
  const forced = (env.LAUNCHLENS_REVIEW_PROVIDER || env.LAUNCHLENS_PROVIDER)?.toLowerCase();
  const openAIKey =
    env.LAUNCHLENS_REVIEW_OPENAI_KEY || env.OPENAI_API_KEY || env.LAUNCHLENS_OPENAI_KEY;
  const anthropicKey = env.LAUNCHLENS_REVIEW_ANTHROPIC_KEY || env.ANTHROPIC_API_KEY;
  const reviewModel = env.LAUNCHLENS_REVIEW_MODEL;
  const reviewBaseUrl = env.LAUNCHLENS_REVIEW_BASE_URL;
  const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV;

  const safeOpenAIUrl = () =>
    isSafeProviderBaseUrl(reviewBaseUrl || env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL, {
      nodeEnv,
    });
  const safeAnthropicUrl = () =>
    isSafeProviderBaseUrl(
      reviewBaseUrl || env.ANTHROPIC_BASE_URL,
      DEFAULT_ANTHROPIC_BASE_URL,
      { nodeEnv },
    );

  if (forced === "mock") return { kind: "unavailable", reason: "mock_selected" };
  if (forced === "openai") {
    if (!openAIKey) return { kind: "unavailable", reason: "forced_provider_missing_key" };
    if (!safeOpenAIUrl()) return { kind: "unavailable", reason: "invalid_provider_url" };
    return {
      kind: "configured",
      provider: createOpenAIStructuredCompletionProvider({
        apiKey: openAIKey,
        baseUrl: reviewBaseUrl || env.OPENAI_BASE_URL,
        model: reviewModel || env.OPENAI_MODEL,
        fetchImpl,
      }),
    };
  }
  if (forced === "anthropic") {
    if (!anthropicKey) return { kind: "unavailable", reason: "forced_provider_missing_key" };
    if (!safeAnthropicUrl()) return { kind: "unavailable", reason: "invalid_provider_url" };
    return {
      kind: "configured",
      provider: createAnthropicStructuredCompletionProvider({
        apiKey: anthropicKey,
        baseUrl: reviewBaseUrl || env.ANTHROPIC_BASE_URL,
        model: reviewModel || env.ANTHROPIC_MODEL,
        fetchImpl,
      }),
    };
  }

  if (anthropicKey) {
    if (!safeAnthropicUrl()) return { kind: "unavailable", reason: "invalid_provider_url" };
    return {
      kind: "configured",
      provider: createAnthropicStructuredCompletionProvider({
        apiKey: anthropicKey,
        baseUrl: reviewBaseUrl || env.ANTHROPIC_BASE_URL,
        model: reviewModel || env.ANTHROPIC_MODEL,
        fetchImpl,
      }),
    };
  }
  if (openAIKey) {
    if (!safeOpenAIUrl()) return { kind: "unavailable", reason: "invalid_provider_url" };
    return {
      kind: "configured",
      provider: createOpenAIStructuredCompletionProvider({
        apiKey: openAIKey,
        baseUrl: reviewBaseUrl || env.OPENAI_BASE_URL,
        model: reviewModel || env.OPENAI_MODEL,
        fetchImpl,
      }),
    };
  }
  return { kind: "unavailable", reason: "provider_not_configured" };
}
