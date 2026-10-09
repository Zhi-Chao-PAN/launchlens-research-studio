// Retry an async operation with exponential backoff and jitter.
// Designed for transient provider failures (HTTP 5xx, timeouts, parse).
// The caller decides which errors are retriable via the shouldRetry hook.
//
// Abort handling: when a signal aborts mid-retry, the promise rejects with a
// DOMException("AbortError") so callers can uniformly detect user-initiated
// cancellation (via err.name === "AbortError") regardless of whether the
// abort fired during fn() or during the sleep between attempts.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, error: unknown | null) => void;
}

function createAbortError(): Error {
  // Prefer DOMException for proper name-based detection; fall back to Error.
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const err = new Error("AbortError");
  err.name = "AbortError";
  return err;
}

export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const base = opts.baseDelayMs ?? 200;
  const cap = opts.maxDelayMs ?? 4000;
  const should = opts.shouldRetry ?? (() => true);
  const { signal } = opts;

  // If already aborted, fail immediately
  if (signal?.aborted) {
    throw createAbortError();
  }

  let lastErr: unknown = new Error("retry never ran");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Re-check abort at the top of each iteration
    if (signal?.aborted) {
      throw createAbortError();
    }
    try {
      opts.onAttempt?.(attempt, null);
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(attempt, err);
      // If the operation itself aborted, propagate immediately without retry
      if (isAbortError(err) || signal?.aborted) {
        throw createAbortError();
      }
      if (attempt >= maxAttempts || !should(err, attempt)) {
        throw err;
      }
      const exp = Math.min(cap, base * 2 ** (attempt - 1));
      const jitter = Math.random() * exp * 0.25;
      const delay = exp + jitter;
      await sleep(delay, signal);
    }
  }
  throw lastErr;
}

export function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error) {
    if (err.name === "AbortError") return true;
    if ((err as any).code === 20 /* ABORT_ERR */) return true;
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Fast path: no signal, just setTimeout
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
