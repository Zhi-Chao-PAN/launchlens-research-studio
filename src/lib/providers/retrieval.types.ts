// R215: retrieval provider abstraction — parallel to ResearchProvider but for
// web search / page fetching. Real LLM providers currently generate
// citations from parametric memory alone; a RetrievalProvider injects
// retrieved, untrusted search results into the LLM's prompt and the engine
// can restrict cited URLs to that run-scoped allowlist. URL membership is
// provenance, not factual verification.
//
// Today only a Tavily adapter is planned (https://docs.tavily.com/), but
// the interface is provider-agnostic so Serper, Brave Search, Firecrawl,
// or an internal crawler can drop in later.

import type { SourceCitation } from "@/lib/schema/research-schema";
import type { AgentId } from "@/lib/schema/research-schema";

/**
 * A single retrieved source. It shares the citation transport shape because
 * prompts and persisted ledgers consume it directly. Search relevance lives
 * in `score`; `confidence` must not be inferred from relevance alone.
 */
export type RetrievedSource = SourceCitation & {
  /** Relevance score returned by the search backend (0..1, optional). */
  score?: number;
  /** When the result was retrieved — ISO timestamp. */
  retrievedAt: string;
};

/**
 * Query a retrieval provider for sources relevant to an agent's prompt.
 *
 * Contract:
 *   - A successful search that returned zero hits MUST resolve to `[]`. The
 *     distinction between "search succeeded but found nothing" and "search
 *     failed" lives in the type system: the former resolves to `[]`, the
 *     latter rejects with a `RetrievalError`.
 *   - Transient failures (network, 5xx, 429, parse) MUST throw a
 *     `RetrievalError` with `retryable: true` so the durable work unit
 *     can route them through the existing retry/backoff path.
 *   - Permanent failures (4xx other than 429, invalid key, missing config)
 *     MUST throw a `RetrievalError` with `retryable: false` so the work
 *     unit fails closed instead of advancing with phantom evidence.
 *   - Provider-owned HTTP timeouts are transient and MUST be retryable.
 *   - Aborts (caller or deadline) MUST throw a `RetrievalError` with
 *     `retryable: false` so cancellation wins races.
 */
export interface RetrievalProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isMock: boolean;

  /**
   * Optional per-agent override: an agent that benefits from news-like
   * sources can request time_range / topic narrowing here. Most agents
   * pass `undefined` to accept defaults.
   */
  search(opts: RetrievalQuery): Promise<RetrievedSource[]>;
}

/**
 * Typed error for retrieval failures. The `retryable` flag is the load-bearing
 * contract: it tells the durable work unit whether to retry, fail closed, or
 * surface the abort. Callers should branch on `error.code` first, then
 * `error.retryable`.
 */
export class RetrievalError extends Error {
  readonly code: RetrievalFallbackReason;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    code: RetrievalFallbackReason,
    retryable: boolean,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RetrievalError";
    this.code = code;
    this.retryable = retryable;
    this.cause = options?.cause;
  }
}

export interface RetrievalQuery {
  /** What the user asked about. Always set. */
  query: string;
  /** Optional refinement keywords (e.g. ["AI", "SaaS"]). */
  keywords?: string[];
  /** Which agent is asking — lets providers tune depth / topic. */
  agentId?: AgentId;
  /** Hard cap on returned sources; providers should clamp to this. */
  maxResults?: number;
  /** Retrieval depth requested by evidence-intensive modes. */
  searchDepth?: "basic" | "advanced";
  /** Optional relevance floor. This filters topical noise, not reliability. */
  minScore?: number;
  /** Optional provider-neutral hostname allowlist for source-type queries. */
  includeDomains?: string[];
  /** Optional provider-neutral hostname denylist for excluding known-noisy sources. */
  excludeDomains?: string[];
  /** Optional AbortSignal so a cancelled research session stops the search. */
  signal?: AbortSignal;
}

/**
 * Why a real retrieval provider failed. Surfaced in the UI as a
 * "Retrieval unavailable" badge so the user knows citations are LLM-only.
 */
export type RetrievalFallbackReason =
  | "http_error" // 4xx / 5xx after retries
  | "network_error" // fetch threw
  | "parse_error" // response body was not JSON
  | "empty_response" // 0 results returned
  | "not_configured"; // no API key / feature flag off
