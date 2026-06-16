/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider";

describe("createOpenAIProvider", () => {
  it("falls back to mock on HTTP failure", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 } as any));
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(out.agent).toBe("market-sizer");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("falls back to mock when JSON parse fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json" } }] }),
    } as any));
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("pricing-scout", { query: "q", keywords: [] });
    expect(out.agent).toBe("pricing-scout");
  });
  it("returns parsed JSON when remote succeeds", async () => {
    const fakePayload = { agent: "channel-scout", citations: [], confidence: "medium", channels: [], summary: "ok" };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(fakePayload) } }] }),
    } as any));
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
});
