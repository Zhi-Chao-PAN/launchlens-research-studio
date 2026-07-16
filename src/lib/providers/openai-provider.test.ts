/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider";
import type { RetrievedSource } from "./retrieval.types";

const retrievedSource: RetrievedSource = {
  id: "source-openai-1",
  title: "OpenAI provider evidence",
  url: "https://evidence.example/openai",
  snippet: "Grounded market evidence passed through ProviderContext.",
  accessedAt: "2026-07-13T00:00:00.000Z",
  retrievedAt: "2026-07-13T00:00:00.000Z",
  confidence: "high",
  agent: "market-sizer",
};

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

const validCompetitorPayload = {
  agent: "competitor-analyst",
  summary: "real competitor evidence",
  competitors: [
    {
      id: "c1",
      name: "GitHub",
      tagline: "Developer portfolio surface",
      strengths: ["large developer graph"],
      weaknesses: ["not admissions-specific"],
      pricing: { min: 0, max: 4, model: "freemium", currency: "USD" },
      positioning: "niche",
      differentiation: "developer network",
      citations: ["src1"],
    },
  ],
  competitiveMatrix: [],
  gaps: [],
  citations: [{ id: "src1", title: "Source", snippet: "portfolio workflows mention GitHub" }],
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

  it("strict mode surfaces a bounded 401 instead of swallowing it into mock", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const provider = createOpenAIProvider({
      apiKey: "sk-managed",
      fetchImpl: fetchImpl as any,
      failureMode: "throw",
      maxAttempts: 1,
      allowStructuredRepair: false,
    });

    await expect(provider.generate("market-sizer", { query: "q", keywords: [] }))
      .rejects.toMatchObject({ kind: "http", status: 401 });
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

  it("normalizes recoverable real output instead of falling back to mock", async () => {
    const recoverablePayload = {
      agent: "pain-detective",
      summary: "Real user pain evidence from the provider",
      citations: [{ id: "c1", title: "Interview evidence", snippet: "buyers mention manual review delays" }],
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(recoverablePayload) } }] }),
    }) as any);
    const reasons: string[] = [];
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });

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

  it("uses the MiniMax OpenAI-compatible request profile", async () => {
    let capturedBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return { ok: false, status: 401 } as Response;
    });
    const provider = createOpenAIProvider({
      apiKey: "k",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await provider.generate("market-sizer", { query: "q", keywords: [] });

    expect(capturedBody).toMatchObject({
      model: "MiniMax-M3",
      temperature: 0.4,
      max_completion_tokens: 8_192,
    });
    expect(capturedBody).not.toHaveProperty("max_tokens");
    expect(capturedBody).not.toHaveProperty("response_format");
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

  it("passes ProviderContext retrieved sources into the untrusted user-prompt boundary", async () => {
    let userContent = "";
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      const messages = JSON.parse(init.body).messages;
      userContent = messages.find((message: any) => message.role === "user").content;
      return { ok: false, status: 401 } as any;
    });
    const provider = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });

    await provider.generate("market-sizer", {
      query: "AI code reviewer",
      keywords: [],
      retrievedSources: [retrievedSource],
    });

    expect(userContent).toMatch(/retrieved and allowlisted external sources/i);
    expect(userContent).toMatch(/untrusted data/i);
    expect(userContent).toContain('"id":"source-openai-1"');
    expect(userContent).toContain('"url":"https://evidence.example/openai"');
    expect(userContent).toContain('"snippet":"Grounded market evidence passed through ProviderContext."');
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

  it("passes the structural validation summary into the synthesis prompt", async () => {
    let userContent = "";
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      userContent = JSON.parse(init.body).messages.find((message: any) => message.role === "user").content;
      return { ok: false, status: 401 } as any;
    });
    const provider = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });

    await provider.generate("synthesis", {
      query: "q",
      keywords: [],
      validationSummary: "One structural pass; semantic validation NOT RUN.",
    });

    expect(userContent).toContain("One structural pass; semantic validation NOT RUN.");
    expect(userContent).toMatch(/not factual verification/i);
  });

  it("reports onFallback(http_error) when the provider returns 4xx", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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

  it("recovers a streaming parse_error with one non-streaming retry", async () => {
    const malformedSse = `data: ${JSON.stringify({
      choices: [{ delta: { content: "not json at all" } }],
    })}\n\ndata: [DONE]\n\n`;
    let attempt = 0;
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      attempt++;
      const body = JSON.parse(init.body);
      if (attempt === 1) {
        expect(body.stream).toBe(true);
        return new Response(malformedSse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      expect(body.stream).toBe(false);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(validCompetitorPayload) } }] }),
      } as any;
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];

    const out = await p.generate("competitor-analyst", {
      query: "AI portfolio automation",
      keywords: ["portfolio"],
      onProgress: vi.fn(),
      onFallback: (reason) => reasons.push(reason),
    });

    expect(out.agent).toBe("competitor-analyst");
    if (out.agent !== "competitor-analyst") throw new Error("expected competitor output");
    expect(out.summary).toBe("real competitor evidence");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(reasons).toEqual([]);
  });

  it("recovers a streaming validation error with one non-streaming retry", async () => {
    const invalidSse = `data: ${JSON.stringify({
      choices: [{ delta: { content: JSON.stringify({ agent: "channel-scout" }) } }],
    })}\n\ndata: [DONE]\n\n`;
    let attempt = 0;
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      attempt++;
      const body = JSON.parse(init.body);
      if (attempt === 1) {
        expect(body.stream).toBe(true);
        return new Response(invalidSse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      expect(body.stream).toBe(false);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(validPayload) } }],
        }),
      } as any;
    });
    const provider = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const reasons: string[] = [];

    const out = await provider.generate("channel-scout", {
      query: "q",
      keywords: [],
      onProgress: vi.fn(),
      onFallback: (reason) => reasons.push(reason),
    });

    expect(out.agent).toBe("channel-scout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(reasons).toEqual([]);
  });
});
