// Client-side CSRF helper.
// Fetches a CSRF token from /api/csrf and caches it for reuse.
// Provides fetchWithCsrf() that includes the X-CSRF-Token header.

let cachedToken: string | null = null;
let fetchingPromise: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (fetchingPromise) return fetchingPromise;

  fetchingPromise = (async () => {
    try {
      const res = await fetch("/api/csrf");
      const data = await res.json();
      const tok: string = data.csrfToken || "";
      cachedToken = tok;
      return tok;
    } catch {
      cachedToken = "";
      return "";
    } finally {
      fetchingPromise = null;
    }
  })();

  return fetchingPromise;
}

export function invalidateCsrfToken(): void {
  cachedToken = null;
}

export interface CsrfFetchOptions extends Omit<RequestInit, "headers"> {
  headers?: HeadersInit;
}

/**
 * Fetch with CSRF token automatically added to headers.
 * Only adds CSRF for non-GET/HEAD/OPTIONS requests.
 */
export async function fetchWithCsrf(
  url: string,
  options: CsrfFetchOptions = {},
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const safeMethods = ["GET", "HEAD", "OPTIONS"];

  if (safeMethods.includes(method)) {
    return fetch(url, options);
  }

  const token = await getCsrfToken();
  const headers = new Headers(options.headers as HeadersInit || {});
  if (token) {
    headers.set("X-CSRF-Token", token);
  }

  return fetch(url, { ...options, headers });
}

/* ------------------------------------------------------------------ */
/*  Pure csrf-client helpers (round 165)                              */
/* ------------------------------------------------------------------ */

export const CSRF_HEADER = "X-CSRF-Token";
export const CSRF_ENDPOINT = "/api/csrf";
export const CSRF_SAFE_METHODS = ["GET", "HEAD", "OPTIONS"] as const;
export type HttpMethod = typeof CSRF_SAFE_METHODS[number] | "POST" | "PUT" | "PATCH" | "DELETE";

/** Normalize HTTP method to uppercase, default to GET. */
export function normalizeMethod(method: string | undefined): string {
  if (!method) return "GET";
  const m = method.trim().toUpperCase();
  return /^[A-Z]+$/.test(m) ? m : "GET";
}

/** True for safe (idempotent, non-mutating) methods that do not need a CSRF token. */
export function isCsrfSafeMethod(method: string | undefined): boolean {
  return CSRF_SAFE_METHODS.includes(normalizeMethod(method) as any);
}

/** Merge CSRF header into existing headers, preserving user values when present. */
export function withCsrfHeader(
  headers: HeadersInit | undefined,
  token: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => { out[k] = v; });
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) if (k) out[k] = v;
    } else {
      Object.assign(out, headers);
    }
  }
  if (token && !out[CSRF_HEADER]) out[CSRF_HEADER] = token;
  return out;
}

/** Validate URL/path string for fetch (rejects javascript:/data: schemes, ensures non-empty). */
export function isValidFetchUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false;
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) return false;
  return true;
}

/** Build a fetch init that includes CSRF header when method is not safe (pure, no I/O). */
export function buildCsrfInit(
  options: CsrfFetchOptions,
  token: string | null,
): CsrfFetchOptions {
  const method = normalizeMethod(options.method);
  const headers = isCsrfSafeMethod(method)
    ? { ...(options.headers || {}) }
    : withCsrfHeader(options.headers, token);
  return { ...options, method, headers };
}

/** Categorize common failure causes for error messages. */
export function csrfErrorMessage(err: unknown): string {
  if (err instanceof TypeError && /failed to fetch/i.test(err.message)) return "Network error; please check your connection.";
  if (err instanceof Error) return err.message;
  return "Unknown CSRF/fetch error.";
}


/* ------------------------------------------------------------------ */
/*  429 / rate-limit aware fetch helpers (round 183)                  */
/* ------------------------------------------------------------------ */

export interface RateLimitInfo {
  limited: boolean;
  retryAfterMs: number | null;
}

/** Parse a 429 response into a retry delay (ms). Honors Retry-After header. */
export function parseRateLimit(response: Response): RateLimitInfo {
  if (response.status !== 429) return { limited: false, retryAfterMs: null };
  const ra = response.headers.get("retry-after");
  let ms: number | null = null;
  if (ra) {
    const n = Number(ra);
    if (Number.isFinite(n)) ms = n >= 1_000_000 ? n : n * 1000; // sec vs ms heuristic
    else {
      const d = new Date(ra).getTime();
      if (Number.isFinite(d)) ms = Math.max(0, d - Date.now());
    }
  }
  if (ms === null || ms < 0) ms = 5000;
  return { limited: true, retryAfterMs: Math.min(ms, 60_000) };
}

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface FetchWithCsrfOptions extends CsrfFetchOptions {
  /** When the server responds 429, throw a RateLimitError instead of returning the Response. */
  throwOnRateLimit?: boolean;
}

/** fetchWithCsrf extended: optionally throws RateLimitError on 429. */
export async function fetchWithCsrfStrict(
  url: string,
  options: FetchWithCsrfOptions = {},
): Promise<Response> {
  const { throwOnRateLimit, ...rest } = options;
  const res = await fetchWithCsrf(url, rest);
  if (throwOnRateLimit && res.status === 429) {
    const info = parseRateLimit(res);
    // Attempt to read JSON error body
    let msg = "Too many requests";
    try {
      const body = await res.clone().json();
      if (body && body.error) msg = String(body.error);
    } catch { /* ignore */ }
    throw new RateLimitError(msg, info.retryAfterMs ?? 5000);
  }
  return res;
}
