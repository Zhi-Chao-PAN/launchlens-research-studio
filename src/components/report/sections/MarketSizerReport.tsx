/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { MarketSizerOutput } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

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

const TREND_STYLE = {
  positive: "text-emerald-800 border-emerald-600",
  negative: "text-rose-800 border-rose-600",
  neutral: "text-slate-700 border-slate-400",
} as const;

const SIZE_BAR_COLOR = {
  primary: "bg-slate-900",
  secondary: "bg-slate-600",
  positive: "bg-emerald-700",
} as const;

export function MarketSizerReport({ output }: { output: any }) {
  const data = output as MarketSizerOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();

  // Sanity check the nested TAM/SAM/SOM relationship
  const tamLabel = t("report.marketSizer.tamLabel");
  const samLabel = t("report.marketSizer.samLabel");
  const somLabel = t("report.marketSizer.somLabel");
  const tam = data.marketSize.tam;
  const sam = data.marketSize.sam;
  const som = data.marketSize.som;
  const samPct = tam > 0 ? Math.round((sam / tam) * 100) : 0;
  const somPct = sam > 0 ? Math.round((som / sam) * 100) : 0;

  // Trend label is a localized string built from the enum value the LLM produced.
  // The LLM was told (in the system prompt) to keep enum values in English
  // ("accelerating" / "stable" / "declining"), so we map those to the localized
  // display string here. If a future model emits a different value, we fall
  // back to a generic "trend" prefix to avoid an untranslated raw token.
  const trendKey = data.marketSize.growthTrend as "accelerating" | "stable" | "declining" | string;
  const trendLabel =
    trendKey === "accelerating" ? t("report.marketSizer.trendAccelerating")
    : trendKey === "stable" ? t("report.marketSizer.trendStable")
    : trendKey === "declining" ? t("report.marketSizer.trendDeclining")
    : `${data.marketSize.growthTrend} ${t("report.marketSizer.trendPrefix")}`;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.marketSizer.title")}
        description={data.summary}
        count={data.targetSegments.length}
        onCopy={() => copy(generateAgentMarkdown("market-sizer", data), "market-sizer")}
        copied={copied === "market-sizer"}
        copyLabel={t("report.marketSizer.copySection")}
      />

      {/* Market size cards with proportional bars */}
      <div>
        <ReportSubheading title={t("report.marketSizer.marketSizeEstimate")} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          <SizeBar label="TAM" sublabel={tamLabel} displayValue={formatCurrency(tam, data.marketSize.currency)} percentage={100} color="primary" t={t} />
          <SizeBar label="SAM" sublabel={samLabel} displayValue={formatCurrency(sam, data.marketSize.currency)} percentage={samPct} color="secondary" t={t} />
          <SizeBar label="SOM" sublabel={somLabel} displayValue={formatCurrency(som, data.marketSize.currency)} percentage={somPct} color="positive" t={t} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-800">
            {t("report.marketSizer.growthRateValue", { value: data.marketSize.growthRate })}
          </span>
          <span className={`inline-flex items-center border px-2.5 py-1 font-medium ${
            data.marketSize.growthTrend === "accelerating"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : data.marketSize.growthTrend === "declining"
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            <span>{trendLabel}</span>
          </span>
          <ConfidenceBadge level={data.marketSize.confidence} withLabel />
        </div>
      </div>

      {/* Trends */}
      <div>
        <ReportSubheading title={t("report.marketSizer.keyTrends")} count={data.keyTrends.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.keyTrends.map((trend: { trend: string; impact: "positive" | "negative" | "neutral"; evidence: string }, i: number) => (
            <div key={i} className="grid gap-2 py-3 sm:grid-cols-[6rem_1fr] sm:gap-4">
              <span className={`w-fit border-l-2 pl-2 text-[10px] font-semibold uppercase tracking-widest ${TREND_STYLE[trend.impact] || TREND_STYLE.neutral}`}>
                {trend.impact}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{trend.trend}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{trend.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Target Segments */}
      <div>
        <ReportSubheading title={t("report.marketSizer.targetSegments")} count={data.targetSegments.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.targetSegments.map((seg: { name: string; size: number; description: string }, i: number) => {
            const segPct = data.marketSize.sam > 0 ? Math.min(100, (seg.size / data.marketSize.sam) * 100) : 0;
            return (
              <div key={i} className="py-3">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{seg.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{seg.description}</p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(seg.size, data.marketSize.currency)}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
                  <div className="h-full rounded-sm bg-slate-700" style={{ width: `${segPct}%` }} />
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

function SizeBar({ label, sublabel, displayValue, percentage, color, t }: { label: string; sublabel: string; displayValue: string; percentage: number; color: keyof typeof SIZE_BAR_COLOR; t: (k: string, params?: Record<string, string | number>) => string }) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-[10px] text-slate-400">{sublabel}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-semibold tabular-nums text-slate-950">{displayValue}</p>
          {label !== "TAM" && (
            <p className="text-[10px] text-slate-500 font-mono">{percentage}{t("report.marketSizer.percentOf")} {label === "SAM" ? "TAM" : "SAM"}</p>
          )}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-slate-100">
        <div className={`h-full rounded-sm ${SIZE_BAR_COLOR[color]}`} style={{ width: `${label === "TAM" ? 100 : percentage}%` }} />
      </div>
    </div>
  );
}
