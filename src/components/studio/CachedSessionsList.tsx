"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { listCachedSessions, deleteCachedSession, type CachedSession } from "@/lib/research/session-cache";
import { formatRelativeTime } from "@/lib/research/history";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface CachedSessionsProps {
  refreshKey: number;
  onSelect: (cached: CachedSession) => void;
  onClear: () => void;
}

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

function agentProgress(c: CachedSession): { done: number; total: number } {
  let done = 0;
  for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as const) {
    if (c.agentStatuses[id]?.status === "done") done++;
  }
  return { done, total: 6 };
}

export function CachedSessionsList({ refreshKey, onSelect, onClear }: CachedSessionsProps) {
  const [expanded, setExpanded] = useState(true);
  const { locale, t } = useLocale();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  const all = useMemo(
    () => {
      // The parent increments refreshKey after writes so this localStorage
      // snapshot is invalidated without subscribing to a browser-only store.
      void refreshKey;
      return hydrated ? listCachedSessions() : [];
    },
    [hydrated, refreshKey],
  );

  if (all.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4" data-testid="cached-sessions" aria-labelledby="saved-dossiers-title">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <h3 id="saved-dossiers-title" className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          {t("workspace.saved.title")}
          <span className="text-xs font-normal text-slate-600">{t("workspace.saved.count", { count: all.length })}</span>
        </h3>
        <span className={`text-slate-400 text-xs transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>▸</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {all.slice(0, 5).map((c) => {
            const { done, total } = agentProgress(c);
            return (
              <div key={c.id} className="group flex items-start gap-1 border-t border-slate-100 py-2.5 first:border-t-0 first:pt-0">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors"
                  onClick={() => onSelect(c)}
                >
                    <p className="text-xs font-medium text-slate-700 line-clamp-2 group-hover:text-teal-700 transition-colors">
                      {c.query}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-slate-600">{formatRelativeTime(c.completedAt, locale)}</span>
                      <span className="text-[10px] text-slate-500">·</span>
                      <span className="text-[10px] text-emerald-700 font-medium">
                        {t("workspace.analystsProgress", { done, total })}
                      </span>
                      <span className="text-[10px] text-slate-500">·</span>
                      <span className="text-[10px] text-slate-500">
                        {t(`workspace.citationCount.${c.citationCount === 1 ? "one" : "other"}`, { count: c.citationCount })}
                      </span>
                    </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteCachedSession(c.id);
                    onClear();
                  }}
                  className="text-slate-400 hover:text-rose-700 transition-colors flex-shrink-0 p-2 rounded-md hover:bg-slate-100"
                  title={t("workspace.saved.delete")}
                  aria-label={t("workspace.saved.deleteAria", { query: c.query })}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
