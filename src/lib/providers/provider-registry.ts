// Selects a research provider based on environment configuration.
// Server-only. The selection rules in priority order:
//   1. LAUNCHLENS_PROVIDER=mock forces the mock even when keys are set.
//   2. LAUNCHLENS_PROVIDER=openai forces OpenAI when OPENAI_API_KEY is set.
//   3. LAUNCHLENS_PROVIDER=anthropic forces Anthropic when ANTHROPIC_API_KEY is set.
//   4. With no override: prefer Anthropic if its key is set, otherwise OpenAI.
//   5. Fall back to the deterministic mock when no key is configured.
import type { ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { createOpenAIProvider } from "@/lib/providers/openai-provider";
import { createAnthropicProvider } from "@/lib/providers/anthropic-provider";
import { isSafeProviderBaseUrl } from "@/lib/security/provider-base-url";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

function makeOpenAI(env: NodeJS.ProcessEnv, apiKey: string): ResearchProvider {
  if (!isSafeProviderBaseUrl(env.OPENAI_BASE_URL, DEFAULT_OPENAI_BASE_URL, {
    nodeEnv: env.NODE_ENV ?? process.env.NODE_ENV,
  })) {
    console.warn("[provider] OPENAI_BASE_URL is unsafe; using mock generation.");
    return mockResearchProvider;
  }
  return createOpenAIProvider({
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
  });
}

function makeAnthropic(env: NodeJS.ProcessEnv, apiKey: string): ResearchProvider {
  if (!isSafeProviderBaseUrl(env.ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL, {
    nodeEnv: env.NODE_ENV ?? process.env.NODE_ENV,
  })) {
    console.warn("[provider] ANTHROPIC_BASE_URL is unsafe; using mock generation.");
    return mockResearchProvider;
  }
  return createAnthropicProvider({
    apiKey,
    baseUrl: env.ANTHROPIC_BASE_URL,
    model: env.ANTHROPIC_MODEL,
  });
}

export function selectProvider(env: NodeJS.ProcessEnv = process.env): ResearchProvider {
  const forced = env.LAUNCHLENS_PROVIDER;
  const openAIKey = env.OPENAI_API_KEY || env.LAUNCHLENS_OPENAI_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (forced === "mock") return mockResearchProvider;
  if (forced === "openai" && openAIKey) return makeOpenAI(env, openAIKey);
  if (forced === "anthropic" && anthropicKey) return makeAnthropic(env, anthropicKey);

  if (anthropicKey) return makeAnthropic(env, anthropicKey);
  if (openAIKey) return makeOpenAI(env, openAIKey);
  return mockResearchProvider;
}
