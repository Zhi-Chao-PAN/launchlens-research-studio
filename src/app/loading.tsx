"use client";

/* eslint-disable @next/next/no-img-element */
import { AGENT_METADATA, RESEARCH_AGENTS } from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function Loading() {
  const { t } = useLocale();
  const allAgentIds = [...RESEARCH_AGENTS, "synthesis" as const];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <img src="/logo.svg" alt="" width={48} height={48} className="inline-block w-12 h-12 mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            LaunchLens Research Studio
          </h2>
          <p className="text-slate-500 mb-8">{t("loading.message", "Warming up the research agents...")}</p>

          {/* Skeleton progress bar */}
          <div className="max-w-xs mx-auto mb-8">
            <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-loading"
                style={{ width: "40%" }}
              />
            </div>
          </div>

          {/* Staggered agent cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allAgentIds.map((id, i) => {
              const meta = AGENT_METADATA[id];
              return (
                <div
                  key={id}
                  className="p-3 bg-white rounded-xl border border-slate-200 text-center animate-skeleton-in"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="text-2xl mb-1 opacity-70">{meta.icon}</div>
                  <p className="text-sm font-semibold text-slate-700">
                    {meta.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
