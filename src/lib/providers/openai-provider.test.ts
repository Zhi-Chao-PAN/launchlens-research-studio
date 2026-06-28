/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider";

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

describe("createOpenAIProvider", () => {
  it("retries 5xx then falls back to mock", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(out.agent).toBe("market-sizer");
    // 5xx is retriable: retryWithBackoff makes up to 3 attempts.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx and falls back to mock immediately", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(out.agent).toBe("market-sizer");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to mock when JSON parse fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json" } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("pricing-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("pricing-scout");
  });

  it("falls back to mock when validation fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ agent: "wrong" }) } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("channel-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("channel-scout");
    expect(Array.isArray(out.citations)).toBe(true);
  });

  it("returns parsed JSON when remote succeeds", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(validPayload) } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("channel-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("channel-scout");
  });

  it("targets the configured baseUrl and model", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return { ok: false, status: 401 } as any;
    });
    const p = createOpenAIProvider({
      apiKey: "k",
      baseUrl: "https://example.com/v1",
      model: "test-model",
      fetchImpl: fetchImpl as any,
    });
    await p.generate("market-sizer", { query: "q", keywords: ["a"] });
    expect(capturedUrl).toBe("https://example.com/v1/chat/completions");
    expect(capturedBody.model).toBe("test-model");
    expect(capturedBody.response_format.type).toBe("json_object");
  });

  it("injects the schema-aware system prompt into the LLM call", async () => {
    let systemContent = "";
    let userContent = "";
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      const messages = JSON.parse(init.body).messages;
      systemContent = messages.find((m: any) => m.role === "system").content;
      userContent = messages.find((m: any) => m.role === "user").content;
      return { ok: false, status: 401 } as any;
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("market-sizer", { query: "AI code reviewer", keywords: ["devtools"] });

    // The system prompt must name the agent and show its required schema fields
    // (the old prompt only said "match the LaunchLens schema" without showing it).
    expect(systemContent).toContain("market-sizer");
    expect(systemContent).toContain("TAM");
    expect(systemContent).toContain("SAM");
    expect(systemContent).toContain("citations");
    expect(systemContent).toContain("targetSegments");

    // The user prompt must carry the product query and keywords the model needs.
    expect(userContent).toContain("AI code reviewer");
    expect(userContent).toContain("devtools");
  });

  it("injects synthesis agent coaching when generating synthesis", async () => {
    let systemContent = "";
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      systemContent = JSON.parse(init.body).messages.find((m: any) => m.role === "system").content;
      return { ok: false, status: 401 } as any;
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("synthesis", { query: "q", keywords: [] });
    expect(systemContent).toContain("synthesis");
    expect(systemContent).toContain("opportunityScore");
    expect(systemContent).toContain("launchlensBrief");
  });

  it("reports onFallback(http_error) when the provider returns 4xx", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    await p.generate("market-sizer", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("http_error");
  });

  it("reports onFallback(validation_error) when the LLM output fails schema validation", async () => {
    // Valid JSON but wrong agent — validateAgentOutput rejects it.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ agent: "wrong" }) } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const out = await p.generate("channel-scout", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("validation_error");
    // Still returns mock output so the session completes.
    expect(out.agent).toBe("channel-scout");
  });

  it("reports onFallback(parse_error) when the response is not JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    await p.generate("pricing-scout", { query: "q", keywords: [], onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("parse_error");
  });

  it("reports onFallback(network_error) when fetch throws before a response", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validPayload) } }] }),
      } as any;
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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

  it("opens only one upstream request for a successful SSE response", async () => {
    const sse = `data: ${JSON.stringify({
      choices: [{ delta: { content: JSON.stringify(validPayload) } }],
    })}\n\ndata: [DONE]\n\n`;
    const fetchImpl = vi.fn(async () => new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl });
    const reasons: string[] = [];

    const out = await p.generate("channel-scout", {
      query: "q",
      keywords: [],
      onProgress: vi.fn(),
      onFallback: (reason) => reasons.push(reason),
    });

    expect(out.agent).toBe("channel-scout");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual([]);
  });

  it("does not report onFallback on a successful real call", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(validPayload) } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];
    const onProgress = vi.fn();
    const out = await p.generate("market-sizer", { query: "q", keywords: [], onProgress, onFallback: (r) => reasons.push(r) });
    expect(reasons).toContain("network_error");
    expect(out.agent).toBe("market-sizer");
  });
});
