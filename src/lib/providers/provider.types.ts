/* eslint-disable @typescript-eslint/no-explicit-any */
// Provider abstraction for the research engine.
// All providers must produce structurally valid AgentOutput objects.
// The mock provider is the source of truth for fallback behavior; real
// providers should fall back to mock outputs when remote calls fail or
// when no API key is configured.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

export interface ProviderProgressEvent {
  // Fraction of the agent's work completed, 0..1.
  fraction: number;
  // Optional human-readable label describing the current sub-step.
  step?: string;
  // Optional partial text accumulated so far. Real providers stream
  // tokens; the engine can ignore this if it only cares about progress.
  partial?: string;
}

export interface ProviderContext {
  query: string;
  keywords: string[];
  upstream?: AgentOutput[];
  signal?: AbortSignal;
  // When defined, providers should call this between sub-steps so the
  // engine can fan progress out to subscribers. Optional so legacy
  // call-sites and the deterministic mock keep working unchanged.
  onProgress?: (event: ProviderProgressEvent) => void;
}

export interface ResearchProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;
  readonly supportsStreaming: boolean;
  generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput>;
}

export type ProviderId = string;
