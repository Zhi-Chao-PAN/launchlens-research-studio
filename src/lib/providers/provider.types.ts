/* eslint-disable @typescript-eslint/no-explicit-any */
// Provider abstraction for the research engine.
// All providers must produce structurally valid AgentOutput objects.
// The mock provider is the source of truth for fallback behavior; real
// providers should fall back to mock outputs when remote calls fail or
// when no API key is configured.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

export interface ProviderContext {
  query: string;
  keywords: string[];
  upstream?: AgentOutput[];
  signal?: AbortSignal;
}

export interface ResearchProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;
  generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput>;
}

export type ProviderId = string;
