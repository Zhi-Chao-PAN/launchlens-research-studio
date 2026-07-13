/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { CompetitorAnalystOutput, Competitor } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { Stars } from "../primitives/Meter";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

// Style maps stay module-level (style only); the human-readable label is
// looked up inside the component via t() so it follows the active locale.
const POSITIONING_STYLE: Record<Competitor["positioning"], { key: string }> = {
  premium: { key: "report.competitor.positioning.premium" },
  "mid-market": { key: "report.competitor.positioning.midMarket" },
  budget: { key: "report.competitor.positioning.budget" },
  niche: { key: "report.competitor.positioning.niche" },
};

const DIFFICULTY_STYLE = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  high: "border-rose-200 bg-rose-50 text-rose-800",
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
        count={data.competitors.length}
        onCopy={() => copy(generateAgentMarkdown("competitor-analyst", data), "competitor-analyst")}
        copied={copied === "competitor-analyst"}
        copyLabel={t("report.competitor.copySection")}
      />

      {/* Competitor cards */}
      <div>
        <ReportSubheading title={t("report.competitor.competitors")} count={data.competitors.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.competitors.map((comp) => {
            const pos = POSITIONING_STYLE[comp.positioning] || POSITIONING_STYLE["mid-market"];
            // Compute a simple market-position score 1-5 from strength/weakness balance
            const score = Math.max(1, Math.min(5, comp.strengths.length - comp.weaknesses.length + 3));
            const safeUrl = canonicalizeSafeExternalUrl(comp.url);
            return (
              <article key={comp.id} className="py-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-slate-800">{comp.name}</h4>
                      <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700">
                        {t(pos.key)}
                      </span>
                      <Stars value={score} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 italic">{comp.tagline}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{t("report.competitor.strengths")}</p>
                    <ul className="text-xs text-slate-700 space-y-1">
                      {comp.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5 flex-shrink-0 font-mono text-emerald-700" aria-hidden>+</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{t("report.competitor.weaknesses")}</p>
                    <ul className="text-xs text-slate-700 space-y-1">
                      {comp.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5 flex-shrink-0 font-mono text-rose-700" aria-hidden>&minus;</span>
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
                    {safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700"
                      >
                        {t("report.competitor.visit")} <span aria-hidden>&nearr;</span>
                      </a>
                    )}
                  </div>
                  <span className="text-slate-600 italic">{comp.differentiation}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Competitive Matrix */}
      {data.competitiveMatrix && data.competitiveMatrix.length > 0 && (
        <div>
          <ReportSubheading title={t("report.competitor.matrix")} count={data.competitiveMatrix.length} />
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {data.competitiveMatrix.map((dim, i) => (
              <div key={i} className="py-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">{dim.dimension}</p>
                <div className="space-y-1.5">
                  {dim.players.map((p, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <span className="text-xs text-slate-700 w-28 truncate flex-shrink-0">{p.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-slate-100">
                        <div className="h-full rounded-sm bg-slate-700" style={{ width: `${(p.score / 5) * 100}%` }} />
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
        <ReportSubheading title={t("report.competitor.gaps")} count={data.gaps.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.gaps.map((gap: any, i: number) => {
            const difficultyClass = DIFFICULTY_STYLE[gap.difficulty as keyof typeof DIFFICULTY_STYLE] || DIFFICULTY_STYLE.medium;
            return (
              <div key={i} className="py-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-900">{gap.gap}</p>
                  <span className={`flex-shrink-0 border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${difficultyClass}`}>
                    <span className="capitalize">{gap.difficulty}</span>
                  </span>
                </div>
                <p className="text-xs leading-5 text-slate-600">
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
