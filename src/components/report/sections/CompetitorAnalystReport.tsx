/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { CompetitorAnalystOutput, Competitor } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { Stars } from "../primitives/Meter";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Style maps stay module-level (style only); the human-readable label is
// looked up inside the component via t() so it follows the active locale.
const POSITIONING_STYLE: Record<Competitor["positioning"], { bg: string; text: string; emoji: string; key: string }> = {
  premium: { bg: "bg-violet-100", text: "text-violet-700", emoji: "💎", key: "report.competitor.positioning.premium" },
  "mid-market": { bg: "bg-indigo-100", text: "text-indigo-700", emoji: "⚖️", key: "report.competitor.positioning.midMarket" },
  budget: { bg: "bg-emerald-100", text: "text-emerald-700", emoji: "💰", key: "report.competitor.positioning.budget" },
  niche: { bg: "bg-amber-100", text: "text-amber-700", emoji: "🎯", key: "report.competitor.positioning.niche" },
};

const DIFFICULTY_STYLE = {
  low: { bg: "bg-emerald-100", text: "text-emerald-700", emoji: "🟢" },
  medium: { bg: "bg-amber-100", text: "text-amber-700", emoji: "🟡" },
  high: { bg: "bg-rose-100", text: "text-rose-700", emoji: "🔴" },
} as const;

function formatPrice(min: number, max: number, currency: string): string {
  const sym = currency === "USD" ? "$" : currency + " ";
  // R214: defend against non-finite prices. The schema requires numbers but
  // historical runs in storage may have NaN if a malformed LLM response
  // bypassed validation; the prior version rendered "$NaN–$NaN". Match the
  // R210 MarketSizer / PricingScout pattern: coerce to finite, fall back to
  // a question mark when both bounds are non-finite.
  const safeMin = typeof min === "number" && Number.isFinite(min) ? min : NaN;
  const safeMax = typeof max === "number" && Number.isFinite(max) ? max : NaN;
  const lo = Number.isFinite(safeMin) ? String(safeMin) : "?";
  const hi = Number.isFinite(safeMax) ? String(safeMax) : "?";
  return `${sym}${lo}–${sym}${hi}`;
}

export function CompetitorAnalystReport({ output }: { output: any }) {
  const data = output as CompetitorAnalystOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.competitor.title")}
        description={data.summary}
        icon="🏆"
        count={data.competitors.length}
        accent="amber"
        onCopy={() => copy(generateAgentMarkdown("competitor-analyst", data), "competitor-analyst")}
        copied={copied === "competitor-analyst"}
        copyLabel={t("report.competitor.copySection")}
      />

      {/* Competitor cards */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("report.competitor.competitors")} <span className="text-xs text-slate-400 font-normal">({data.competitors.length})</span>
        </h3>
        <div className="space-y-3">
          {data.competitors.map((comp) => {
            const pos = POSITIONING_STYLE[comp.positioning] || POSITIONING_STYLE["mid-market"];
            // Compute a simple market-position score 1-5 from strength/weakness balance
            const score = Math.max(1, Math.min(5, comp.strengths.length - comp.weaknesses.length + 3));
            return (
              <div key={comp.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-800">{comp.name}</h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pos.bg} ${pos.text} flex items-center gap-1`}>
                        <span aria-hidden>{pos.emoji}</span>
                        <span>{t(pos.key)}</span>
                      </span>
                      <Stars value={score} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 italic">{comp.tagline}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1.5">{t("report.competitor.strengths")}</p>
                    <ul className="text-xs text-slate-700 space-y-1">
                      {comp.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600 mb-1.5">{t("report.competitor.weaknesses")}</p>
                    <ul className="text-xs text-slate-700 space-y-1">
                      {comp.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-rose-500 flex-shrink-0 mt-0.5">✗</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">
                      <span className="font-semibold text-slate-700">{formatPrice(comp.pricing.min, comp.pricing.max, comp.pricing.currency)}</span>
                      <span className="text-slate-400"> /{comp.pricing.model}</span>
                    </span>
                    {comp.marketShare !== undefined && (
                      <span className="text-slate-500">
                        <span className="font-semibold text-slate-700">{comp.marketShare}%</span> {t("report.competitor.marketShareSuffix")}
                      </span>
                    )}
                    {comp.url && (
                      <a
                        href={comp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline flex items-center gap-0.5"
                      >
                        {t("report.competitor.visit")} <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                  <span className="text-slate-600 italic">{comp.differentiation}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Competitive Matrix */}
      {data.competitiveMatrix && data.competitiveMatrix.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">{t("report.competitor.matrix")}</h3>
          <div className="space-y-3">
            {data.competitiveMatrix.map((dim, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">{dim.dimension}</p>
                <div className="space-y-1.5">
                  {dim.players.map((p, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className="text-xs text-slate-700 w-28 truncate flex-shrink-0">{p.name}</span>
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full" style={{ width: `${(p.score / 5) * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-600 font-mono w-6 text-right flex-shrink-0">{p.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          {t("report.competitor.gaps")} <span className="text-xs text-slate-400 font-normal">({data.gaps.length})</span>
        </h3>
        <div className="space-y-2">
          {data.gaps.map((gap: any, i: number) => {
            const d = DIFFICULTY_STYLE[gap.difficulty as keyof typeof DIFFICULTY_STYLE] || DIFFICULTY_STYLE.medium;
            return (
              <div key={i} className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-emerald-900">{gap.gap}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 flex-shrink-0 ${d.bg} ${d.text}`}>
                    <span aria-hidden>{d.emoji}</span>
                    <span className="capitalize">{gap.difficulty}</span>
                  </span>
                </div>
                <p className="text-xs text-emerald-700">
                  <span className="font-semibold">{t("report.competitor.gapOpportunity")}</span> {gap.opportunity}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}
