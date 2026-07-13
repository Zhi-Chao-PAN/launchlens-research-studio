"use client";

import Link from "next/link";
import { useResearchHistory, formatRelativeTime } from "@/lib/research/history";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface RecentQueriesProps {
  onSelect: (query: string, keywords: string[]) => void;
  isLoading: boolean;
}

export function RecentQueries({ onSelect, isLoading }: RecentQueriesProps) {
  const { history, removeEntry, clearAll, hydrated } = useResearchHistory();
  const { locale, t } = useLocale();

  if (!hydrated || history.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4" aria-labelledby="recent-research-title">
      <div className="flex items-center justify-between mb-3">
        <h3 id="recent-research-title" className="font-semibold text-slate-900 text-sm">
          {t("workspace.recent.title")}
        </h3>
        <button
          onClick={clearAll}
          className="text-[10px] text-slate-600 hover:text-slate-800"
          title={t("history.buttonClear")}
        >
          {t("history.buttonClear")}
        </button>
      </div>
      <div className="space-y-1.5">
        {history.slice(0, 5).map((entry) => {
          const canOpenReport = entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled";

          return (
            <div key={entry.id} className="group flex items-start gap-1 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => onSelect(entry.query, entry.keywords)}
                className="flex-1 min-w-0 text-left rounded-md px-2 py-1.5 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <p className="text-xs font-medium text-slate-700 line-clamp-2 group-hover:text-teal-700 transition-colors">
                  {entry.query}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] text-slate-600">{formatRelativeTime(entry.createdAt, locale)}</span>
                  {entry.keywords.length > 0 && (
                    <>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="truncate text-[10px] text-slate-600">
                        {entry.keywords.slice(0, 3).join(", ")}
                        {entry.keywords.length > 3 && ` ${t("workspace.keywordsMore", { count: entry.keywords.length - 3 })}`}
                      </span>
                    </>
                  )}
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] font-semibold text-slate-500">{t("workspace.recent.rerun")}</span>
                </div>
              </button>
              {canOpenReport && (
                <Link
                  href={`/research/${entry.id}`}
                  className="text-[10px] font-semibold text-teal-700 hover:text-teal-900 rounded-md px-2 py-2 hover:bg-teal-50"
                >
                  {t("workspace.recent.open")}
                  <span className="sr-only">: {entry.query}</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="text-slate-400 hover:text-rose-700 transition-colors flex-shrink-0 p-2 rounded-md hover:bg-slate-100"
                title={t("workspace.recent.remove")}
                aria-label={t("workspace.recent.removeAria", { query: entry.query })}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
