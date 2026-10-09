/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import { useState } from "react";
import type { SynthesisOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { ConfidenceBadge } from "../primitives/ConfidenceBadge";
import { Donut } from "../primitives/Meter";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";

function opportunityLabel(score: number, t: (k: string, f?: string) => string): { label: string; emoji: string; color: string } {
  if (score >= 75) return { label: t("synthesis.opportunityStrong", "Strong opportunity"), emoji: "🚀", color: "text-emerald-700" };
  if (score >= 55) return { label: t("synthesis.opportunityPromising", "Promising"), emoji: "📈", color: "text-emerald-600" };
  if (score >= 40) return { label: t("synthesis.opportunityModerate", "Moderate"), emoji: "⚖️", color: "text-amber-600" };
  if (score >= 25) return { label: t("synthesis.opportunityChallenging", "Challenging"), emoji: "⚠️", color: "text-orange-600" };
  return { label: t("synthesis.opportunityHighRisk", "High risk"), emoji: "🛑", color: "text-rose-600" };
}

export function SynthesisReport({ output }: { output: any }) {
  const data = output as SynthesisOutput;
  const { t, fmt } = useLocale();
  const { copied, copy } = useCopyText();
  const [briefExpanded, setBriefExpanded] = useState(false);

  const opp = data.opportunityScore;
  const risk = data.riskScore;
  const oppMeta = opportunityLabel(opp, t);

  // Color the opportunity score based on value
  const oppColor = opp >= 70 ? "#10b981" : opp >= 50 ? "#f59e0b" : "#ef4444";
  const riskColor = risk >= 70 ? "#ef4444" : risk >= 50 ? "#f59e0b" : "#10b981";

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("agent.synthesis.name", "Synthesis")}
        description={data.execSummary}
        icon="🧠"
        accent="violet"
        onCopy={() => copy(generateAgentMarkdown("synthesis", data), "synthesis")}
        copied={copied === "synthesis"}
        copyLabel={t("actions.copySection", "Copy section")}
      />

      {/* Scores with rich context */}
      <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 rounded-2xl p-6 border border-violet-100">
        <div className="flex items-center justify-around">
          <Donut value={opp} label={t("report.synthesis.metric.opportunity", "Opportunity")} color={oppColor} size={110} />
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-800">{opp - risk > 0 ? "+" : ""}{opp - risk}</p>
            <p className="text-xs text-slate-500 mt-1">{t("synthesis.netScore", "Net score")}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{t("synthesis.opportunityMinusRisk", "Opportunity − Risk")}</p>
          </div>
          <Donut value={risk} label={t("report.synthesis.metric.risk", "Risk")} color={riskColor} size={110} />
        </div>
        <div className="mt-4 text-center">
          <p className={`text-sm font-semibold ${oppMeta.color} flex items-center justify-center gap-1.5`}>
            <span aria-hidden>{oppMeta.emoji}</span>
            <span>{oppMeta.label}</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {fmt("synthesis.basedOnInsights", { count: data.keyInsights.length },
              `Based on cross-agent validation across ${data.keyInsights.length} insights`)}
          </p>
        </div>
      </div>

      {/* Top opportunities */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
          <span className="text-emerald-500">📈</span> {t("synthesis.top3Opportunities", "Top 3 Opportunities")}
        </h3>
        <div className="space-y-2">
          {data.topThreeOpportunities.map((oppItem, i) => (
            <div key={i} className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-emerald-900">{oppItem.title}</h4>
                  <p className="text-sm text-emerald-800 mt-1">{oppItem.description}</p>
                  <div className="mt-2 p-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-emerald-700">
                      <span className="font-semibold">{t("synthesis.whyThisWorks", "Why this works")}:</span> {oppItem.rationale}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top risks */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
          <span className="text-rose-500">⚠️</span> {t("synthesis.top3Risks", "Top 3 Risks")}
        </h3>
        <div className="space-y-2">
          {data.topThreeRisks.map((r, i) => (
            <div key={i} className="p-4 bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl border border-rose-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-rose-900">{r.title}</h4>
                  <p className="text-sm text-rose-800 mt-1">{r.description}</p>
                  <div className="mt-2 p-2 bg-white/60 rounded-lg">
                    <p className="text-xs text-emerald-700">
                      <span className="font-semibold">{t("synthesis.mitigation", "Mitigation")}:</span> {r.mitigation}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key insights with cross-agent validation */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide flex items-center gap-2">
          <span className="text-indigo-500">🔬</span> {t("synthesis.crossValidated", "Cross-Validated Insights")}
          <span className="text-xs text-slate-400 font-normal">({data.keyInsights.length})</span>
        </h3>
        <div className="space-y-2">
          {data.keyInsights.map((ins, i) => (
            <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-start gap-2 mb-1.5">
                <p className="text-sm text-slate-800 flex-1">{ins.insight}</p>
                <ConfidenceBadge level={ins.confidence} size="xs" />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-slate-500">{t("synthesis.supportedBy", "Supported by")}:</span>
                {ins.supportingAgents.map((a) => (
                  <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended next step */}
      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl" aria-hidden>🎯</span>
          <h3 className="text-lg font-bold">{t("synthesis.nextStep", "Recommended Next Step")}</h3>
        </div>
        <p className="text-sm text-indigo-100 leading-relaxed">{data.recommendedNextStep}</p>
      </div>

      {/* LaunchLens brief - expandable */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setBriefExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <span aria-hidden>📋</span>
              {t("synthesis.brief", "LaunchLens Import Brief")}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("synthesis.briefReady", "Ready to paste into launchlens-ai for GTM strategy generation")}
            </p>
          </div>
          <span className={`text-slate-400 transition-transform ${briefExpanded ? "rotate-180" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {/* Use CSS-based hiding so print styles can force the brief to show */}
        <div className={`border-t border-slate-200 ${briefExpanded ? "" : "hidden print:block"}`}>
          <pre className="px-5 py-4 text-xs text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 print:max-h-none max-h-96 overflow-y-auto">
              {data.launchlensBrief}
            </pre>
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {data.launchlensBrief.length.toLocaleString()} {t("common.items", "characters")}
              </p>
              <button
                onClick={() => copy(data.launchlensBrief, "brief-content")}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
              >
                <span aria-hidden>{copied === "brief-content" ? "✅" : "📋"}</span>
                <span>{copied === "brief-content" ? t("actions.copied", "Copied!") : t("synthesis.copyBrief", "Copy brief")}</span>
              </button>
            </div>
          </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}