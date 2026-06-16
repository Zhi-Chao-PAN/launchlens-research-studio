/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";

function mockSSE(chunks: string[]): any {
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
  return "data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: deltaText } }) + "\n";
}

describe("Anthropic streaming", () => {
  it("forwards content_block_delta events to onProgress and validates final JSON", async () => {
    const validPayload = JSON.stringify({
      agent: "channel-scout",
      summary: "ok",
      channels: [],
      citations: [],
    });
    const ssePayload = [
      dataLine(validPayload.slice(0, 25)),
      dataLine(validPayload.slice(25)),
      "data: {\"type\":\"message_stop\"}\n",
    ];
    const fetchImpl = vi.fn(async () => mockSSE(ssePayload));
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
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
    let body: any = null;
    const fetchImpl = vi.fn(async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return mockSSE(["data: {\"type\":\"message_stop\"}\n"]);
    });
    const p = createAnthropicProvider({ apiKey: "k", fetchImpl: fetchImpl as any });
    await p.generate("market-sizer", { query: "q", keywords: [], onProgress: () => {} });
    expect(body.stream).toBe(true);
  });
});
