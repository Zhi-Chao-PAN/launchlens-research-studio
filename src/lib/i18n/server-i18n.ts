// Server-side i18n helper for API routes.
// Detects locale from the Accept-Language header and returns translated strings.
// Uses the same dictionaries as the client-side LocaleProvider to keep keys
// consistent across the stack.

import {
  translate,
  format,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type Locale,
  type DictionaryKey,
} from "@/lib/i18n/dictionaries";

const QUALITY_RE = /;q=([0-9.]+)/;

/**
 * Parse an Accept-Language header value and return the best matching locale.
 * Returns DEFAULT_LOCALE if no match is found.
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const locales = header
    .split(",")
    .map((tag) => {
      const match = tag.match(QUALITY_RE);
      const quality = match ? parseFloat(match[1]) : 1;
      const lang = tag.replace(QUALITY_RE, "").trim();
      return { lang, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { lang } of locales) {
    const lower = lang.toLowerCase();
    // Exact match first
    if (SUPPORTED_LOCALES.includes(lower as Locale)) return lower as Locale;
    // Prefix match (e.g., "zh" → "zh-CN", "en-US" → "en")
    const prefix = lower.split("-")[0];
    const match = SUPPORTED_LOCALES.find(
      (l) => l === prefix || l.startsWith(prefix + "-"),
    );
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}

/**
 * Extract a Headers instance (something with a .get(name):string|null method)
 * from a Request, a Headers, or Next 16's ReadonlyHeaders / HeadersAdapter.
 *
 * We avoid the naive `"headers" in x` duck-type because Next 16's
 * HeadersAdapter (what `await headers()` returns at runtime) has its own
 * own-enumerable property named `headers` that shadows the Headers shape —
 * that property is a Proxy wrapping IncomingHttpHeaders and has no .get()
 * method, which used to produce `.get is not a function` crashes on pages
 * that passed `await headers()` directly (e.g. /diagnostics).
 */
function extractHeaders(requestOrHeaders: Request | Headers): Headers {
  // 1. Genuine Request (fetch/Request API, passed by API route handlers).
  if (typeof Request !== "undefined" && requestOrHeaders instanceof Request) {
    return requestOrHeaders.headers;
  }
  // 2. Anything that looks like a Headers instance — including Next 16's
  //    ReadonlyHeaders wrapper, which still exposes a working .get().
  const candidate = requestOrHeaders as { headers?: unknown; get?: unknown };
  if (typeof candidate.get === "function") {
    return requestOrHeaders as Headers;
  }
  // 3. Last resort: maybe it's a Request-shaped object without being an
  //    instance of Request (e.g. some test doubles / Next internal types).
  const nested = candidate.headers as { get?: unknown } | undefined;
  if (nested && typeof nested.get === "function") {
    return nested as Headers;
  }
  // 4. Fallback: return empty Headers so callers don't crash; Accept-Language
  //    resolution will just fall back to DEFAULT_LOCALE.
  return new Headers();
}

/**
 * Create a server-side translator from a Request or Headers object.
 * Returns t() and fmt() functions bound to the detected locale.
 */
export function createServerI18n(requestOrHeaders: Request | Headers) {
  const hdrs = extractHeaders(requestOrHeaders);
  const acceptLang = hdrs.get("accept-language");
  const locale = parseAcceptLanguage(acceptLang);

  return {
    locale,
    t: (key: DictionaryKey | string, fallback?: string) =>
      translate(locale, key, fallback),
    fmt: (
      key: DictionaryKey | string,
      vars: Record<string, string | number>,
      fallback?: string,
    ) => format(locale, key, vars, fallback),
  };
}
