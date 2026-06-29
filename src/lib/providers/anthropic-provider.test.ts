/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";

// A channel-scout payload that actually passes validateAgentOutput: it
// carries the required fields plus at least one citation with a non-empty
// snippet (the validator rejects empty citation arrays and snippet-less
// citations). The previous version had citations:[] and silently fell back
// to mock, making the "returns parsed JSON" test misleading.
const validPayload = {
  agent: "channel-scout",
  summary: "ok",
  channels: [],
  citations: [{ id: "c1", title: "Source", snippet: "evidence" }],
};

describe("createAnthropicProvider", () => {
  it("retries 5xx then falls back to mock", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const out = await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(out.agent).toBe("market-sizer");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx and falls back immediately", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const out = await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(out.agent).toBe("market-sizer");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to mock when JSON is malformed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "not json" }] }),
    } as any));
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const out = await p.generate("pricing-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("pricing-scout");
  });

  it("falls back to mock when validation fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ agent: "channel-scout" }) }] }),
    } as any));
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const out = await p.generate("channel-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("channel-scout");
    expect(Array.isArray(out.citations)).toBe(true);
  });

  it("returns parsed JSON when remote succeeds", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(validPayload) }] }),
    } as any));
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const out = await p.generate("channel-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("channel-scout");
  });

  it("normalizes recoverable real output instead of falling back to mock", async () => {
    const recoverablePayload = {
      agent: "pain-detective",
      summary: "Real user pain evidence from the provider",
      citations: [{ id: "c1", title: "Interview evidence", snippet: "buyers mention manual review delays" }],
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(recoverablePayload) }] }),
    }) as any);
    const reasons: string[] = [];
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });

    const out = await p.generate("pain-detective", {
      query: "q",
      keywords: [],
      onFallback: (reason) => reasons.push(reason),
    });

    expect(out.agent).toBe("pain-detective");
    if (out.agent !== "pain-detective") throw new Error("expected pain-detective output");
    expect(out.summary).toBe("Real user pain evidence from the provider");
    expect(out.painPoints).toEqual([]);
    expect(out.citations).toHaveLength(1);
    expect(reasons).toEqual([]);
  });

  it("targets configured baseUrl, model, and headers", async () => {
    let url = "";
    let init: any = null;
    const fetchImpl = vi.fn(async (u: string, i: any) => {
      url = u;
      init = i;
      return { ok: false, status: 401 } as any;
    });
    const p = createAnthropicProvider({
      apiKey: "k",
      baseUrl: "https://example.com",
      model: "claude-3-haiku",
      fetchImpl: fetchImpl as any,
    });
    await p.generate("market-sizer", { query: "q", keywords: ["a"] });
    expect(url).toBe("https://example.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("k");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-3-haiku");
    expect(body.system).toContain("market-sizer");
  });

  it("injects the schema-aware system prompt into the LLM call", async () => {
    let systemContent = "";
    let userContent = "";
    const fetchImpl = vi.fn(async (_u: string, i: any) => {
      const body = JSON.parse(i.body);
      systemContent = body.system;
      userContent = body.messages.find((m: any) => m.role === "user").content;
      return { ok: false, status: 401 } as any;
    });
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("pain-detective", { query: "AI code reviewer", keywords: ["devtools"] });

    // System prompt must name the agent and surface its schema fields; the old
    // prompt never showed the schema, so real calls always failed validation.
    expect(systemContent).toContain("pain-detective");
    expect(systemContent).toContain("painPoints");
    expect(systemContent).toContain("unmetNeeds");
    expect(systemContent).toContain("citations");

    // User prompt must carry the query + keywords.
    expect(userContent).toContain("AI code reviewer");
    expect(userContent).toContain("devtools");
  });

  it("injects synthesis agent coaching when generating synthesis", async () => {
    let systemContent = "";
    const fetchImpl = vi.fn(async (_u: string, i: any) => {
      systemContent = JSON.parse(i.body).system;
      return { ok: false, status: 401 } as any;
    });
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("synthesis", { query: "q", keywords: [] });
    expect(systemContent).toContain("synthesis");
    expect(systemContent).toContain("opportunityScore");
    expect(systemContent).toContain("launchlensBrief");
  });

  it("reports onFallback(http_error) when the provider returns 4xx", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const details: unknown[] = [];
    await p.generate("market-sizer", {
      query: "q",
      keywords: [],
      onFallback: (r, detail) => {
        reasons.push(r);
        details.push(detail);
      },
    });
    expect(reasons).toContain("http_error");
    expect(details).toContainEqual(expect.objectContaining({ status: 401 }));
  });

  it("reports onFallback(validation_error) when the LLM output fails schema validation", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ agent: "channel-scout" }) }] }),
    }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const out = await p.generate("channel-scout", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("validation_error");
    expect(out.agent).toBe("channel-scout");
  });

  it("reports onFallback(parse_error) when the response is not JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "not json at all" }] }),
    }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    await p.generate("pricing-scout", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("parse_error");
  });

  it("reports onFallback(network_error) when fetch throws before a response", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const out = await p.generate("market-sizer", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("network_error");
    expect(out.agent).toBe("market-sizer");
  });

  it("retries a transient network error without reporting a fallback", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("ECONNRESET");
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify(validPayload) }],
        }),
      } as any;
    });
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];

    const out = await p.generate("channel-scout", {
      query: "q",
      keywords: [],
      onFallback: (reason) => reasons.push(reason),
    });

    expect(out.agent).toBe("channel-scout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(reasons).toEqual([]);
  });

  it("does not report onFallback on a successful real call", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify(validPayload) }] }),
    }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    await p.generate("channel-scout", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toHaveLength(0);
  });

  it("reports onFallback(network_error) when the streaming response drops mid-stream", async () => {
    // R205 gap: the streaming path (wantsStream when onProgress is set) used
    // to let readSseWithReconnect failures fall to the outer catch without
    // reporting a reason. A stream that returns ok but then errors mid-read
    // must now surface network_error so the demo badge shows.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => { throw new Error("stream broke"); },
          releaseLock: () => {},
        }),
      },
    }) as any);
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const onProgress = vi.fn();
    const out = await p.generate("market-sizer", { query: "q", keywords: [], onProgress, onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("network_error");
    expect(out.agent).toBe("market-sizer");
  });
});
