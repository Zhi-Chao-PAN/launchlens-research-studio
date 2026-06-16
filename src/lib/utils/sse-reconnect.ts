// SSE streaming reader with automatic reconnect for mid-stream failures.
// Wraps a request factory rather than taking a Response, so it can
// fully re-establish the stream on drop. Designed for provider adapters
// where a transient network drop mid-stream should not silently degrade
// to mock — instead we reconnect and re-read from the beginning.
//
// The caller provides:
//   - makeRequest(): Promise<Response> — factory that starts a new SSE request
//   - onChunk(assembledText): void — called with the full assembled text so far
//   - parseEvent(payload): string | null — extracts text delta from a data: frame
//
// Returns the fully assembled text string, or throws if retries are exhausted.

import { retryWithBackoff } from "@/lib/utils/retry";

export interface SseReconnectOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, error: unknown | null) => void;
}

export type SseEventParser = (eventPayload: string) => string | null;

/**
 * Read a full SSE stream with automatic reconnect on mid-stream failure.
 * The request is retried from scratch if the stream drops before the
 * connection closes cleanly. Each attempt replaces the accumulated text,
 * so on-progress callers may see progress "reset" — that's expected.
 */
export async function readSseWithReconnect(
  makeRequest: () => Promise<Response>,
  onChunk: (assembled: string) => void,
  parseEvent: SseEventParser,
  opts: SseReconnectOptions = {},
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 3;

  const attempt = async (): Promise<string> => {
    opts.signal?.throwIfAborted();
    const res = await makeRequest();
    if (!res.ok) {
      throw new Error("sse HTTP " + res.status);
    }
    if (!res.body) {
      throw new Error("sse no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let receivedDone = false;

    try {
      for (;;) {
        opts.signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) {
          receivedDone = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const delta = parseEvent(payload);
          if (delta !== null && delta.length > 0) {
            assembled += delta;
            onChunk(assembled);
          }
        }
      }
    } catch (err) {
      // Mid-stream failure: treat as retriable so we reconnect.
      // Throw a tagged error so the outer retry knows to retry.
      throw new RetriableSseError("sse mid-stream drop: " + String(err));
    } finally {
      try { reader.releaseLock(); } catch {
        // best-effort cleanup
      }
    }

    if (!receivedDone) {
      throw new RetriableSseError("sse stream ended without clean close");
    }

    return assembled;
  };

  return retryWithBackoff(attempt, {
    maxAttempts,
    baseDelayMs: opts.baseDelayMs ?? 300,
    maxDelayMs: opts.maxDelayMs ?? 3000,
    signal: opts.signal,
    onAttempt: opts.onAttempt,
    shouldRetry: (err) => err instanceof RetriableSseError,
  });
}

export class RetriableSseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetriableSseError";
  }
}

/**
 * Build a parseEvent function for OpenAI-style SSE (choices[0].delta.content).
 */
export function parseOpenAiSse(payload: string): string | null {
  try {
    const json = JSON.parse(payload);
    const delta = json?.choices?.[0]?.delta?.content;
    return typeof delta === "string" ? delta : null;
  } catch {
    return null;
  }
}

/**
 * Build a parseEvent function for Anthropic-style SSE (content_block_delta).
 */
export function parseAnthropicSse(payload: string): string | null {
  try {
    const event = JSON.parse(payload);
    if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
      const t = event.delta.text;
      return typeof t === "string" ? t : null;
    }
    return null;
  } catch {
    return null;
  }
}
