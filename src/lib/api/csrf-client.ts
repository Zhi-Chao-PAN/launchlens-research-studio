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

export interface CsrfFetchOptions extends RequestInit {
  headers?: Record<string, string>;
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
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers["X-CSRF-Token"] = token;
  }

  return fetch(url, { ...options, headers });
}
