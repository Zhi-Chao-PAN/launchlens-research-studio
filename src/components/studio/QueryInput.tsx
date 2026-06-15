"use client";

import { useState } from "react";

interface QueryInputProps {
  onSubmit: (query: string, keywords: string[]) => void;
  isLoading: boolean;
}

const EXAMPLE_QUERIES = [
  "AI-powered note-taking app for students",
  "SaaS tool for freelance designers",
  "AI customer support automation",
  "Fitness app for busy professionals",
];

export function QueryInput({ onSubmit, isLoading }: QueryInputProps) {
  const [query, setQuery] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const keywords = keywordInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    onSubmit(query.trim(), keywords);
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🔬</span>
        <h2 className="text-xl font-bold text-slate-800">Start a Research Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Product idea
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe the product idea you want to research... e.g., an AI-powered go-to-market tool for solo founders"
            className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            rows={3}
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Keywords (optional, comma-separated)
          </label>
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="e.g., SaaS, AI, productivity, remote work"
            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
        >
          {isLoading ? "Starting research..." : "Start Research"}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-500 mb-2">Or try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example}
              onClick={() => handleExampleClick(example)}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}