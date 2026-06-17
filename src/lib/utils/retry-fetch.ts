/**
 * Fetch with retry support and exponential backoff.
 *
 * Usage:
 *   const data = await retryFetch("/api/foo", { retries: 3 });
 */

export interface RetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number; // base delay in ms
  backoffMultiplier?: number;
  retryOn?: number[]; // status codes to retry on
  timeoutMs?: number; // per-request timeout
}

const DEFAULT_RETRY_STATUS = [408, 429, 500, 502, 503, 504];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    ...fetchOptions
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const signal = fetchOptions.signal
        ? (() => {
            const combined = new AbortController();
            fetchOptions.signal.addEventListener("abort", () => combined.abort());
            controller.signal.addEventListener("abort", () => combined.abort());
            return combined.signal;
          })()
        : controller.signal;

      const res = await fetch(input, { ...fetchOptions, signal });
      clearTimeout(timeoutId);

      if (res.ok || attempt >= retries || !retryOn.includes(res.status)) {
        return res;
      }

      // Retry-able status
      const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
      // Add jitter (0-20%)
      const jitter = delay * (Math.random() * 0.2);
      await wait(delay + jitter);
    } catch (e: unknown) {
      lastError = e;
      if (attempt >= retries) {
        throw e;
      }
      const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
      const jitter = delay * (Math.random() * 0.2);
      await wait(delay + jitter);
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
