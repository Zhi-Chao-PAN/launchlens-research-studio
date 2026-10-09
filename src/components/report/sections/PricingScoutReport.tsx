/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import type { PricingScoutOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";

function formatPrice(value: number, currency: string = "USD"): string {
  const sym = currency === "USD" ? "$" : currency + " ";
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(0)}`;
}

const BAND_STYLE: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  Budget: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", emoji: "💚" },
  "Mid-market": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", emoji: "💙" },
  Premium: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", emoji: "💜" },
  Enterprise: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", emoji: "👑" },
};

const TIER_COLOR = ["from-emerald-500 to-teal-500", "from-indigo-500 to-violet-500", "from-amber-500 to-orange-500"];

export function PricingScoutReport({ output }: { output: any }) {
  const data = output as PricingScoutOutput;
  const { t } = useLocale();
  const { copied, copy } = useCopyText();

  // Visualize price bands as overlapping range bars
  const allBands = data.priceBands;
  const maxPrice = Math.max(...allBands.map((b: any) => b.max), 1);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("agent.pricing-scout.name", "Pricing Scout")}
        description={data.summary}
        icon="💰"
        count={data.priceBands.length + data.recommendations.length}
        accent="emerald"
        onCopy={() => copy(generateAgentMarkdown("pricing-scout", data), "pricing-scout")}
        copied={copied === "pricing-scout"}
        copyLabel={t("actions.copySection", "Copy section")}
      />

      {/* Price bands visualization */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("pricing.bands", "Price Bands")}
        </h3>
        <div className="space-y-2">
          {allBands.map((band: any, i: number) => {
            const style = BAND_STYLE[band.name] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", emoji: "💼" };
            const leftPct = (band.min / maxPrice) * 100;
            const widthPct = Math.max(8, ((band.max - band.min) / maxPrice) * 100);
            return (
              <div key={i} className={`p-3 rounded-lg border ${style.bg} ${style.border}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className={`text-sm font-semibold ${style.text} flex items-center gap-1.5`}>
                    <span aria-hidden>{style.emoji}</span>
                    <span>{band.name}</span>
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
                    title={t("pricing.typicalLabel", "Typical")}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("pricing.typicalLabel", "Typical")}: <span className="font-semibold">{formatPrice(band.typical, band.currency)}</span>
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          {t("pricing.legend", "← Min | → Max | Vertical mark = typical price")}
        </p>
      </div>

      {/* Recommendations */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("pricing.recommendations", "Recommended Pricing Tiers")}
        </h3>
        <div className={`grid gap-3 ${data.recommendations.length === 1 ? "grid-cols-1" : data.recommendations.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {data.recommendations.map((rec: any, i: number) => {
            const grad = TIER_COLOR[i % TIER_COLOR.length];
            return (
              <div key={i} className={`p-4 bg-gradient-to-br ${grad} rounded-xl text-white shadow-md`}>
                <p className="text-xs uppercase tracking-wide font-semibold opacity-90">{rec.tier}</p>
                <p className="text-3xl font-bold mt-1">${rec.price}</p>
                <p className="text-xs opacity-90 mt-1">{rec.period || "per user / month"}</p>
                <p className="text-xs opacity-80 mt-2 italic">{rec.rationale}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monetization models */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("pricing.models", "Monetization Models")}
        </h3>
        <div className="space-y-2">
          {data.monetizationModels.map((m: any, i: number) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-slate-800">{m.model}</p>
                <span className="text-xs font-mono text-indigo-600 flex-shrink-0">
                  {m.prevalence}% {t("pricing.prevalence", "prevalence")}
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${m.prevalence}%` }} />
              </div>
              <p className="text-xs text-slate-500">
                {t("pricing.examples", "Examples")}: {m.examples.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Willingness to pay */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("pricing.wtpSegment", "Willingness to Pay by Segment")}
        </h3>
        <div className="space-y-2">
          {data.willingnessToPay.map((w: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{w.segment}</p>
              </div>
              <div className="text-right flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-bold text-slate-800">{formatPrice(w.estimate, w.currency)}/{w.period || "mo"}</span>
                <ConfidenceBadge level={w.confidence} size="xs" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Competitor pricing */}
      {data.competitorPricing && data.competitorPricing.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
            {t("competitor.pricing", "Competitor Pricing")}{" "}
            <span className="text-xs text-slate-400 font-normal">({data.competitorPricing.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-left">
                  <th className="py-2 pr-3 font-medium">
                    {t("report.competitor.nameColumn", "Competitor")}
                  </th>
                  <th className="py-2 px-3 font-medium">
                    {t("pricing.recommendations", "Tiers")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.competitorPricing.map((cp: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700">{cp.competitor}</td>
                    <td className="py-2 px-3 text-slate-600">
                      <div className="flex flex-wrap gap-1">
                        {cp.tiers.map((tier: any, j: number) => (
                          <span key={j} className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">
                            {tier.tier}: {formatPrice(tier.price, tier.currency || "USD")}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CitationList citations={data.citations} />
    </div>
  );
}