"use client";

import { useState } from "react";
import { listCachedSessions, deleteCachedSession, type CachedSession } from "@/lib/research/session-cache";
import { formatRelativeTime } from "@/lib/research/history";

interface CachedSessionsProps {
  refreshKey: number;
  onSelect: (cached: CachedSession) => void;
  onClear: () => void;
}

function agentProgress(c: CachedSession): { done: number; total: number } {
  let done = 0;
  for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as const) {
    if (c.agentStatuses[id]?.status === "done") done++;
  }
  return { done, total: 6 };
}

export function CachedSessionsList({ refreshKey, onSelect, onClear }: CachedSessionsProps) {
  const [expanded, setExpanded] = useState(true);
  const all = listCachedSessions();

  if (all.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm" data-testid="cached-sessions">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
          <span aria-hidden>📚</span>
          Past research
          <span className="text-xs text-slate-400 font-normal">({all.length})</span>
        </h3>
        <span className={`text-slate-400 text-xs transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>▸</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {all.slice(0, 5).map((c) => {
            const { done, total } = agentProgress(c);
            return (
              <div
                key={c.id}
                className="group p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                onClick={() => onSelect(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                      {c.query}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-slate-400">{formatRelativeTime(c.completedAt)}</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-emerald-600 font-medium">
                        {done}/{total} agents
                      </span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-[10px] text-slate-500">{c.citationCount} citations</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCachedSession(c.id);
                      onClear();
                    }}
                    className="text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0 p-0.5"
                    title="Delete cached session"
                    aria-label="Delete cached session"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
