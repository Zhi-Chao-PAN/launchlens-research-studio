/* eslint-disable @typescript-eslint/no-explicit-any */
﻿// Input validation and error handling for the research API.
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

export function validateResearchRequest(body: unknown): ValidationResult<{ query: string; keywords: string[] }> {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, body: { error: "Request body must be a JSON object." } };
  }

  const obj = body as Record<string, unknown>;
  const { query, keywords } = obj;

  if (typeof query !== "string") {
    return { ok: false, status: 400, body: { error: "Field 'query' is required and must be a string.", field: "query" } };
  }

  const trimmed = query.trim();
  if (trimmed.length < QUERY_LIMITS.MIN_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Query must be at least ${QUERY_LIMITS.MIN_QUERY_LENGTH} characters long.`,
        field: "query",
        details: `Got ${trimmed.length} characters.`,
      },
    };
  }
  if (trimmed.length > QUERY_LIMITS.MAX_QUERY_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Query must be at most ${QUERY_LIMITS.MAX_QUERY_LENGTH} characters long.`,
        field: "query",
        details: `Got ${trimmed.length} characters.`,
      },
    };
  }

  const cleanKeywords: string[] = [];
  if (keywords !== undefined && keywords !== null) {
    if (!Array.isArray(keywords)) {
      return { ok: false, status: 400, body: { error: "Field 'keywords' must be an array of strings.", field: "keywords" } };
    }
    if (keywords.length > QUERY_LIMITS.MAX_KEYWORDS) {
      return {
        ok: false,
        status: 400,
        body: { error: `At most ${QUERY_LIMITS.MAX_KEYWORDS} keywords are allowed.`, field: "keywords" },
      };
    }
    for (let i = 0; i < keywords.length; i++) {
      const k = keywords[i];
      if (typeof k !== "string") {
        return {
          ok: false,
          status: 400,
          body: { error: `Keyword at index ${i} must be a string.`, field: "keywords" },
        };
      }
      const trimmedK = k.trim();
      if (trimmedK.length === 0) continue;
      if (trimmedK.length > QUERY_LIMITS.MAX_KEYWORD_LENGTH) {
        return {
          ok: false,
          status: 400,
          body: { error: `Keyword "${trimmedK.slice(0, 20)}..." exceeds ${QUERY_LIMITS.MAX_KEYWORD_LENGTH} characters.`, field: "keywords" },
        };
      }
      if (!cleanKeywords.includes(trimmedK)) cleanKeywords.push(trimmedK);
    }
  }

  return { ok: true, value: { query: trimmed, keywords: cleanKeywords } };
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
