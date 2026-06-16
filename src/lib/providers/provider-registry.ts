// Selects a provider based on environment configuration. Server-only.
import type { ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { createOpenAIProvider } from "@/lib/providers/openai-provider";

export function selectProvider(env: NodeJS.ProcessEnv = process.env): ResearchProvider {
  const forced = env.LAUNCHLENS_PROVIDER;
  if (forced === "mock") return mockResearchProvider;

  const apiKey = env.OPENAI_API_KEY || env.LAUNCHLENS_OPENAI_KEY;
  if (apiKey) {
    return createOpenAIProvider({
      apiKey,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
    });
  }
  return mockResearchProvider;
}
