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
import { normalizeProviderBaseUrl } from "@/lib/security/provider-base-url";

const DEFAULT_BASE_URL = "https://api.tavily.com";
const DEFAULT_MAX_RESULTS = 6;
const HTTP_TIMEOUT_MS = 12_000;

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    // Wire the caller's AbortSignal to the controller too.
    const onAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Pre-aborted caller signal — short-circuit before doing any I/O.
    if (controller.signal.aborted) {
      clearTimeout(timer);
      return [];
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
          search_depth: "basic",
          max_results: maxResults,
          topic: "general",
          include_answer: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Surface as an empty result; engine falls back to LLM-only.
        return [];
      }
      const json = (await res.json()) as TavilyResponse;
      const results = Array.isArray(json.results) ? json.results : [];
      const retrievedAt = this.now().toISOString();
      const sources: RetrievedSource[] = [];
      for (const r of results) {
        if (!r.url || !r.title) continue;
        sources.push({
          id: hashUrl(r.url),
          title: String(r.title).slice(0, 200),
          url: r.url,
          snippet: String(r.content || "").slice(0, 500),
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
    } catch {
      // Network / abort / JSON parse / any failure — degrade silently.
      return [];
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
  return parts.join(" ").trim();
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
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
