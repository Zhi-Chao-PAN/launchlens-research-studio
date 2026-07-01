// Retry an async operation with exponential backoff and jitter.
// Designed for transient provider failures (HTTP 5xx, timeouts, parse).
// The caller decides which errors are retriable via the shouldRetry hook.
// Backoff waits are abortable via `signal` so cancellation is prompt.

import { sleep } from "@/lib/utils/sleep";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, error: unknown | null) => void;
}

/**
 * True when `err` looks like an AbortError tied to the supplied signal.
 * Used to short-circuit retry loops so we don't burn extra attempts after
 * a caller cancels.
 */
function isAbortErrorLike(err: unknown, signal?: AbortSignal): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  if (name === "AbortError") return true;
  if (signal?.aborted && (err as { name?: unknown }).name === "AbortError") {
    return true;
  }
  return false;
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const base = opts.baseDelayMs ?? 200;
  const cap = opts.maxDelayMs ?? 4000;
  const should = opts.shouldRetry ?? (() => true);

  let lastErr: unknown = new Error("retry never ran");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    try {
      opts.onAttempt?.(attempt, null);
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(attempt, err);
      // Abort: stop immediately, do not consult shouldRetry or back off.
      if (isAbortErrorLike(err, opts.signal) || opts.signal?.aborted) {
        throw err;
      }
      if (attempt >= maxAttempts || !should(err, attempt)) {
        throw err;
      }
      const exp = Math.min(cap, base * 2 ** (attempt - 1));
      const jitter = Math.random() * exp * 0.25;
      try {
        await sleep(exp + jitter, { signal: opts.signal });
      } catch (sleepErr) {
        // If sleep rejected because the signal aborted, surface that
        // immediately rather than treating it as a regular failure.
        if (isAbortErrorLike(sleepErr, opts.signal) || opts.signal?.aborted) {
          throw sleepErr;
        }
        throw sleepErr;
      }
    }
  }
  throw lastErr;
}

