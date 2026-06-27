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
  /** Optional persona ID to shape the output (mock providers only for now) */
  personaId?: string;
  signal?: AbortSignal;
  // When defined, providers should call this between sub-steps so the
  // engine can fan progress out to subscribers. Optional so legacy
  // call-sites and the deterministic mock keep working unchanged.
  onProgress?: (event: ProviderProgressEvent) => void;
  /** Called by a real provider when it degrades to the mock fallback for
   *  this agent. Real providers (openai/anthropic) catch all failures
   *  internally and return mock output so a session always completes — but
   *  without this callback the engine cannot tell a successful real call
   *  from a silent fallback, so the user would see demo data with no
   *  "demo" badge. The engine wires this to set the agent's `degraded`
   *  flag and surface the reason in the UI. Optional for back-compat. */
  onFallback?: (reason: ProviderFallbackReason) => void;
}

/** Why a real provider fell back to mock. Surfaced to the UI as the
 *  "demo data" badge tooltip so users can tell a weak model / bad key from
 *  a network blip. */
export type ProviderFallbackReason =
  | "http_error" // non-retriable 4xx, or 5xx after exhausting retries
  | "network_error" // fetch threw before a response (DNS, timeout, abort)
  | "parse_error" // response body was not valid JSON
  | "validation_error" // parsed JSON failed the agent schema validator
  | "empty_response"; // model returned an empty/no content message


export interface ResearchProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;
  readonly supportsStreaming: boolean;
  generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput>;
}

export type ProviderId = string;
