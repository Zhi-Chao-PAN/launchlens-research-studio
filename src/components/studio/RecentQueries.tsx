"use client";

import Link from "next/link";
import { useResearchHistory, formatRelativeTime } from "@/lib/research/history";

interface RecentQueriesProps {
  onSelect: (query: string, keywords: string[]) => void;
  isLoading: boolean;
}

export function RecentQueries({ onSelect, isLoading }: RecentQueriesProps) {
  const { history, removeEntry, clearAll, hydrated } = useResearchHistory();

  if (!hydrated || history.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
          <span aria-hidden>🕐</span>
          Recent research
        </h3>
        <button
          onClick={clearAll}
          className="text-[10px] text-slate-400 hover:text-slate-600"
          title="Clear history"
        >
          Clear
        </button>
      </div>
      <div className="space-y-1.5">
        {history.slice(0, 5).map((entry) => {
          const canOpenReport = entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled";

          return (
            <div
              key={entry.id}
              className="group flex items-start gap-2 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              onClick={() => !isLoading && onSelect(entry.query, entry.keywords)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                  {entry.query}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] text-slate-400">{formatRelativeTime(entry.createdAt)}</span>
                  {entry.keywords.length > 0 && (
                    <>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {entry.keywords.slice(0, 3).join(", ")}
                        {entry.keywords.length > 3 && ` +${entry.keywords.length - 3}`}
                      </span>
                    </>
                  )}
                  {canOpenReport && (
                    <>
                      <span className="text-[10px] text-slate-300">·</span>
                      <Link
                        href={`/research/${entry.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-[10px] font-semibold text-teal-700 hover:text-teal-900"
                      >
                        Open report
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeEntry(entry.id);
                }}
                className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0 p-0.5"
                title="Remove from history"
                aria-label="Remove from history"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
