// Retry an async operation with exponential backoff and jitter.
// Designed for transient provider failures (HTTP 5xx, timeouts, parse).
// The caller decides which errors are retriable via the shouldRetry hook.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  signal?: AbortSignal;
  onAttempt?: (attempt: number, error: unknown | null) => void;
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
      throw new Error("retry aborted");
    }
    try {
      opts.onAttempt?.(attempt, null);
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(attempt, err);
      if (attempt >= maxAttempts || !should(err, attempt)) {
        throw err;
      }
      const exp = Math.min(cap, base * 2 ** (attempt - 1));
      const jitter = Math.random() * exp * 0.25;
      await new Promise((resolve) => setTimeout(resolve, exp + jitter));
    }
  }
  throw lastErr;
}
