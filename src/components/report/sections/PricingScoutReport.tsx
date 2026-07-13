/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { PricingScoutOutput } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function formatPrice(value: number, currency: string = "USD"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const symbol = currency === "USD" ? "$" : `${currency} `;
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return `${symbol}${value.toFixed(0)}`;
}

const BAND_LABEL_KEY: Record<string, string> = {
  Budget: "report.pricing.band.budget",
  "Mid-market": "report.pricing.band.midMarket",
  Premium: "report.pricing.band.premium",
  Enterprise: "report.pricing.band.enterprise",
};

const PERIOD_LABEL_KEY: Record<string, string> = {
  monthly: "report.pricing.perUserMonth",
  yearly: "report.pricing.perUserYear",
  "one-time": "report.pricing.oneTime",
  usage: "report.pricing.perUsage",
};

export function PricingScoutReport({ output }: { output: any }) {
  const data = output as PricingScoutOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();
  const allBands = data.priceBands;
  const maxPrice = Math.max(...allBands.map((band: any) => band.max), 1);

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.pricing.title")}
        description={data.summary}
        count={data.priceBands.length + data.recommendations.length}
        onCopy={() => copy(generateAgentMarkdown("pricing-scout", data), "pricing-scout")}
        copied={copied === "pricing-scout"}
        copyLabel={t("report.pricing.copySection")}
      />

      <section>
        <ReportSubheading title={t("report.pricing.priceBands")} count={allBands.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {allBands.map((band: any, index: number) => {
            const bandLabel = BAND_LABEL_KEY[band.name] ? t(BAND_LABEL_KEY[band.name]) : band.name;
            const leftPct = (band.min / maxPrice) * 100;
            const widthPct = Math.max(8, ((band.max - band.min) / maxPrice) * 100);

            return (
              <div key={index} className="py-3">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{bandLabel}</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {formatPrice(band.min, band.currency)} – {formatPrice(band.max, band.currency)}
                  </p>
                </div>
                <div className="relative h-2 overflow-hidden rounded-sm bg-slate-100">
                  <div
                    className="absolute h-full rounded-sm bg-slate-500"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                  <div
                    className="absolute h-full w-0.5 bg-slate-950"
                    style={{ left: `${(band.typical / maxPrice) * 100}%` }}
                    title={t("report.pricing.typicalMarker")}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {t("report.pricing.typicalPrefix")} <span className="font-semibold text-slate-700">{formatPrice(band.typical, band.currency)}</span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <ReportSubheading title={t("report.pricing.recommendedTiers")} count={data.recommendations.length} />
        <div className={`grid gap-3 ${data.recommendations.length === 1 ? "grid-cols-1" : data.recommendations.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {data.recommendations.map((recommendation: any, index: number) => {
            const periodLabel = t(PERIOD_LABEL_KEY[recommendation.period] || "report.pricing.perUserMonth");
            const currency = recommendation.currency || "USD";
            return (
              <article key={index} className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">{recommendation.tier}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight text-slate-950">
                  {formatPrice(recommendation.price, currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{periodLabel}</p>
                <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
                  {recommendation.rationale}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <ReportSubheading title={t("report.pricing.monetizationModels")} count={data.monetizationModels.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.monetizationModels.map((model: any, index: number) => (
            <div key={index} className="py-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{model.model}</p>
                <span className="flex-shrink-0 font-mono text-xs tabular-nums text-slate-700">
                  {model.prevalence}% {t("report.pricing.prevalenceSuffix")}
                </span>
              </div>
              <div className="mb-1.5 h-1.5 overflow-hidden rounded-sm bg-slate-100">
                <div className="h-full rounded-sm bg-slate-700" style={{ width: `${model.prevalence}%` }} />
              </div>
              <p className="text-xs leading-5 text-slate-500">
                {t("report.pricing.examplesPrefix")} {model.examples.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <ReportSubheading title={t("report.pricing.willingnessToPay")} count={data.willingnessToPay.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.willingnessToPay.map((estimate: any, index: number) => (
            <div key={index} className="flex items-center gap-3 py-3">
              <p className="min-w-0 flex-1 text-sm text-slate-800">{estimate.segment}</p>
              <div className="flex flex-shrink-0 items-center gap-2 text-right">
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {formatPrice(estimate.estimate)}{t("report.pricing.perMonth")}
                </span>
                <ConfidenceBadge level={estimate.confidence} size="xs" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <CitationList citations={data.citations} />
    </div>
  );
}
