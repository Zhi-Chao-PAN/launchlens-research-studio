// Server-side i18n helper — picks a locale from the request's Accept-Language
// header (or the request/headers object directly) and returns a translate()
// function bound to that locale. Safe to call from route handlers, server
// components, and middleware.
//
// Usage:
//   const { t } = createServerI18n(request);
//   const msg = t("errors.rateLimit", { seconds: "30" });

import {
  type Locale,
  type DictionaryKey,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  translate as translateFn,
} from "@/lib/i18n/dictionaries";

export interface ServerI18n {
  locale: Locale;
  /** Translate a dictionary key, with optional {placeholder} interpolation. */
  t: (key: DictionaryKey | string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
}

// RFC-4647 "basic" matching with q-factor parsing.
function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const entries = header
    .split(",")
    .map((raw) => {
      const parts = raw.trim().split(";");
      const tag = parts[0].trim();
      let quality = 1;
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i].trim();
        if (p.startsWith("q=")) {
          const q = Number.parseFloat(p.slice(2));
          if (Number.isFinite(q)) quality = q;
          break;
        }
      }
      return { tag: tag.toLowerCase(), quality };
    })
    .filter((e) => e.tag && e.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  // Walk entries in quality order; return the first that matches either
  // exactly or by primary language subtag. This way a higher-quality entry
  // like "zh-TW" (primary=zh → zh-CN) beats a lower-quality exact match like
  // "en;q=0.5".
  for (const { tag } of entries) {
    // Exact match (e.g. "zh-CN" or underscore form "zh_CN").
    const exact = SUPPORTED_LOCALES.find(
      (l) => l.toLowerCase() === tag || l.toLowerCase().replace("_", "-") === tag,
    );
    if (exact) return exact;
    // Primary-language subtag match (e.g. "zh-TW" → "zh-CN").
    const primary = tag.split("-")[0].toLowerCase();
    const match = SUPPORTED_LOCALES.find(
      (l) => l.split("-")[0].toLowerCase() === primary,
    );
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

// Accept a Next.js Request, a Web Headers object, or a raw Accept-Language string.
export type LocaleSource =
  | Request
  | Headers
  | { headers?: Headers | Record<string, string | null | undefined> | null }
  | string
  | null
  | undefined;

function readAcceptLanguage(source: LocaleSource): string | undefined {
  if (source == null) return undefined;
  if (typeof source === "string") return source;
  const headers =
    source instanceof Headers
      ? source
      : source instanceof Request
        ? source.headers
        : source.headers && source.headers instanceof Headers
          ? source.headers
          : null;
  if (headers) return headers.get("accept-language") ?? undefined;
  // Plain object with headers record.
  if (source && typeof source === "object" && "headers" in source && source.headers) {
    const rec = source.headers as Record<string, string | null | undefined>;
    return rec["accept-language"] ?? rec["Accept-Language"] ?? undefined;
  }
  return undefined;
}

function readLocaleCookie(): string | undefined {
  // Client stores locale in localStorage, not cookies — server has no access.
  return undefined;
}

function resolveLocale(source: LocaleSource): Locale {
  // 1. Cookie override (placeholder for future cookie-based locale selection)
  const cookieVal = readLocaleCookie();
  if (cookieVal && SUPPORTED_LOCALES.includes(cookieVal as Locale)) {
    return cookieVal as Locale;
  }
  // 2. Accept-Language header
  const al = readAcceptLanguage(source);
  if (al) {
    const picked = pickLocaleFromAcceptLanguage(al);
    if (picked) return picked;
  }
  return DEFAULT_LOCALE;
}

export function createServerI18n(source: LocaleSource): ServerI18n {
  const locale = resolveLocale(source);
  const t = (
    key: DictionaryKey | string,
    fallbackOrParams?: string | Record<string, string | number>,
    params?: Record<string, string | number>,
  ): string => {
    const fallback = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
    const p = params ?? (typeof fallbackOrParams === "object" ? fallbackOrParams : undefined);
    return translateFn(locale, key, fallback, p);
  };
  return { locale, t };
}

/**
 * R203: resolve the locale from the incoming request's Accept-Language
 * header, for use as the server-rendered `<html lang>` attribute. The
 * client LocaleProvider will refine this from localStorage on mount, but
 * getting the SSR attribute right avoids a flash of the wrong `lang` and
 * is correct for no-JS / crawler views. Previously this was hardcoded to
 * `zh-CN`, which was wrong for the default `en` locale.
 */
export function resolveLocaleFromHeaders(headers: Headers): Locale {
  return resolveLocale({ headers });
}
