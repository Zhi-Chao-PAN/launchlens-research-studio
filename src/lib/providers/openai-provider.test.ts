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
  it("retries 5xx then throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    await expect(p.generate("market-sizer", { query: "q", keywords: [] })).rejects.toThrow();
    // 5xx is retriable: retryWithBackoff makes up to 3 attempts.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx and throws immediately", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401 }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    await expect(p.generate("market-sizer", { query: "q", keywords: [] })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when JSON parse fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not json" } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    await expect(p.generate("pricing-scout", { query: "q", keywords: [] })).rejects.toThrow();
  });

  it("returns normalized output when validator fills defaults", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ agent: "channel-scout", summary: "ok" }) } }] }),
    }) as any);
    const p = createOpenAIProvider({ apiKey: "sk-x", fetchImpl: fetchImpl as any });
    const out = await p.generate("channel-scout", { query: "q", keywords: [] });
    // Validator normalizes output and fills default arrays
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
    await expect(p.generate("market-sizer", { query: "q", keywords: ["a"] })).rejects.toThrow();
    expect(capturedUrl).toBe("https://example.com/v1/chat/completions");
    expect(capturedBody.model).toBe("test-model");
    expect(capturedBody.response_format.type).toBe("json_object");
  });
});