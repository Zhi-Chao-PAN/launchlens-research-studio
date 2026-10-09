/* eslint-disable @typescript-eslint/no-explicit-any */
﻿// Input validation and error handling for the research API.
// Centralized so the rules and error shapes are consistent across endpoints.
// Supports i18n via optional t/fmt translators; defaults to English messages.

import { NextResponse } from "next/server";

export const QUERY_LIMITS = {
  MIN_QUERY_LENGTH: 3,
  MAX_QUERY_LENGTH: 1000,
  MAX_KEYWORDS: 12,
  MAX_KEYWORD_LENGTH: 40,
} as const;

export type ValidationError = {
  ok: false;
  status: 400;
  code?: string;
  body: { error: string; field?: string; details?: string };
};

export type ValidationSuccess<T> = {
  ok: true;
  value: T;
};

export type ValidationResult<T> = ValidationError | ValidationSuccess<T>;

interface I18nFns {
  t: (key: string, fallback?: string) => string;
  fmt: (key: string, vars: Record<string, string | number>, fallback?: string) => string;
}

const defaultI18n: I18nFns = {
  t: (_key: string, fallback?: string) => fallback || "",
  fmt: (_key: string, _vars: Record<string, string | number>, fallback?: string) => fallback || "",
};

export function validateResearchRequest(
  body: unknown,
  i18n: I18nFns = defaultI18n,
): ValidationResult<{ query: string; keywords: string[] }> {
  const { t, fmt } = i18n;

  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      code: "INVALID_BODY",
      body: { error: t("api.invalidBody", "Request body must be a JSON object.") },
    };
  }

  const obj = body as Record<string, unknown>;
  const { query, keywords } = obj;

  if (typeof query !== "string") {
    return {
      ok: false,
      status: 400,
      code: "QUERY_REQUIRED",
      body: { error: t("api.queryRequired", "Field 'query' is required and must be a string."), field: "query" },
    };
  }

  const trimmed = query.trim();
  if (trimmed.length < QUERY_LIMITS.MIN_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "QUERY_TOO_SHORT",
      body: {
        error: fmt(
          "api.queryTooShort",
          { min: QUERY_LIMITS.MIN_QUERY_LENGTH },
          `Query must be at least ${QUERY_LIMITS.MIN_QUERY_LENGTH} characters long.`,
        ),
        field: "query",
        details: fmt(
          "api.gotNCharacters",
          { count: trimmed.length },
          `Got ${trimmed.length} characters.`,
        ),
      },
    };
  }
  if (trimmed.length > QUERY_LIMITS.MAX_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "QUERY_TOO_LONG",
      body: {
        error: fmt(
          "api.queryTooLong",
          { max: QUERY_LIMITS.MAX_QUERY_LENGTH },
          `Query must be at most ${QUERY_LIMITS.MAX_QUERY_LENGTH} characters long.`,
        ),
        field: "query",
        details: fmt(
          "api.gotNCharacters",
          { count: trimmed.length },
          `Got ${trimmed.length} characters.`,
        ),
      },
    };
  }

  const cleanKeywords: string[] = [];
  if (keywords !== undefined && keywords !== null) {
    if (!Array.isArray(keywords)) {
      return {
        ok: false,
        status: 400,
        code: "KEYWORDS_NOT_ARRAY",
        body: {
          error: t("api.keywordsMustBeArray", "Field 'keywords' must be an array of strings."),
          field: "keywords",
        },
      };
    }
    if (keywords.length > QUERY_LIMITS.MAX_KEYWORDS) {
      return {
        ok: false,
        status: 400,
        code: "KEYWORDS_TOO_MANY",
        body: {
          error: fmt(
            "api.keywordsTooMany",
            { max: QUERY_LIMITS.MAX_KEYWORDS },
            `At most ${QUERY_LIMITS.MAX_KEYWORDS} keywords are allowed.`,
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
          code: "KEYWORD_INVALID",
          body: {
            error: fmt(
              "api.keywordInvalid",
              { index: i },
              `Keyword at index ${i} must be a string.`,
            ),
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
          code: "KEYWORD_TOO_LONG",
          body: {
            error: fmt(
              "api.keywordTooLong",
              { max: QUERY_LIMITS.MAX_KEYWORD_LENGTH },
              `Keyword exceeds ${QUERY_LIMITS.MAX_KEYWORD_LENGTH} characters.`,
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

export function jsonError(message: string, status: number, extra?: Record<string, unknown>, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}), ...(extra || {}) }, { status });
}

export function jsonValidationError(result: ValidationError): NextResponse {
  return jsonError(result.body.error, result.status, {
    field: result.body.field,
    details: result.body.details,
  }, result.code ?? "VALIDATION_ERROR");
}
