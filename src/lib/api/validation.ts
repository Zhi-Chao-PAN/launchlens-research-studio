/* eslint-disable @typescript-eslint/no-explicit-any */
// Input validation and error handling for the research API.
// Centralized so the rules and error shapes are consistent across endpoints.

import { NextResponse } from "next/server";
import { createServerI18n, type LocaleSource } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";

export const QUERY_LIMITS = {
  MIN_QUERY_LENGTH: 3,
  MAX_QUERY_LENGTH: 1000,
  MAX_KEYWORDS: 12,
  MAX_KEYWORD_LENGTH: 40,
} as const;

export type ValidationError = {
  ok: false;
  status: 400;
  body: { error: string; field?: string; details?: string };
};

export type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

export type ValidationResult<T> = ValidationError | ValidationSuccess<T>;

/**
 * Localized variant of validateResearchRequest. The error messages
 * route through the i18n dictionary (validation.* keys) so that
 * clients see the same language as the rest of the app, with
 * {min}, {max}, {got}, {index} placeholders interpolated.
 */
export function validateResearchRequestLocalized(
  body: unknown,
  source?: LocaleSource,
): ValidationResult<{ query: string; keywords: string[] }> {
  // When no LocaleSource is supplied, fall back to the English template
  // strings verbatim and still substitute {placeholder}s so callers that
  // do not pass a source (i.e. the existing validateResearchRequest
  // wrapper) get the same shape they used to.
  const fallbackT = (
    key: string,
    fallback: string,
    params?: Record<string, string | number>,
  ): string => {
    let raw = fallback;
    if (params) {
      for (const [name, val] of Object.entries(params)) {
        raw = raw.replace(new RegExp(`\\{\\s*${name}\\s*\\}`, "g"), String(val));
      }
    }
    void key;
    return raw;
  };
  const t = source ? createServerI18n(source).t : fallbackT;

  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      body: { error: t("validation.bodyNotObject", "Request body must be a JSON object.") },
    };
  }

  const obj = body as Record<string, unknown>;
  const { query, keywords } = obj;

  if (typeof query !== "string") {
    return {
      ok: false,
      status: 400,
      body: {
        error: t("validation.queryRequired", "Field 'query' is required and must be a string."),
        field: "query",
      },
    };
  }

  const trimmed = query.trim();
  if (trimmed.length < QUERY_LIMITS.MIN_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: t(
          "validation.queryTooShort",
          `Query must be at least ${QUERY_LIMITS.MIN_QUERY_LENGTH} characters long.`,
          { min: QUERY_LIMITS.MIN_QUERY_LENGTH },
        ),
        field: "query",
        details: t("validation.gotChars", `Got ${trimmed.length} characters.`, {
          got: trimmed.length,
        }),
      },
    };
  }
  if (trimmed.length > QUERY_LIMITS.MAX_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: t(
          "validation.queryTooLong",
          `Query must be at most ${QUERY_LIMITS.MAX_QUERY_LENGTH} characters long.`,
          { max: QUERY_LIMITS.MAX_QUERY_LENGTH },
        ),
        field: "query",
        details: t("validation.gotChars", `Got ${trimmed.length} characters.`, {
          got: trimmed.length,
        }),
      },
    };
  }

  const cleanKeywords: string[] = [];
  if (keywords !== undefined && keywords !== null) {
    if (!Array.isArray(keywords)) {
      return {
        ok: false,
        status: 400,
        body: {
          error: t("validation.keywordsNotArray", "Field 'keywords' must be an array of strings."),
          field: "keywords",
        },
      };
    }
    if (keywords.length > QUERY_LIMITS.MAX_KEYWORDS) {
      return {
        ok: false,
        status: 400,
        body: {
          error: t(
            "validation.tooManyKeywords",
            `At most ${QUERY_LIMITS.MAX_KEYWORDS} keywords are allowed.`,
            { max: QUERY_LIMITS.MAX_KEYWORDS },
          ),
          field: "keywords",
        },
      };
    }
    for (let i = 0; i < keywords.length; i++) {
      const k = keywords[i];
      if (typeof k !== "string") {
        return {
          ok: false,
          status: 400,
          body: {
            error: t("validation.keywordNotString", `Keyword at index {index} must be a string.`, { index: i }),
            field: "keywords",
          },
        };
      }
      const trimmedK = k.trim();
      if (trimmedK.length === 0) continue;
      if (trimmedK.length > QUERY_LIMITS.MAX_KEYWORD_LENGTH) {
        return {
          ok: false,
          status: 400,
          body: {
            error: t(
              "validation.keywordTooLong",
              `Keyword "${trimmedK.slice(0, 20)}..." exceeds ${QUERY_LIMITS.MAX_KEYWORD_LENGTH} characters.`,
              { max: QUERY_LIMITS.MAX_KEYWORD_LENGTH, preview: trimmedK.slice(0, 20) },
            ),
            field: "keywords",
          },
        };
      }
      if (!cleanKeywords.includes(trimmedK)) cleanKeywords.push(trimmedK);
    }
  }

  return { ok: true, value: { query: trimmed, keywords: cleanKeywords } };
}

/**
 * Backwards-compatible alias. Kept so existing callers that import
 * the non-localized variant keep working; delegates to the localized
 * implementation with no source, which falls back to the English
 * fallbacks embedded in the localized helper.
 */
export function validateResearchRequest(
  body: unknown,
): ValidationResult<{ query: string; keywords: string[] }> {
  return validateResearchRequestLocalized(body);
}

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
  localeSource?: LocaleSource,
): NextResponse {
  const { locale } = localeSource ? createServerI18n(localeSource) : { locale: undefined as string | undefined };
  const headers: Record<string, string> = {};
  if (locale) headers["Content-Language"] = locale;
  return NextResponse.json({ error: message, ...(extra || {}) }, { status, headers });
}

export function jsonValidationError(result: ValidationError): NextResponse {
  return jsonError(result.body.error, result.status, {
    field: result.body.field,
    details: result.body.details,
  });
}

/** Localized JSON error response.
 *
 * Picks a message from the dictionary via `createServerI18n(request)`,
 * interpolates any `{name}` params, and returns a NextResponse with the
 * correct status code, Content-Language header, and optional `details`/`field`.
 */
export function jsonErrorLocalized(
  source: LocaleSource,
  messageKey: DictionaryKey | string,
  status: number,
  params?: Record<string, string | number>,
  extra?: Record<string, unknown>,
): NextResponse<{ error: string; [key: string]: unknown }> {
  const { locale, t } = createServerI18n(source);
  const message = t(messageKey, undefined, params);
  const body: { error: string; [key: string]: unknown } = { error: message, ...extra };
  return NextResponse.json(body, {
    status,
    headers: { "Content-Language": locale },
  });
}
