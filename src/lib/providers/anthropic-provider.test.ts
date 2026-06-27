/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";

const validPayload = {
  agent: "channel-scout",
  summary: "ok",
  channels: [],
  citations: [],
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
});
