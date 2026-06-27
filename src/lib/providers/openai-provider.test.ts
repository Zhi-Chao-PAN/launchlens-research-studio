/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider";

const validPayload = {
  agent: "channel-scout",
  summary: "ok",
  channels: [],
  citations: [],
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
    expect(systemContent).toContain("riskScore");
    expect(systemContent).toContain("launchlensBrief");
  });
});
