"use client";

import { useState, useMemo } from "react";

interface QueryInputProps {
  onSubmit: (query: string, keywords: string[]) => void;
  isLoading: boolean;
  defaultQuery?: string;
  defaultKeywords?: string[];
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

export function QueryInput({ onSubmit, isLoading, defaultQuery = "", defaultKeywords = [] }: QueryInputProps) {
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

  const queryError = useMemo(() => {
    if (trimmed.length === 0) return null;
    if (trimmed.length < QUERY_LIMITS.MIN) return `Minimum ${QUERY_LIMITS.MIN} characters`;
    if (trimmed.length > QUERY_LIMITS.MAX) return `Maximum ${QUERY_LIMITS.MAX} characters`;
    return null;
  }, [trimmed]);

  const keywordError = useMemo(() => {
    if (keywordList.length > QUERY_LIMITS.MAX_KEYWORDS) return `Max ${QUERY_LIMITS.MAX_KEYWORDS} keywords`;
    const tooLong = keywordList.find((k) => k.length > QUERY_LIMITS.MAX_KEYWORD_LENGTH);
    if (tooLong) return `"${tooLong.slice(0, 20)}..." is too long`;
    return null;
  }, [keywordList]);

  const isValid = trimmed.length >= QUERY_LIMITS.MIN && trimmed.length <= QUERY_LIMITS.MAX && !keywordError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit(trimmed, keywordList);
  };

  const handleExampleClick = (example: { query: string; keywords: string[] }) => {
    setQuery(example.query);
    setKeywordInput(example.keywords.join(", "));
    setShowExamples(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <img src="/logo.svg" alt="" width={28} height={28} className="w-7 h-7" />
        <h2 className="text-xl font-bold text-slate-800">Start a Research Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" data-research-form>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="query-input" className="block text-sm font-medium text-slate-700">
              Product idea
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <span className={`text-[10px] font-mono ${
              trimmed.length > QUERY_LIMITS.MAX
                ? "text-rose-600"
                : trimmed.length >= QUERY_LIMITS.MAX * 0.9
                ? "text-amber-600"
                : "text-slate-400"
            }`}>
              {trimmed.length}/{QUERY_LIMITS.MAX}
            </span>
          </div>
          <textarea
            id="query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe the product idea you want to research… e.g., an AI-powered go-to-market tool for solo founders"
            className={`w-full px-4 py-3 border rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none transition-colors ${
              queryError
                ? "border-rose-300 focus:ring-rose-500"
                : "border-slate-300 focus:ring-indigo-500"
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
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="keyword-input" className="block text-sm font-medium text-slate-700">
              Keywords <span className="text-slate-400 font-normal">(optional, comma-separated)</span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {keywordList.length}/{QUERY_LIMITS.MAX_KEYWORDS}
            </span>
          </div>
          <input
            id="keyword-input"
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="e.g., SaaS, AI, productivity, remote work"
            className={`w-full px-4 py-2.5 border rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent ${
              keywordError
                ? "border-rose-300 focus:ring-rose-500"
                : "border-slate-300 focus:ring-indigo-500"
            }`}
            disabled={isLoading}
            aria-invalid={!!keywordError}
          />
          {keywordError && <p className="text-xs text-rose-600 mt-1">{keywordError}</p>}
          {keywordList.length > 0 && !keywordError && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              {keywordList.slice(0, 8).map((k, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                  {k}
                </span>
              ))}
              {keywordList.length > 8 && (
                <span className="text-[10px] text-slate-500">+{keywordList.length - 8} more</span>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !isValid}
          className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Starting research…</span>
            </>
          ) : (
            <>
              <span aria-hidden>🚀</span>
              <span>Start Research</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <button
          onClick={() => setShowExamples((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <span className={`transition-transform ${showExamples ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <span>Or try an example</span>
        </button>
        {showExamples && (
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
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
