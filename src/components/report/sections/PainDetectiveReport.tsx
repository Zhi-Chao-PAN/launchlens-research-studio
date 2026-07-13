/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { PainDetectiveOutput } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const SEVERITY_STYLE = {
  critical: { text: "text-rose-800", bar: "bg-rose-700", score: 5, key: "report.pain.critical" },
  significant: { text: "text-amber-900", bar: "bg-amber-700", score: 3, key: "report.pain.significant" },
  mild: { text: "text-slate-700", bar: "bg-slate-500", score: 1, key: "report.pain.minor" },
} as const;

const FREQUENCY_KEY: Record<string, string> = {
  common: "report.pain.frequency.common",
  occasional: "report.pain.frequency.occasional",
  rare: "report.pain.frequency.rare",
};

export function PainDetectiveReport({ output }: { output: any }) {
  const data = output as PainDetectiveOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();

  const totalPains = data.painPoints.length;
  const criticalCount = data.painPoints.filter((p) => p.severity === "critical").length;
  const sigCount = data.painPoints.filter((p) => p.severity === "significant").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.pain.title")}
        description={data.summary}
        count={totalPains}
        onCopy={() => copy(generateAgentMarkdown("pain-detective", data), "pain-detective")}
        copied={copied === "pain-detective"}
        copyLabel={t("report.pain.copySection")}
      />

      {/* Severity distribution */}
      <div className="grid grid-cols-2 border-y border-slate-200 text-xs sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
        <div className="border-b border-slate-200 px-3 py-3 text-center sm:border-b-0">
          <p className="font-mono text-lg font-semibold tabular-nums text-rose-800">{criticalCount}</p>
          <p className="text-slate-500">{t("report.pain.critical")}</p>
        </div>
        <div className="border-b border-l border-slate-200 px-3 py-3 text-center sm:border-b-0 sm:border-l-0">
          <p className="font-mono text-lg font-semibold tabular-nums text-amber-900">{sigCount}</p>
          <p className="text-slate-500">{t("report.pain.significant")}</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="font-mono text-lg font-semibold tabular-nums text-slate-800">{data.userPersonas.length}</p>
          <p className="text-slate-500">{t("report.pain.personas")}</p>
        </div>
        <div className="border-l border-slate-200 px-3 py-3 text-center sm:border-l-0">
          <p className="font-mono text-lg font-semibold tabular-nums text-slate-800">{data.unmetNeeds.length}</p>
          <p className="text-slate-500">{t("report.pain.unmetNeeds")}</p>
        </div>
      </div>

      {/* Pain Points */}
      <div>
        <ReportSubheading title={t("report.pain.topPainPoints")} count={totalPains} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.painPoints.map((pain) => {
            const sev = SEVERITY_STYLE[pain.severity as keyof typeof SEVERITY_STYLE] || SEVERITY_STYLE.mild;
            const freqKey = FREQUENCY_KEY[pain.frequency as keyof typeof FREQUENCY_KEY] || "report.pain.frequency.occasional";
            return (
              <article key={pain.id} className="py-4">
                <div className="flex items-start gap-4">
                  <div className="w-20 flex-shrink-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-widest ${sev.text}`}>{t(sev.key)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold text-slate-800`}>{pain.pain}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {t(freqKey)}
                      </span>
                      {pain.userSegments.length > 0 && (
                        <span className="text-[10px] text-slate-500">
                          {t("report.pain.affectsPrefix")} {pain.userSegments.join(", ")}
                        </span>
                      )}
                    </div>
                    {/* Severity bar */}
                    <div className="mt-2 h-1 overflow-hidden rounded-sm bg-slate-100">
                      <div className={`h-full rounded-sm ${sev.bar}`} style={{ width: `${(sev.score / 5) * 100}%` }} />
                    </div>

                    {/* Quotes — LLM-generated, leave verbatim */}
                    {pain.quotes.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {pain.quotes.slice(0, 2).map((q, i) => (
                          <div key={i} className="border-l-2 border-slate-200 pl-3">
                            <p className="text-xs text-slate-700 italic leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">— {q.source}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Unmet Needs */}
      <div>
        <ReportSubheading title={t("report.pain.unmetNeeds")} count={data.unmetNeeds.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.unmetNeeds.map((u, i) => (
            <div key={i} className="py-3">
              <p className="text-sm font-semibold text-slate-900">{u.need}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                <span className="font-semibold">{t("report.pain.whyUnmet")}</span> {u.whyUnmet}
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                <span className="font-semibold">{t("report.pain.opportunity")}</span> {u.opportunity}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* User Personas */}
      <div>
        <ReportSubheading title={t("report.pain.userPersonas")} count={data.userPersonas.length} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.userPersonas.map((p, i) => (
            <article key={i} className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-slate-200 bg-slate-100 font-mono text-sm font-semibold text-slate-800" aria-hidden>
                  {p.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-xs text-slate-600">{p.role}</p>
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">{t("report.pain.goals")}</p>
                  <ul className="text-xs text-slate-700 space-y-0.5 mt-1">
                    {p.goals.map((g, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className="flex-shrink-0 font-mono text-emerald-700" aria-hidden>+</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">{t("report.pain.frustrations")}</p>
                  <ul className="text-xs text-slate-700 space-y-0.5 mt-1">
                    {p.frustrations.map((f, j) => (
                      <li key={j} className="flex items-start gap-1.5">
                        <span className="flex-shrink-0 font-mono text-rose-700" aria-hidden>&minus;</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}
