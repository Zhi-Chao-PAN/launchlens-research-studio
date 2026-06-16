/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import type { PainDetectiveOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";

const SEVERITY_STYLE = {
  critical: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", icon: "🔴", bar: "bg-rose-500", score: 5 },
  significant: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "🟡", bar: "bg-amber-500", score: 3 },
  mild: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", icon: "⚪", bar: "bg-slate-400", score: 1 },
} as const;

const FREQUENCY_STYLE = {
  common: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Common" },
  occasional: { bg: "bg-slate-100", text: "text-slate-600", label: "Occasional" },
  rare: { bg: "bg-slate-100", text: "text-slate-500", label: "Rare" },
} as const;

export function PainDetectiveReport({ output }: { output: any }) {
  const data = output as PainDetectiveOutput;
  const { copied, copy } = useCopyText();

  const totalPains = data.painPoints.length;
  const criticalCount = data.painPoints.filter((p) => p.severity === "critical").length;
  const sigCount = data.painPoints.filter((p) => p.severity === "significant").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pain Detective"
        description={data.summary}
        icon="💬"
        count={totalPains}
        accent="rose"
        onCopy={() => copy(generateAgentMarkdown("pain-detective", data), "pain-detective")}
        copied={copied === "pain-detective"}
        copyLabel="Copy section"
      />

      {/* Severity distribution */}
      <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-around text-xs">
        <div className="text-center">
          <p className="text-rose-600 font-bold text-lg">{criticalCount}</p>
          <p className="text-slate-500">Critical</p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="text-center">
          <p className="text-amber-600 font-bold text-lg">{sigCount}</p>
          <p className="text-slate-500">Significant</p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="text-center">
          <p className="text-slate-500 font-bold text-lg">{data.userPersonas.length}</p>
          <p className="text-slate-500">Personas</p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div className="text-center">
          <p className="text-indigo-600 font-bold text-lg">{data.unmetNeeds.length}</p>
          <p className="text-slate-500">Unmet needs</p>
        </div>
      </div>

      {/* Pain Points */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Top Pain Points</h3>
        <div className="space-y-3">
          {data.painPoints.map((pain) => {
            const sev = SEVERITY_STYLE[pain.severity as keyof typeof SEVERITY_STYLE] || SEVERITY_STYLE.mild;
            const freq = FREQUENCY_STYLE[pain.frequency as keyof typeof FREQUENCY_STYLE] || FREQUENCY_STYLE.occasional;
            return (
              <div key={pain.id} className={`p-4 rounded-xl border ${sev.bg} ${sev.border}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-center">
                    <p className={`text-2xl ${sev.text}`} aria-hidden>{sev.icon}</p>
                    <p className={`text-[10px] font-bold uppercase mt-0.5 ${sev.text}`}>{pain.severity}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-slate-800`}>{pain.pain}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${freq.bg} ${freq.text}`}>
                        {freq.label}
                      </span>
                      {pain.userSegments.length > 0 && (
                        <span className="text-[10px] text-slate-500">
                          Affects: {pain.userSegments.join(", ")}
                        </span>
                      )}
                    </div>
                    {/* Severity bar */}
                    <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full ${sev.bar} transition-all duration-700`} style={{ width: `${(sev.score / 5) * 100}%` }} />
                    </div>

                    {/* Quotes */}
                    {pain.quotes.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {pain.quotes.slice(0, 2).map((q, i) => (
                          <div key={i} className="pl-3 border-l-2 border-slate-300">
                            <p className="text-xs text-slate-700 italic leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">— {q.source}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unmet Needs */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          Unmet Needs <span className="text-xs text-slate-400 font-normal">({data.unmetNeeds.length})</span>
        </h3>
        <div className="space-y-2">
          {data.unmetNeeds.map((u, i) => (
            <div key={i} className="p-3 bg-rose-50 rounded-lg border border-rose-100">
              <p className="text-sm font-semibold text-rose-900">{u.need}</p>
              <p className="text-xs text-rose-700 mt-1">
                <span className="font-semibold">Why unmet:</span> {u.whyUnmet}
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                <span className="font-semibold">Opportunity:</span> {u.opportunity}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* User Personas */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">User Personas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.userPersonas.map((p, i) => (
            <div key={i} className="p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl border border-indigo-100">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-600">{p.role}</p>
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Goals</p>
                  <ul className="text-xs text-slate-700 space-y-0.5 mt-1">
                    {p.goals.map((g, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 flex-shrink-0">→</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Frustrations</p>
                  <ul className="text-xs text-slate-700 space-y-0.5 mt-1">
                    {p.frustrations.map((f, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className="text-rose-500 flex-shrink-0">→</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}
