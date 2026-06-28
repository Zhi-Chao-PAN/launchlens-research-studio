/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { PricingScoutOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function formatPrice(value: number, currency: string = "USD"): string {
  // R210 defense: see MarketSizerReport.formatCurrency.
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sym = currency === "USD" ? "$" : currency + " ";
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(0)}`;
}

// BAND_STYLE is keyed by the LLM-emitted band name (Budget / Mid-market /
// Premium / Enterprise). Since R243 keeps the LLM's enum values in English,
// we can keep this lookup static and just translate the *display* label
// inside the component.
const BAND_STYLE: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  Budget: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", emoji: "💚" },
  "Mid-market": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", emoji: "💙" },
  Premium: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", emoji: "💜" },
  Enterprise: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", emoji: "👑" },
};

const BAND_LABEL_KEY: Record<string, string> = {
  Budget: "report.pricing.band.budget",
  "Mid-market": "report.pricing.band.midMarket",
  Premium: "report.pricing.band.premium",
  Enterprise: "report.pricing.band.enterprise",
};

const TIER_COLOR = ["from-emerald-500 to-teal-500", "from-indigo-500 to-violet-500", "from-amber-500 to-orange-500"];

export function PricingScoutReport({ output }: { output: any }) {
  const data = output as PricingScoutOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();

  // Visualize price bands as overlapping range bars
  const allBands = data.priceBands;
  const maxPrice = Math.max(...allBands.map((b: any) => b.max), 1);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.pricing.title")}
        description={data.summary}
        icon="💰"
        count={data.priceBands.length + data.recommendations.length}
        accent="emerald"
        onCopy={() => copy(generateAgentMarkdown("pricing-scout", data), "pricing-scout")}
        copied={copied === "pricing-scout"}
        copyLabel={t("report.pricing.copySection")}
      />

      {/* Price bands visualization */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("report.pricing.priceBands")}
        </h3>
        <div className="space-y-2">
          {allBands.map((band: any, i: number) => {
            const style = BAND_STYLE[band.name] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", emoji: "💼" };
            const bandLabel = BAND_LABEL_KEY[band.name] ? t(BAND_LABEL_KEY[band.name]) : band.name;
            const leftPct = (band.min / maxPrice) * 100;
            const widthPct = Math.max(8, ((band.max - band.min) / maxPrice) * 100);
            return (
              <div key={i} className={`p-3 rounded-lg border ${style.bg} ${style.border}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-sm font-semibold ${style.text} flex items-center gap-1.5`}>
                    <span aria-hidden>{style.emoji}</span>
                    <span>{bandLabel}</span>
                  </p>
                  <p className={`text-sm font-bold ${style.text}`}>
                    {formatPrice(band.min, band.currency)} – {formatPrice(band.max, band.currency)}
                  </p>
                </div>
                <div className="relative h-3 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-slate-300 rounded-full"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                  <div
                    className="absolute h-full w-0.5 bg-slate-700"
                    style={{ left: `${(band.typical / maxPrice) * 100}%` }}
                    title={t("report.pricing.typicalMarker")}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("report.pricing.typicalPrefix")} <span className="font-semibold">{formatPrice(band.typical, band.currency)}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">{t("report.pricing.recommendedTiers")}</h3>
        <div className={`grid gap-3 ${data.recommendations.length === 1 ? "grid-cols-1" : data.recommendations.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {data.recommendations.map((rec: any, i: number) => {
            const grad = TIER_COLOR[i % TIER_COLOR.length];
            // R214: route rec.price through formatPrice so a NaN price renders
            // as "—" instead of "$NaN"; surface the period enum the normalizer
            // produces, with a clear localized label per period.
            const periodLabelKey: Record<string, string> = {
              monthly: "report.pricing.perUserMonth",
              yearly: "report.pricing.perUserYear",
              "one-time": "report.pricing.oneTime",
              usage: "report.pricing.perUsage",
            };
            const periodLabel = t(periodLabelKey[rec.period] || "report.pricing.perUserMonth");
            const currency = rec.currency || "USD";
            return (
              <div key={i} className={`p-4 bg-gradient-to-br ${grad} rounded-xl text-white shadow-md`}>
                <p className="text-xs uppercase tracking-wide font-semibold opacity-90">{rec.tier}</p>
                <p className="text-3xl font-bold mt-1">{formatPrice(rec.price, currency)}</p>
                <p className="text-xs opacity-90 mt-1">{periodLabel}</p>
                <p className="text-xs opacity-80 mt-2 italic">{rec.rationale}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monetization models */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">{t("report.pricing.monetizationModels")}</h3>
        <div className="space-y-2">
          {data.monetizationModels.map((m: any, i: number) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-800">{m.model}</p>
                <span className="text-xs font-mono text-indigo-600 flex-shrink-0">{m.prevalence}% {t("report.pricing.prevalenceSuffix")}</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${m.prevalence}%` }} />
              </div>
              <p className="text-xs text-slate-500">{t("report.pricing.examplesPrefix")} {m.examples.join(", ")}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Willingness to pay */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">{t("report.pricing.willingnessToPay")}</h3>
        <div className="space-y-2">
          {data.willingnessToPay.map((w: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{w.segment}</p>
              </div>
              <div className="text-right flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-slate-800">{formatPrice(w.estimate)}{t("report.pricing.perMonth")}</span>
                <ConfidenceBadge level={w.confidence} size="xs" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}
