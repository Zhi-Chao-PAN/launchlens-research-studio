/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import type { MarketSizerOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";

function formatCurrency(value: number, currency: string = "USD"): string {
  // R210 defense: provider normalization guarantees a finite number, but
  // older cached sessions or future schema drift could still hand us
  // undefined/NaN. Render a dash instead of throwing on `.toFixed()`.
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sym = currency === "USD" ? "$" : currency + " ";
  if (value >= 1e9) return `${sym}${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${sym}${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${sym}${(value / 1e3).toFixed(0)}K`;
  return `${sym}${value.toFixed(0)}`;
}

const TREND_ICON = { positive: "📈", negative: "📉", neutral: "➡️" } as const;
const TREND_COLOR = {
  positive: "bg-emerald-50 border-emerald-100",
  negative: "bg-rose-50 border-rose-100",
  neutral: "bg-slate-50 border-slate-100",
} as const;

export function MarketSizerReport({ output }: { output: any }) {
  const data = output as MarketSizerOutput;
  const { copied, copy } = useCopyText();

  // Sanity check the nested TAM/SAM/SOM relationship
  const tamLabel = "Total addressable market";
  const samLabel = "Serviceable addressable market";
  const somLabel = "3-year obtainable market";
  const tam = data.marketSize.tam;
  const sam = data.marketSize.sam;
  const som = data.marketSize.som;
  const samPct = tam > 0 ? Math.round((sam / tam) * 100) : 0;
  const somPct = sam > 0 ? Math.round((som / sam) * 100) : 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Market Sizer"
        description={data.summary}
        icon="📊"
        count={data.targetSegments.length}
        accent="indigo"
        onCopy={() => copy(generateAgentMarkdown("market-sizer", data), "market-sizer")}
        copied={copied === "market-sizer"}
        copyLabel="Copy section"
      />

      {/* Market size cards with proportional bars */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Market Size Estimate</h3>
        <div className="space-y-3">
          <SizeBar label="TAM" sublabel={tamLabel} displayValue={formatCurrency(tam, data.marketSize.currency)} percentage={100} color="from-indigo-600 to-violet-600" />
          <SizeBar label="SAM" sublabel={samLabel} displayValue={formatCurrency(sam, data.marketSize.currency)} percentage={samPct} color="from-indigo-400 to-violet-500" />
          <SizeBar label="SOM" sublabel={somLabel} displayValue={formatCurrency(som, data.marketSize.currency)} percentage={somPct} color="from-emerald-400 to-teal-500" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-700 flex items-center gap-1">
            <span>📊</span>
            <span className="font-semibold">{data.marketSize.growthRate}%/yr</span>
            <span className="text-slate-500">growth</span>
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${
            data.marketSize.growthTrend === "accelerating"
              ? "bg-emerald-100 text-emerald-700"
              : data.marketSize.growthTrend === "declining"
              ? "bg-rose-100 text-rose-700"
              : "bg-slate-100 text-slate-700"
          }`}>
            <span aria-hidden>{data.marketSize.growthTrend === "accelerating" ? "🚀" : data.marketSize.growthTrend === "declining" ? "🔻" : "➡️"}</span>
            <span className="capitalize">{data.marketSize.growthTrend} trend</span>
          </span>
          <ConfidenceBadge level={data.marketSize.confidence} withLabel />
        </div>
      </div>

      {/* Trends */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          Key Trends <span className="text-xs text-slate-400 font-normal">({data.keyTrends.length})</span>
        </h3>
        <div className="space-y-2">
          {data.keyTrends.map((trend: { trend: string; impact: "positive" | "negative" | "neutral"; evidence: string }, i: number) => (
            <div key={i} className={`p-3 rounded-lg border ${TREND_COLOR[trend.impact as keyof typeof TREND_COLOR] || TREND_COLOR.neutral}`}>
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0" aria-hidden>
                  {TREND_ICON[trend.impact as keyof typeof TREND_ICON] || "➡️"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{trend.trend}</p>
                  <p className="text-xs text-slate-600 mt-1">{trend.evidence}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Target Segments */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Target Segments</h3>
        <div className="grid grid-cols-1 gap-2">
          {data.targetSegments.map((seg: { name: string; size: number; description: string }, i: number) => {
            const segPct = data.marketSize.sam > 0 ? Math.min(100, (seg.size / data.marketSize.sam) * 100) : 0;
            return (
              <div key={i} className="p-3 bg-slate-50 rounded-lg">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{seg.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{seg.description}</p>
                  </div>
                  <span className="text-sm font-bold text-indigo-600 flex-shrink-0">{formatCurrency(seg.size, data.marketSize.currency)}</span>
                </div>
                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${segPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}

function SizeBar({ label, sublabel, displayValue, percentage, color }: { label: string; sublabel: string; displayValue: string; percentage: number; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-[10px] text-slate-400">{sublabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-800">{displayValue}</p>
          {label !== "TAM" && (
            <p className="text-[10px] text-slate-500 font-mono">{percentage}% of {label === "SAM" ? "TAM" : "SAM"}</p>
          )}
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-1000`} style={{ width: `${label === "TAM" ? 100 : percentage}%` }} />
      </div>
    </div>
  );
}
