// R215: Tavily adapter for the RetrievalProvider interface.
//
// Endpoint: POST https://api.tavily.com/search
// Auth: Authorization: Bearer <TAVILY_API_KEY>
// Body: { query, search_depth, max_results, topic, ... }
// Response: { results: [{ title, url, content, score, ... }], ... }
//
// The adapter is fully wired and unit-tested with a mocked fetchImpl so it
// can be exercised end-to-end as soon as TAVILY_API_KEY is set in
// .env.local. Until then the registry returns mockRetrievalProvider and
// every run behaves identically to R214.

import type { RetrievalProvider, RetrievalQuery, RetrievedSource } from "./retrieval.types";
import { RetrievalError } from "./retrieval.types";
import { normalizeProviderBaseUrl } from "@/lib/security/provider-base-url";

const DEFAULT_BASE_URL = "https://api.tavily.com";
const DEFAULT_MAX_RESULTS = 6;
const BASIC_HTTP_TIMEOUT_MS = 12_000;
const ADVANCED_HTTP_TIMEOUT_MS = 25_000;
// Tavily recommends queries shorter than 400 characters. Enforce the bound at
// the adapter edge because user briefs plus keywords can exceed it even when
// upstream callers already compact their focused query.
const MAX_QUERY_CHARS = 399;
const MAX_DOMAIN_FILTERS = 20;

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  query?: string;
  answer?: string;
  results?: TavilyRawResult[];
}

export class TavilyRetrievalProvider implements RetrievalProvider {
  readonly id = "tavily";
  readonly displayName = "Tavily";
  readonly isMock = false;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(opts: {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = normalizeProviderBaseUrl(opts.baseUrl, DEFAULT_BASE_URL);
    this.fetchImpl = opts.fetchImpl || globalThis.fetch.bind(globalThis);
    this.now = opts.now || (() => new Date());
  }

  async search(opts: RetrievalQuery): Promise<RetrievedSource[]> {
    const maxResults = clampInt(opts.maxResults ?? DEFAULT_MAX_RESULTS, 1, 20);
    const query = buildQueryString(opts.query, opts.keywords);
    if (!query) return [];
    const searchDepth = opts.searchDepth === "advanced" ? "advanced" : "basic";
    const minimumScore = clampScore(opts.minScore);
    const includeDomains = normalizeDomains(opts.includeDomains);
    const excludeDomains = normalizeDomains(opts.excludeDomains);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort(new DOMException("Tavily retrieval timed out.", "TimeoutError"));
      },
      searchDepth === "advanced" ? ADVANCED_HTTP_TIMEOUT_MS : BASIC_HTTP_TIMEOUT_MS,
    );
    // Wire the caller's AbortSignal to the controller too.
    const onAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Pre-aborted caller signal — short-circuit before doing any I/O.
    if (controller.signal.aborted) {
      clearTimeout(timer);
      throw new RetrievalError(
        "network_error",
        false,
        "Retrieval aborted before Tavily was contacted.",
        { cause: controller.signal.reason },
      );
    }

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          query,
          search_depth: searchDepth,
          ...(searchDepth === "advanced" ? { chunks_per_source: 3 } : {}),
          max_results: maxResults,
          topic: "general",
          include_answer: false,
          ...(includeDomains.length > 0 ? { include_domains: includeDomains } : {}),
          ...(excludeDomains.length > 0 ? { exclude_domains: excludeDomains } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // HTTP failure: 4xx (other than 429) is a permanent config error;
        // 5xx and 429 are transient and should be retried by the work unit.
        const retryable = res.status === 429 || res.status >= 500;
        throw new RetrievalError(
          "http_error",
          retryable,
          `Tavily returned HTTP ${res.status} ${res.statusText || ""}`.trim(),
        );
      }
      const json = (await res.json()) as TavilyResponse;
      const results = Array.isArray(json.results) ? json.results : [];
      const retrievedAt = this.now().toISOString();
      const sources: RetrievedSource[] = [];
      for (const r of results) {
        const snippet = typeof r.content === "string" ? r.content.trim() : "";
        if (!r.url || !r.title || !snippet) continue;
        if (
          minimumScore !== undefined &&
          (typeof r.score !== "number" || r.score < minimumScore)
        ) continue;
        sources.push({
          id: hashUrl(r.url),
          title: String(r.title).slice(0, 200),
          url: r.url,
          snippet: snippet.slice(0, searchDepth === "advanced" ? 900 : 500),
          accessedAt: retrievedAt,
          // Tavily's score measures query relevance, not source reliability.
          // Keep relevance in `score` and use a conservative neutral
          // confidence until a later claim-to-source review evaluates quality.
          confidence: "medium",
          agent: (opts.agentId || "market-sizer") as RetrievedSource["agent"],
          score: typeof r.score === "number" ? r.score : undefined,
          retrievedAt,
        });
      }
      return sources.slice(0, maxResults);
    } catch (error) {
      if (error instanceof RetrievalError) throw error;
      // Distinguish caller/timeout aborts (non-retryable) from network/parse
      // failures (retryable). The deadline timer calls controller.abort()
      // without a reason; pass the reason through when present.
      if (controller.signal.aborted) {
        const callerAborted = opts.signal?.aborted === true;
        throw new RetrievalError(
          "network_error",
          timedOut && !callerAborted,
          timedOut && !callerAborted
            ? "Tavily retrieval timed out before completion."
            : "Tavily retrieval was aborted by its caller before completion.",
          { cause: error },
        );
      }
      throw new RetrievalError(
        "network_error",
        true,
        "Tavily retrieval failed with a network or runtime error.",
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    }
  }
}

function buildQueryString(query: string, keywords?: string[]): string {
  const parts: string[] = [];
  if (query) parts.push(query);
  if (keywords && keywords.length > 0) parts.push(keywords.join(" "));
  const normalized = parts.join(" ").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_QUERY_CHARS) return normalized;
  const clipped = normalized.slice(0, MAX_QUERY_CHARS);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= 300 ? clipped.slice(0, boundary) : clipped).trim();
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function clampScore(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function normalizeDomains(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const domains = new Set<string>();
  for (const value of values) {
    const domain = String(value).trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
      domains.add(domain);
      if (domains.size === MAX_DOMAIN_FILTERS) break;
    }
  }
  return [...domains];
}

function hashUrl(url: string): string {
  // Deterministic short id so the same URL always gets the same citation id
  // across runs. FNV-1a is good enough for this; not security-sensitive.
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `c${h.toString(36)}`;
}
