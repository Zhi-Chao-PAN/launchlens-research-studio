/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createOpenAIProvider } from "./openai-provider";
import { mockResearchProvider } from "./mock-provider-adapter";

function mockSSEResponse(chunks: string[]): any {
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read: async () => {
            if (i >= chunks.length) return { done: true, value: undefined };
            const value = new TextEncoder().encode(chunks[i++]);
            return { done: false, value };
          },
        };
      },
    },
  };
}

function dataLine(deltaText: string): string {
  // The SSE frame is itself JSON-encoded, with the model's content embedded
  // as another string. Use JSON.stringify for the inner content to escape
  // the JSON we want the streaming reader to assemble.
  const frame = JSON.stringify({
    choices: [{ delta: { content: deltaText } }],
  });
  return "data: " + frame + "\n";
}

describe("OpenAI provider streaming path", () => {
  it("invokes onProgress for each delta and validates final JSON", async () => {
    const validPayload = JSON.stringify({
      agent: "channel-scout",
      summary: "ok",
      channels: [],
      citations: [],
    });
    const ssePayload = [
      dataLine(validPayload.slice(0, 25)),
      dataLine(validPayload.slice(25)),
      "data: [DONE]\n",
    ];
    const fetchImpl = vi.fn(async () => mockSSEResponse(ssePayload));
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    const events: { fraction: number; partial?: string }[] = [];
    const out = await p.generate("channel-scout", {
      query: "q",
      keywords: [],
      onProgress: (e) => events.push({ fraction: e.fraction, partial: e.partial }),
    });
    expect(out.agent).toBe("channel-scout");
    expect(events.some((e) => typeof e.partial === "string" && e.partial.length > 0)).toBe(true);
    expect(events.find((e) => e.fraction === 1)).toBeDefined();
  });

  it("requests stream:true when onProgress is provided", async () => {
    let capturedBody: any = null;
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return mockSSEResponse(["data: [DONE]\n"]);
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("market-sizer", {
      query: "q",
      keywords: [],
      onProgress: () => {},
    });
    expect(capturedBody.stream).toBe(true);
  });

  it("requests stream:false when onProgress is omitted", async () => {
    let capturedBody: any = null;
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "{}" } }] }),
      } as any;
    });
    const p = createOpenAIProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("market-sizer", { query: "q", keywords: [] });
    expect(capturedBody.stream).toBe(false);
  });
});

describe("mock provider progress events", () => {
  it("emits 4 progress events when onProgress provided", async () => {
    const events: number[] = [];
    await mockResearchProvider.generate("market-sizer", {
      query: "q",
      keywords: [],
      onProgress: (e) => events.push(e.fraction),
    });
    expect(events).toEqual([0.2, 0.5, 0.85, 1.0]);
  });
});
