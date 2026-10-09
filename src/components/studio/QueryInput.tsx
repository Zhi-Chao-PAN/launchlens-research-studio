/* eslint-disable @next/next/no-img-element */
﻿"use client";

import { useState, useMemo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { StructuredApiError } from "@/lib/api/error-codes";
import { QUERY_LIMITS } from "@/lib/api/validation";

// Local aliases. The canonical limits live in src/lib/api/validation.ts so
// client-side validation and server-side validation always agree.
const MIN_QUERY = QUERY_LIMITS.MIN_QUERY_LENGTH;
const MAX_QUERY = QUERY_LIMITS.MAX_QUERY_LENGTH;
const MAX_KW = QUERY_LIMITS.MAX_KEYWORDS;
const MAX_KW_LEN = QUERY_LIMITS.MAX_KEYWORD_LENGTH;

interface QueryInputProps {
  onSubmit: (query: string, keywords: string[]) => void;
  isLoading: boolean;
  defaultQuery?: string;
  defaultKeywords?: string[];
  /** Structured error returned by the most recent start-research attempt. */
  serverError?: StructuredApiError | null;
  /** Live countdown seconds remaining for rate-limited retries. 0 means "ok to submit". */
  retryAfterSeconds?: number;
  /** Called when the user edits a field that currently has a server-side error attached. */
  onFieldChange?: (field: "query" | "keywords") => void;
  /** Called when the user dismisses a general (form-level) error banner. */
  onDismissError?: () => void;
}

const EXAMPLE_QUERIES = [
  { query: "AI-powered note-taking app for university students", keywords: ["AI", "education", "SaaS"] },
  { query: "B2B SaaS tool for freelance designers", keywords: ["SaaS", "design", "freelance"] },
  { query: "AI customer support automation for ecommerce", keywords: ["AI", "support", "ecommerce"] },
  { query: "Fitness app for busy working professionals", keywords: ["fitness", "mobile", "subscription"] },
  { query: "Developer tool for AI code review", keywords: ["devtools", "AI", "code review"] },
  { query: "Personal finance app for Gen Z", keywords: ["fintech", "mobile", "Gen Z"] },
];

export function QueryInput({
  onSubmit,
  isLoading,
  defaultQuery = "",
  defaultKeywords = [],
  serverError = null,
  retryAfterSeconds = 0,
  onFieldChange,
  onDismissError,
}: QueryInputProps) {
  const { t, fmt } = useLocale();
  const [query, setQuery] = useState(defaultQuery);
  const [keywordInput, setKeywordInput] = useState(defaultKeywords.join(", "));
  const [showExamples, setShowExamples] = useState(false);

  const trimmed = query.trim();
  const keywordList = useMemo(
    () =>
      keywordInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordInput],
  );

  // ---- Client-side validation (instant feedback while typing) ----
  const clientQueryError = useMemo(() => {
    if (trimmed.length === 0) return null;
    if (trimmed.length < MIN_QUERY) return t("query.errorMinLength", `Minimum ${MIN_QUERY} characters`);
    if (trimmed.length > MAX_QUERY) return t("query.errorMaxLength", `Maximum ${MAX_QUERY} characters`);
    return null;
  }, [trimmed, t]);

  const clientKeywordError = useMemo(() => {
    if (keywordList.length > MAX_KW) {
      return t("query.errorMaxKeywords", `Max ${MAX_KW} keywords`);
    }
    const tooLong = keywordList.find((k) => k.length > MAX_KW_LEN);
    if (tooLong) {
      return t(
        "query.errorKeywordTooLong",
        `"${tooLong.slice(0, 20)}..." is too long`,
      ).replace("{keyword}", tooLong.slice(0, 20) + (tooLong.length > 20 ? "..." : ""));
    }
    return null;
  }, [keywordList, t]);

  // ---- Merge in any server-side error attached to this field ----
  const serverQueryError =
    serverError && serverError.field === "query" ? serverError.message : null;
  const serverKeywordError =
    serverError && serverError.field === "keywords" ? serverError.message : null;

  const queryError = clientQueryError ?? serverQueryError;
  const keywordError = clientKeywordError ?? serverKeywordError;

  const generalError =
    serverError && serverError.field === "general" ? serverError : null;
  const isRateLimited = generalError?.code === "RATE_LIMITED";
  const cooldownActive = isRateLimited && retryAfterSeconds > 0;

  const isValid =
    trimmed.length >= MIN_QUERY &&
    trimmed.length <= MAX_QUERY &&
    !keywordError &&
    !queryError;

  const submitDisabled = isLoading || !isValid || cooldownActive;

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (serverQueryError) onFieldChange?.("query");
  };

  const handleKeywordChange = (v: string) => {
    setKeywordInput(v);
    if (serverKeywordError) onFieldChange?.("keywords");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;
    onSubmit(trimmed, keywordList);
  };

  const handleExampleClick = (example: { query: string; keywords: string[] }) => {
    setQuery(example.query);
    setKeywordInput(example.keywords.join(", "));
    setShowExamples(false);
    // Examples are guaranteed valid — clear any stale server errors.
    if (serverQueryError) onFieldChange?.("query");
    if (serverKeywordError) onFieldChange?.("keywords");
  };

  const submitLabel = isLoading
    ? t("query.submitting", "Starting research…")
    : cooldownActive
    ? fmt("errors.retryInSeconds", { n: retryAfterSeconds }, `Retry in ${retryAfterSeconds}s`)
    : t("query.submit", "Start Research");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7" />
        <h2 className="text-xl font-bold text-slate-800">{t("query.title", "Start a Research Session")}</h2>
      </div>

      {/* General (form-level) error banner: rate limits, network errors, 5xx, etc. */}
      {generalError && (
        <div
          role="alert"
          data-testid="form-error-general"
          className={`mb-4 rounded-xl border p-3 flex items-start gap-3 text-sm ${
            isRateLimited
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : generalError.code === "NETWORK_ERROR"
              ? "bg-slate-50 border-slate-200 text-slate-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span className="text-lg flex-shrink-0 leading-none" aria-hidden>
            {isRateLimited ? "⏳" : generalError.code === "NETWORK_ERROR" ? "📡" : "⚠️"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">
              {isRateLimited
                ? t("errors.rateLimitHint", generalError.message)
                : generalError.code === "NETWORK_ERROR"
                ? t("errors.network", generalError.message)
                : generalError.code === "INTERNAL_ERROR"
                ? t("errors.serverError", generalError.message)
                : generalError.message}
            </p>
            {isRateLimited && (
              <p className="mt-1 text-xs opacity-80">
                {cooldownActive
                  ? fmt("errors.retryInSeconds", { n: retryAfterSeconds }, `Retry in ${retryAfterSeconds}s`)
                  : t("errors.retryNow", "You can retry now")}
              </p>
            )}
          </div>
          {onDismissError && !cooldownActive && (
            <button
              type="button"
              onClick={onDismissError}
              className="text-xs font-medium px-2 py-1 rounded hover:bg-black/5 flex-shrink-0"
              aria-label={t("errors.dismiss", "Dismiss")}
            >
              {t("errors.dismissShort", "×")}
            </button>
          )}
        </div>
      )}

      {/* Hint when server returned field-level errors */}
      {(serverQueryError || serverKeywordError) && !generalError && (
        <p className="mb-3 text-xs text-rose-600">
          {t("errors.correctAndRetry", "Please correct the highlighted fields and retry.")}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" data-research-form>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="query-input" className="block text-sm font-medium text-slate-700">
              {t("query.label", "Product idea")}
              <span className="text-rose-500 ml-0.5" aria-label={t("query.requiredHint", "required")}>*</span>
            </label>
            <span className={`text-[10px] font-mono ${
              trimmed.length > MAX_QUERY
                ? "text-rose-600"
                : trimmed.length >= MAX_QUERY * 0.9
                ? "text-amber-600"
                : "text-slate-400"
            }`}>
              {fmt("query.counter", { current: trimmed.length, max: MAX_QUERY }, `${trimmed.length}/${MAX_QUERY}`)}
            </span>
          </div>
          <textarea
            id="query-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t(
              "query.placeholder",
              "Describe the product idea you want to research… e.g., an AI-powered go-to-market tool for solo founders",
            )}
            className={`w-full px-4 py-3 border rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none transition-colors ${
              queryError
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-300 focus:ring-indigo-500"
            }`}
            rows={3}
            disabled={isLoading}
            maxLength={MAX_QUERY + 50}
            aria-invalid={!!queryError}
            aria-describedby={queryError ? "query-error" : undefined}
          />
          {queryError && (
            <p id="query-error" data-testid="form-error-query" className="text-xs text-rose-600 mt-1">
              {queryError}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="keyword-input" className="block text-sm font-medium text-slate-700">
              {t("query.keywordsLabel", "Keywords")}{" "}
              <span className="text-slate-400 font-normal">
                {t("query.keywordsOptionalHelp", "(optional, comma-separated)")}
              </span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {keywordList.length}/{MAX_KW}
            </span>
          </div>
          <input
            id="keyword-input"
            type="text"
            value={keywordInput}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder={t("query.keywordPlaceholder", "e.g., SaaS, AI, productivity, remote work")}
            className={`w-full px-4 py-2.5 border rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent ${
              keywordError
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-300 focus:ring-indigo-500"
            }`}
            disabled={isLoading}
            aria-invalid={!!keywordError}
            aria-describedby={keywordError ? "keyword-error" : undefined}
          />
          {keywordError && (
            <p id="keyword-error" data-testid="form-error-keywords" className="text-xs text-rose-600 mt-1">{keywordError}</p>
          )}
          {keywordList.length > 0 && !keywordError && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              {keywordList.slice(0, 8).map((k, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                  {k}
                </span>
              ))}
              {keywordList.length > 8 && (
                <span className="text-[10px] text-slate-500">
                  {fmt(
                    "query.moreKeywords",
                    { count: keywordList.length - 8 },
                    `+${keywordList.length - 8} more`,
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          data-testid="research-submit"
          disabled={submitDisabled}
          className={`w-full py-3 px-6 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
            cooldownActive
              ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
          }`}
        >
          {isLoading || cooldownActive ? (
            <>
              {isLoading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {cooldownActive && <span aria-hidden>⏳</span>}
              <span>{submitLabel}</span>
            </>
          ) : (
            <>
              <span aria-hidden>🚀</span>
              <span>{submitLabel}</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => setShowExamples((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          type="button"
        >
          <span className={`transition-transform ${showExamples ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <span>{t("query.examples", "Or try an example")}</span>
        </button>
        {showExamples && (
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleExampleClick(ex)}
                disabled={isLoading}
                className="text-left text-xs px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <span className="font-medium">{ex.query}</span>
                {ex.keywords.length > 0 && (
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {ex.keywords.join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
