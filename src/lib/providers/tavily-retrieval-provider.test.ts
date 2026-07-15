// @vitest-environment node
import { afterEach, describe, it, expect, vi } from "vitest";
import { TavilyRetrievalProvider } from "./tavily-retrieval-provider";
import { RetrievalError } from "./retrieval.types";

function makeProvider(opts: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  baseUrl?: string;
} = {}) {
  return new TavilyRetrievalProvider({
    apiKey: opts.apiKey ?? "tvly-test-key",
    fetchImpl: opts.fetchImpl,
    now: opts.now ?? (() => new Date("2026-06-27T00:00:00.000Z")),
    baseUrl: opts.baseUrl,
  });
}

describe("TavilyRetrievalProvider (R215)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts to /search with the right headers and body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = makeProvider({ fetchImpl });
    await provider.search({ query: "AI tools", keywords: ["saas"] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    const url = call[0];
    const init = call[1] as RequestInit;
    expect(String(url)).toBe("https://api.tavily.com/search");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tvly-test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.query).toBe("AI tools saas");
    expect(body.max_results).toBe(6);
    expect(body.search_depth).toBe("basic");
    expect(body.topic).toBe("general");
  });

  it("keeps the final provider query below Tavily's 400-character limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });

    await provider.search({
      query: `pricing pages plans tiers. Product context: ${"market opportunity ".repeat(30)}`,
      keywords: Array.from({ length: 12 }, (_, index) => `keyword-${index}-${"x".repeat(25)}`),
    });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { query: string };
    expect(body.query.length).toBeLessThan(400);
    expect(body.query).toMatch(/^pricing pages plans tiers\./);
  });

  it("uses advanced chunks, safe domain filters, and a relevance floor for Deep queries", async () => {
    const longContent = "evidence ".repeat(180);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({
        results: [
          { title: "Relevant", url: "https://g2.com/products/example", content: longContent, score: 0.82 },
          { title: "Noise", url: "https://g2.com/products/noise", content: "noise", score: 0.12 },
        ],
      }), { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });

    const sources = await provider.search({
      query: "voice of customer evidence",
      searchDepth: "advanced",
      minScore: 0.35,
      includeDomains: ["https://G2.com/products", "not a host", "reddit.com"],
    });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      search_depth: "advanced",
      chunks_per_source: 3,
      include_domains: ["g2.com", "reddit.com"],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("Relevant");
    expect(sources[0].snippet.length).toBe(900);
  });

  it("normalizes, deduplicates, filters, and caps excluded domains in the request body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });
    const validDomains = Array.from({ length: 25 }, (_, index) => `source-${index}.example.com`);

    await provider.search({
      query: "exclude low-quality sources",
      excludeDomains: [
        " https://SPAM.example.com/articles ",
        "spam.example.com",
        "not a host",
        "localhost",
        "https://user@credential.example.com",
        ...validDomains,
      ],
    });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as { exclude_domains?: string[] };
    expect(body.exclude_domains).toHaveLength(20);
    expect(body.exclude_domains).toEqual([
      "spam.example.com",
      ...validDomains.slice(0, 19),
    ]);
    expect(body.exclude_domains).not.toContain("not a host");
    expect(body.exclude_domains).not.toContain("credential.example.com");
  });

  it("returns parsed sources with deterministic ids and retrievedAt", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Best AI tools 2026",
              url: "https://example.com/ai-tools",
              content: "A long writeup about AI tools…",
              score: 0.91,
            },
            {
              title: "SaaS market overview",
              url: "https://other.com/saas",
              content: "Market numbers…",
              score: 0.45,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "AI tools" });
    expect(sources).toHaveLength(2);
    expect(sources[0].id).toMatch(/^c[a-z0-9]+$/);
    // Deterministic — same URL must produce same id.
    expect(sources[0].id).toBe(sources[0].id);
    expect(sources[0].title).toBe("Best AI tools 2026");
    expect(sources[0].url).toBe("https://example.com/ai-tools");
    expect(sources[0].snippet).toContain("AI tools");
    expect(sources[0].retrievedAt).toBe("2026-06-27T00:00:00.000Z");
    // Retrieval relevance is not evidence reliability. Both sources remain
    // medium confidence until a later claim-to-source validation pass.
    expect(sources[0].confidence).toBe("medium");
    expect(sources[1].confidence).toBe("medium");
  });

  it("drops results missing title, url, or an evidence snippet", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          results: [
            { url: "https://a.com", content: "x" }, // no title → drop
            { title: "no-url", content: "x" }, // no url → drop
            { title: "no-content", url: "https://empty.example" },
            { title: "ok", url: "https://ok.com", content: "x" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "x" });
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("https://ok.com");
  });

  it("throws a non-retryable RetrievalError on non-2xx (graceful degradation surfaced)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("forbidden", { status: 403 }));
    const provider = makeProvider({ fetchImpl });
    await expect(provider.search({ query: "x" })).rejects.toBeInstanceOf(RetrievalError);
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "http_error",
      retryable: false,
    });
  });

  it("throws a retryable RetrievalError on network error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("DNS failure");
    });
    const provider = makeProvider({ fetchImpl });
    await expect(provider.search({ query: "x" })).rejects.toBeInstanceOf(RetrievalError);
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "network_error",
      retryable: true,
    });
  });

  it("treats an internal provider timeout as retryable", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
    );
    const provider = makeProvider({ fetchImpl });

    const assertion = expect(
      provider.search({ query: "slow retrieval" }),
    ).rejects.toMatchObject({
      code: "network_error",
      retryable: true,
      message: expect.stringContaining("timed out"),
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
  });

  it("throws a retryable RetrievalError on invalid JSON body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("not json at all", { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });
    await expect(provider.search({ query: "x" })).rejects.toBeInstanceOf(RetrievalError);
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "network_error",
      retryable: true,
    });
  });

  it("clamps maxResults to the [1,20] range", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });
    await provider.search({ query: "x", maxResults: 9999 });
    const init1 = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init1.body as string);
    expect(body.max_results).toBe(20);
    await provider.search({ query: "x", maxResults: 0 });
    const init2 = fetchImpl.mock.calls[1][1] as RequestInit;
    const body2 = JSON.parse(init2.body as string);
    expect(body2.max_results).toBe(1);
  });

  it("returns empty array when query string is empty", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "   ", keywords: [] });
    expect(sources).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects the caller's AbortSignal (pre-aborted) by throwing a non-retryable RetrievalError", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      // Should never be reached — pre-aborted caller signal triggers the
      // early return path.
      throw new Error("fetch called after abort");
    });
    const provider = makeProvider({ fetchImpl });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      provider.search({ query: "x", signal: ctrl.signal }),
    ).rejects.toMatchObject({ code: "network_error", retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
