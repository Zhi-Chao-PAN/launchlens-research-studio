/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import type { SynthesisOutput } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { Donut } from "../primitives/Meter";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

function opportunityMeta(score: number, t: (key: string) => string): { label: string; color: string } {
  if (score >= 75) return { label: t("report.synthesis.opportunityLabel.strong"), color: "text-emerald-800" };
  if (score >= 55) return { label: t("report.synthesis.opportunityLabel.promising"), color: "text-emerald-800" };
  if (score >= 40) return { label: t("report.synthesis.opportunityLabel.moderate"), color: "text-amber-900" };
  if (score >= 25) return { label: t("report.synthesis.opportunityLabel.challenging"), color: "text-orange-800" };
  return { label: t("report.synthesis.opportunityLabel.highRisk"), color: "text-rose-800" };
}

export function SynthesisReport({ output }: { output: any }) {
  const data = output as SynthesisOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();
  const [briefExpanded, setBriefExpanded] = useState(false);

  const opportunityScore = data.opportunityScore;
  const riskScore = data.riskScore;
  const meta = opportunityMeta(opportunityScore, t);
  const opportunityColor = opportunityScore >= 70 ? "#047857" : opportunityScore >= 50 ? "#b45309" : "#be123c";
  const riskColor = riskScore >= 70 ? "#be123c" : riskScore >= 50 ? "#b45309" : "#047857";

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.synthesis.title")}
        description={data.execSummary}
        onCopy={() => copy(generateAgentMarkdown("synthesis", data), "synthesis")}
        copied={copied === "synthesis"}
        copyLabel={t("report.synthesis.copySection")}
      />

      <section className="border-y border-slate-200 py-5" aria-label={t("report.synthesis.opportunity")}>
        <div className="grid grid-cols-2 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <Donut value={opportunityScore} label={t("report.synthesis.opportunity")} color={opportunityColor} size={104} />
          <div className="order-3 col-span-2 border-t border-slate-200 pt-4 text-center sm:order-none sm:col-span-1 sm:border-x sm:border-t-0 sm:px-6 sm:pt-0">
            <p className="font-mono text-3xl font-semibold tabular-nums text-slate-950">
              {opportunityScore - riskScore > 0 ? "+" : ""}{opportunityScore - riskScore}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-600">{t("report.synthesis.netScore")}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{t("report.synthesis.netScoreFormula")}</p>
          </div>
          <Donut value={riskScore} label={t("report.synthesis.risk")} color={riskColor} size={104} />
        </div>
        <div className="mt-4 border-t border-slate-200 pt-3 text-center">
          <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("report.synthesis.basedOnInsights", { count: data.keyInsights.length })}
          </p>
        </div>
      </section>

      <section>
        <ReportSubheading title={t("report.synthesis.topOpportunities")} count={data.topThreeOpportunities.length} />
        <ol className="divide-y divide-slate-200 border-y border-slate-200">
          {data.topThreeOpportunities.map((opportunity, index) => (
            <li key={index} className="grid gap-3 py-4 sm:grid-cols-[2rem_1fr]">
              <span className="font-mono text-sm font-semibold tabular-nums text-emerald-800" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-950">{opportunity.title}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-700">{opportunity.description}</p>
                <p className="mt-2 border-l border-emerald-500 pl-3 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-800">{t("report.synthesis.whyWorks")}</span> {opportunity.rationale}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <ReportSubheading title={t("report.synthesis.topRisks")} count={data.topThreeRisks.length} />
        <ol className="divide-y divide-slate-200 border-y border-slate-200">
          {data.topThreeRisks.map((risk, index) => (
            <li key={index} className="grid gap-3 py-4 sm:grid-cols-[2rem_1fr]">
              <span className="font-mono text-sm font-semibold tabular-nums text-rose-800" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-950">{risk.title}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-700">{risk.description}</p>
                <p className="mt-2 border-l border-slate-400 pl-3 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-800">{t("report.synthesis.mitigation")}</span> {risk.mitigation}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <ReportSubheading title={t("report.synthesis.crossValidated")} count={data.keyInsights.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.keyInsights.map((insight, index) => (
            <article key={index} className="py-3">
              <div className="mb-2 flex items-start gap-3">
                <p className="flex-1 text-sm leading-6 text-slate-800">{insight.insight}</p>
                <ConfidenceBadge level={insight.confidence} size="xs" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-500">{t("report.synthesis.supportedBy")}</span>
                {insight.supportingAgents.map((agent) => (
                  <span key={agent} className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                    {agent}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border border-slate-900 bg-slate-950 px-5 py-5 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          {t("report.synthesis.nextStep")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-100">{data.recommendedNextStep}</p>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setBriefExpanded((value) => !value)}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"
          aria-expanded={briefExpanded}
        >
          <span>
            <span className="block font-semibold text-slate-900">{t("report.synthesis.importBrief")}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{t("report.synthesis.importBriefSubtitle")}</span>
          </span>
          <span className="font-mono text-lg font-normal text-slate-500" aria-hidden>{briefExpanded ? "−" : "+"}</span>
        </button>
        {briefExpanded && (
          <div className="border-t border-slate-200">
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap bg-slate-50 px-4 py-4 font-mono text-xs leading-5 text-slate-700">
              {data.launchlensBrief}
            </pre>
            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
              <p className="font-mono text-xs tabular-nums text-slate-500">
                {data.launchlensBrief.length.toLocaleString()} {t("report.synthesis.charactersSuffix")}
              </p>
              <button
                type="button"
                onClick={() => copy(data.launchlensBrief, "brief-content")}
                className="min-h-9 border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
              >
                {copied === "brief-content" ? t("report.synthesis.copiedBrief") : t("report.synthesis.copyBrief")}
              </button>
            </div>
          </div>
        )}
      </section>

      <CitationList citations={data.citations} />
    </div>
  );
}
