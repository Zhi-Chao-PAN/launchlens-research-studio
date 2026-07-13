/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { AutocompleteDropdown } from "@/components/autocomplete/AutocompleteDropdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useResearchHistory } from "@/lib/research/history";

interface QueryInputProps {
  onSubmit: (query: string, keywords: string[]) => void;
  onCancel?: () => void;
  isLoading: boolean;
  /** True while the cancellation request is awaiting a validated response. */
  isCancelling?: boolean;
  defaultQuery?: string;
  defaultKeywords?: string[];
  /** If set, the submit button is disabled until this wall-clock time (ms).
   *  Used to enforce client-side rate-limit cooldowns signalled by the server
   *  via Retry-After. */
  disabledUntilMs?: number | null;
  /** Monotonically increasing counter bumped by the parent the moment a
   *  rate-limit cooldown expires — triggers focus + aria-live announcement. */
  retryReadyPulse?: number;
  /** Additional product-level gate, for example a research mode that is
   * visible as a preview but is not executable yet. */
  submitDisabled?: boolean;
  submitDisabledReason?: string;
  submitLabel?: string;
  variant?: "panel" | "embedded";
}

const EXAMPLE_QUERIES = [
  { query: "AI-powered note-taking app for university students", keywords: ["AI", "education", "SaaS"] },
  { query: "B2B SaaS tool for freelance designers", keywords: ["SaaS", "design", "freelance"] },
  { query: "AI customer support automation for ecommerce", keywords: ["AI", "support", "ecommerce"] },
  { query: "Fitness app for busy working professionals", keywords: ["fitness", "mobile", "subscription"] },
  { query: "Developer tool for AI code review", keywords: ["devtools", "AI", "code review"] },
  { query: "Personal finance app for Gen Z", keywords: ["fintech", "mobile", "Gen Z"] },
];

const QUERY_LIMITS = {
  MIN: 3,
  MAX: 1000,
  MAX_KEYWORDS: 12,
  MAX_KEYWORD_LENGTH: 40,
};

export function QueryInput({
  onSubmit,
  onCancel,
  isLoading,
  isCancelling = false,
  defaultQuery = "",
  defaultKeywords = [],
  disabledUntilMs = null,
  retryReadyPulse = 0,
  submitDisabled = false,
  submitDisabledReason,
  submitLabel,
  variant = "panel",
}: QueryInputProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState(defaultQuery);
  const [keywordInput, setKeywordInput] = useState(defaultKeywords.join(", "));
  const [showExamples, setShowExamples] = useState(false);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const queryInputRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const externalSeedRef = useRef(JSON.stringify([defaultQuery, defaultKeywords]));
  const { history: rawHistory, hydrated } = useResearchHistory();

  // URL/template/cache prefill can arrive after hydration. Synchronise only
  // when the external seed actually changes so normal typing is never reset
  // by an unrelated parent render.
  useEffect(() => {
    const nextSeed = JSON.stringify([defaultQuery, defaultKeywords]);
    if (externalSeedRef.current === nextSeed) return;
    externalSeedRef.current = nextSeed;
    setQuery(defaultQuery);
    setKeywordInput(defaultKeywords.join(", "));
  }, [defaultQuery, defaultKeywords]);

  // Convert history to the format autocomplete expects (numeric timestamps)
  const autocompleteHistory = useMemo(
    () =>
      rawHistory.map((e) => ({
        id: e.id,
        query: e.query,
        keywords: e.keywords,
        createdAt: new Date(e.createdAt).getTime(),
      })),
    [rawHistory]
  );

  const trimmed = query.trim();
  const keywordList = useMemo(
    () =>
      keywordInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    [keywordInput],
  );

  const queryError = useMemo(() => {
    if (trimmed.length === 0) return null;
    if (trimmed.length < QUERY_LIMITS.MIN) return t("queryInput.minChars", { n: QUERY_LIMITS.MIN });
    if (trimmed.length > QUERY_LIMITS.MAX) return t("queryInput.maxChars", { n: QUERY_LIMITS.MAX });
    return null;
  }, [trimmed, t]);

  const keywordError = useMemo(() => {
    if (keywordList.length > QUERY_LIMITS.MAX_KEYWORDS) return t("queryInput.maxKeywords", { n: QUERY_LIMITS.MAX_KEYWORDS });
    const tooLong = keywordList.find((k) => k.length > QUERY_LIMITS.MAX_KEYWORD_LENGTH);
    if (tooLong) return t("queryInput.keywordTooLong", { preview: tooLong.slice(0, 20) });
    return null;
  }, [keywordList, t]);

  const isValid = trimmed.length >= QUERY_LIMITS.MIN && trimmed.length <= QUERY_LIMITS.MAX && !keywordError;

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!isValid || isLoading || submitDisabled) return;
      setAutocompleteOpen(false);
      onSubmit(trimmed, keywordList);
    },
    [isValid, isLoading, onSubmit, submitDisabled, trimmed, keywordList]
  );

  const handleExampleClick = (example: { query: string; keywords: string[] }) => {
    setQuery(example.query);
    setKeywordInput(example.keywords.join(", "));
    setShowExamples(false);
    queryInputRef.current?.focus();
  };

  const handleAutocompleteSelect = useCallback((text: string, keywords: string[]) => {
    setQuery(text);
    if (keywords.length > 0 && keywordList.length === 0) {
      setKeywordInput(keywords.join(", "));
    }
    setAutocompleteOpen(false);
    setHighlightedIndex(0);
    queryInputRef.current?.focus();
  }, [keywordList]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocompleteOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setAutocompleteOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, 5)); // maxItems - 1
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (highlightedIndex >= 0) {
          e.preventDefault();
          // The dropdown will handle via click simulation, but we need direct access
          // For now, submit on Enter (default behavior) — autocomplete closes on submit
          // If user is navigating, they'll use Tab or click. Keep Enter as submit.
        }
        break;
      case "Escape":
        e.preventDefault();
        setAutocompleteOpen(false);
        setHighlightedIndex(0);
        break;
      case "Tab":
        if (highlightedIndex >= 0 && autocompleteOpen) {
          // Don't prevent — let tab move focus, but close the dropdown
          setAutocompleteOpen(false);
        }
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-query-autocomplete]")) {
        setAutocompleteOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const shouldShowAutocomplete = hydrated && autocompleteOpen && !isLoading;

  // Live countdown for client-side rate-limit cooldown. Keeps the button
  // disabled and the label in sync with wall-clock time.
  //
  // The setState calls inside this effect mirror the external (wall-clock)
  // state of `disabledUntilMs` into React — that is exactly what the
  // exhaustive-deps rule is for, and the cascading-render warning is a false
  // positive: we want the immediate "reset to 0" / "set initial value" sync
  // when the prop changes, not a derived render-time value (the latter would
  // not tick every 250ms).
  useEffect(() => {
    if (!disabledUntilMs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCooldownSecs(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((disabledUntilMs - Date.now()) / 1000));
      setCooldownSecs(remaining);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [disabledUntilMs]);

  // When the parent bumps retryReadyPulse the server-side cooldown has
  // expired; move focus back to the submit button and announce it to
  // assistive tech so keyboard/screen-reader users can immediately retry.
  useEffect(() => {
    if (retryReadyPulse <= 0) return;
    // Imperative DOM focus + announcement in response to an external pulse;
    // not a render-driven state set, so the effect is the right place.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnnouncement(t("queryInput.readyToRetry"));
    submitButtonRef.current?.focus();
    const timer = setTimeout(() => setAnnouncement(null), 2000);
    return () => clearTimeout(timer);
  }, [retryReadyPulse, t]);

  return (
    <div className={variant === "panel"
      ? "bg-white rounded-xl border border-slate-200 p-5 sm:p-6"
      : "bg-transparent"
    }>
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("queryInput.briefEyebrow")}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{t("queryInput.title")}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" data-research-form>
        <div className="relative" data-query-autocomplete>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="query-input" className="block text-sm font-medium text-slate-700">
              {t("queryInput.queryLabel")}
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <span className={`text-[10px] font-mono ${
              trimmed.length > QUERY_LIMITS.MAX
                ? "text-rose-600"
                : trimmed.length >= QUERY_LIMITS.MAX * 0.9
                ? "text-amber-600"
                : "text-slate-600"
            }`}>
              {trimmed.length}/{QUERY_LIMITS.MAX}
            </span>
          </div>
          <textarea
            id="query-input"
            ref={queryInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAutocompleteOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setAutocompleteOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={t("queryInput.queryPlaceholder")}
            className={`w-full px-3.5 py-3 border rounded-lg bg-white text-sm leading-6 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-0 resize-none transition-colors ${
              queryError
                ? "border-rose-300 focus:ring-rose-500"
                : "border-slate-300 focus:ring-teal-600"
            }`}
            rows={3}
            disabled={isLoading}
            maxLength={QUERY_LIMITS.MAX + 50}
            aria-invalid={!!queryError}
            aria-describedby={queryError ? "query-error" : undefined}
          />
          {queryError && (
            <p id="query-error" className="text-xs text-rose-600 mt-1">
              {queryError}
            </p>
          )}

          {shouldShowAutocomplete && (
            <AutocompleteDropdown
              query={trimmed}
              history={autocompleteHistory}
              onSelect={handleAutocompleteSelect}
              isOpen={true}
              highlightedIndex={highlightedIndex}
              onHighlight={setHighlightedIndex}
              maxItems={6}
            />
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="keyword-input" className="block text-sm font-medium text-slate-700">
              {t("queryInput.keywordsLabel")} <span className="font-normal text-slate-600">{t("queryInput.keywordsHint")}</span>
            </label>
            <span className="font-mono text-[10px] text-slate-600">
              {keywordList.length}/{QUERY_LIMITS.MAX_KEYWORDS}
            </span>
          </div>
          <input
            id="keyword-input"
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder={t("queryInput.keywordsPlaceholder")}
            className={`w-full px-3.5 py-2.5 border rounded-lg bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
              keywordError
                ? "border-rose-300 focus:ring-rose-500"
                : "border-slate-300 focus:ring-teal-600"
            }`}
            disabled={isLoading}
            aria-invalid={!!keywordError}
          />
          {keywordError && <p className="text-xs text-rose-600 mt-1">{keywordError}</p>}
          {keywordList.length > 0 && !keywordError && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              {keywordList.slice(0, 8).map((k, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                  {k}
                </span>
              ))}
              {keywordList.length > 8 && (
                <span className="text-[10px] text-slate-500">{t("queryInput.moreKeywords", { count: keywordList.length - 8 })}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            ref={submitButtonRef}
            type="submit"
            disabled={isLoading || !isValid || cooldownSecs > 0 || submitDisabled}
            aria-busy={isLoading}
            aria-disabled={isLoading || !isValid || cooldownSecs > 0 || submitDisabled}
            aria-describedby={submitDisabledReason ? "research-submit-disabled-reason" : undefined}
            className="flex-1 min-h-11 py-2.5 px-5 bg-slate-950 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isCancelling ? t("queryInput.cancellingButton") : t("queryInput.startingResearch")}</span>
              </>
            ) : cooldownSecs > 0 ? (
              <>
                <span>{t("queryInput.cooldownWait", { n: cooldownSecs })}</span>
              </>
            ) : submitDisabled ? (
              <span>{submitLabel ?? t("queryInput.modeUnavailable")}</span>
            ) : (
              <>
                <span>{submitLabel ?? t("queryInput.startButton")}</span>
                <span aria-hidden className="text-white/60">→</span>
              </>
            )}
          </button>
          {isLoading && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="py-2.5 px-5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:cursor-wait disabled:opacity-60"
              aria-label={isCancelling ? t("queryInput.cancellingAriaLabel") : t("queryInput.cancelAriaLabel")}
              aria-busy={isCancelling}
            >
              {isCancelling ? t("queryInput.cancellingButton") : t("queryInput.cancelButton")}
            </button>
          )}
        </div>

        {announcement && (
          <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
        )}
        {submitDisabledReason && (
          <p id="research-submit-disabled-reason" role="status" className="text-xs leading-5 text-amber-700">
            {submitDisabledReason}
          </p>
        )}
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => setShowExamples((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <span className={`transition-transform ${showExamples ? "rotate-90" : ""}`} aria-hidden>▶</span>
          <span>{t("queryInput.tryExample")}</span>
        </button>
        {showExamples && (
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
                onClick={() => handleExampleClick(ex)}
                disabled={isLoading}
                className="text-left text-xs px-3 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md transition-colors disabled:opacity-50"
              >
                <span className="font-medium">{ex.query}</span>
                {ex.keywords.length > 0 && (
                  <span className="mt-0.5 block text-[10px] text-slate-600">
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
