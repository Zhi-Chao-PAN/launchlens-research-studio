import {
  readSseWithReconnect,
  parseOpenAiSse,
  parseAnthropicSse,
  RetriableSseError,
} from "@/lib/utils/sse-reconnect";

// Build a minimal Response with a stream that yields SSE frames
function makeSseResponse(frames: string[], failAfter?: number): Response {
  let i = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // no-op, push on pull
    },
    pull(controller) {
      if (failAfter !== undefined && i >= failAfter) {
        controller.error(new Error("simulated drop"));
        return;
      }
      if (i >= frames.length) {
        controller.close();
        return;
      }
      const chunk = encoder.encode("data: " + frames[i] + "\n\n");
      controller.enqueue(chunk);
      i++;
    },
  });
  return { ok: true, body: stream, status: 200 } as unknown as Response;
}

function makeFailingResponse(): Response {
  return { ok: false, status: 503, body: null } as unknown as Response;
}

describe("sse-reconnect", () => {
  describe("parseOpenAiSse", () => {
    it("extracts content delta from OpenAI-style frames", () => {
      expect(parseOpenAiSse(JSON.stringify({ choices: [{ delta: { content: "hello" } }] }))).toBe("hello");
    });

    it("returns null for malformed payloads", () => {
      expect(parseOpenAiSse("not json")).toBeNull();
      expect(parseOpenAiSse("{}")).toBeNull();
    });
  });

  describe("parseAnthropicSse", () => {
    it("extracts text_delta from Anthropic-style frames", () => {
      expect(
        parseAnthropicSse(
          JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "world" } }),
        ),
      ).toBe("world");
    });

    it("ignores non-delta events", () => {
      expect(parseAnthropicSse(JSON.stringify({ type: "message_start" }))).toBeNull();
    });
  });

  describe("readSseWithReconnect", () => {
    it("reads a complete stream on first attempt", async () => {
      const frames = [
        JSON.stringify({ choices: [{ delta: { content: "hello " } }] }),
        JSON.stringify({ choices: [{ delta: { content: "world" } }] }),
      ];
      let callCount = 0;
      const chunks: string[] = [];

      const result = await readSseWithReconnect(
        () => {
          callCount++;
          return Promise.resolve(makeSseResponse(frames));
        },
        (text) => chunks.push(text),
        parseOpenAiSse,
      );

      expect(result).toBe("hello world");
      expect(callCount).toBe(1);
      expect(chunks).toEqual(["hello ", "hello world"]);
    });

    it("retries on mid-stream failure and eventually succeeds", async () => {
      const frames = [
        JSON.stringify({ choices: [{ delta: { content: "a" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "b" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "c" } }] }),
      ];
      let attempt = 0;

      const result = await readSseWithReconnect(
        () => {
          attempt++;
          // Fail after 1 frame on first attempt, succeed on second
          if (attempt === 1) {
            return Promise.resolve(makeSseResponse(frames, 1));
          }
          return Promise.resolve(makeSseResponse(frames));
        },
        () => {},
        parseOpenAiSse,
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
      );

      expect(result).toBe("abc");
      expect(attempt).toBe(2);
    });

    it("exhausts retries and surfaces the error", async () => {
      let callCount = 0;
      await expect(
        readSseWithReconnect(
          () => {
            callCount++;
            return Promise.resolve(
              makeSseResponse([JSON.stringify({ choices: [{ delta: { content: "x" } }] })], 0),
            );
          },
          () => {},
          parseOpenAiSse,
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
        ),
      ).rejects.toBeInstanceOf(RetriableSseError);
      expect(callCount).toBe(3);
    });

    it("throws non-retriable error on initial HTTP failure", async () => {
      let callCount = 0;
      await expect(
        readSseWithReconnect(
          () => {
            callCount++;
            return Promise.resolve(makeFailingResponse());
          },
          () => {},
          parseOpenAiSse,
          { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
        ),
      ).rejects.toThrow("sse HTTP 503");
      // HTTP errors are not tagged as retriable by default — one attempt
      expect(callCount).toBe(1);
    });

    it("respects pre-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const frames = [JSON.stringify({ choices: [{ delta: { content: "slow" } }] })];

      await expect(
        readSseWithReconnect(
          () => Promise.resolve(makeSseResponse(frames)),
          () => {},
          parseOpenAiSse,
          { signal: controller.signal },
        ),
      ).rejects.toThrow();
    });
  });

  describe("RetriableSseError", () => {
    it("has correct name and message", () => {
      const err = new RetriableSseError("test drop");
      expect(err.name).toBe("RetriableSseError");
      expect(err.message).toBe("test drop");
      expect(err instanceof Error).toBe(true);
    });
  });
});
