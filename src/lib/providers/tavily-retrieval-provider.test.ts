// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { TavilyRetrievalProvider } from "./tavily-retrieval-provider";

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
    expect(sources[0].confidence).toBe("high"); // score >= 0.7
    expect(sources[1].confidence).toBe("medium"); // 0.45
  });

  it("drops results missing title or url", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          results: [
            { url: "https://a.com", content: "x" }, // no title → drop
            { title: "no-url", content: "x" }, // no url → drop
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

  it("returns empty array on non-2xx (graceful degradation)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("forbidden", { status: 403 }));
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "x" });
    expect(sources).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("DNS failure");
    });
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "x" });
    expect(sources).toEqual([]);
  });

  it("returns empty array on invalid JSON body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("not json at all", { status: 200 }),
    );
    const provider = makeProvider({ fetchImpl });
    const sources = await provider.search({ query: "x" });
    expect(sources).toEqual([]);
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

  it("respects the caller's AbortSignal (pre-aborted)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      // Should never be reached — pre-aborted caller signal triggers the
      // early return path.
      throw new Error("fetch called after abort");
    });
    const provider = makeProvider({ fetchImpl });
    const ctrl = new AbortController();
    ctrl.abort();
    const sources = await provider.search({ query: "x", signal: ctrl.signal });
    expect(sources).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});