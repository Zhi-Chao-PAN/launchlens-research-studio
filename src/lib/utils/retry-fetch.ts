/**
 * Fetch with retry support and exponential backoff.
 *
 * Usage:
 *   const data = await retryFetch("/api/foo", { retries: 3 });
 *
 * Backoff waits honour the caller's AbortSignal so cancellation is prompt.
 */

import { sleep } from "@/lib/utils/sleep";

export interface RetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number; // base delay in ms
  backoffMultiplier?: number;
  retryOn?: number[]; // status codes to retry on
  timeoutMs?: number; // per-request timeout
}

const DEFAULT_RETRY_STATUS = [408, 429, 500, 502, 503, 504];

export async function retryFetch(
  input: string | URL | Request,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 300,
    backoffMultiplier = 2,
    retryOn = DEFAULT_RETRY_STATUS,
    timeoutMs = 30000,
    signal: callerSignal,
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (callerSignal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    // Compose the per-request timeout signal with the caller's signal.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException("Request timed out.", "TimeoutError")), timeoutMs);
    const abortOn = (src: AbortSignal | null | undefined) => {
      if (!src) return;
      if (src.aborted) controller.abort();
      else src.addEventListener("abort", () => controller.abort(), { once: true, signal: controller.signal });
    };
    abortOn(callerSignal);

    try {
      const res = await fetch(input, { ...fetchOptions, signal: controller.signal });
      if (res.ok || attempt >= retries || !retryOn.includes(res.status)) {
        return res;
      }
      // Retry-able status — backoff and retry.
      const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
      const jitter = delay * (Math.random() * 0.2);
      await sleep(delay + jitter, { signal: callerSignal });
    } catch (e: unknown) {
      lastError = e;
      // Surface abort immediately rather than retrying.
      if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
        if (callerSignal?.aborted && e.name !== "TimeoutError") throw e;
        if (attempt >= retries) throw e;
      }
      if (attempt >= retries) throw e;
      const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
      const jitter = delay * (Math.random() * 0.2);
      await sleep(delay + jitter, { signal: callerSignal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Should not reach here, but just in case
  throw lastError ?? new Error("Fetch failed after retries");
}

/**
 * Fetch JSON with retry + auto-parse.
 */
export async function retryFetchJson<T = unknown>(
  input: string | URL | Request,
  options?: RetryOptions
): Promise<T> {
  const res = await retryFetch(input, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Safely parse JSON without throwing.
 */
export function safeJson<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
