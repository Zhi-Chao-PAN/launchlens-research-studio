/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { ChannelScoutOutput } from "@/lib/schema/research-schema";
import { ReportSubheading, SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

const PRIORITY_STYLE = {
  high: { badge: "border-emerald-200 bg-emerald-50 text-emerald-800", bar: "bg-emerald-700" },
  medium: { badge: "border-amber-200 bg-amber-50 text-amber-900", bar: "bg-amber-700" },
  low: { badge: "border-slate-200 bg-slate-50 text-slate-700", bar: "bg-slate-500" },
} as const;

const VOLUME_STYLE = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

const REACH_RANK: Record<string, number> = { niche: 1, moderate: 3, broad: 5 };
const COST_RANK: Record<string, number> = { low: 5, medium: 3, high: 1 };

function effectivenessDot(effectiveness: string): string {
  if (effectiveness === "high") return "bg-emerald-700";
  if (effectiveness === "medium") return "bg-amber-700";
  if (effectiveness === "low") return "bg-rose-700";
  return "bg-slate-400";
}

export function ChannelScoutReport({ output }: { output: any }) {
  const data = output as ChannelScoutOutput;
  const { copied, copy } = useCopyText();
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("report.channel.title")}
        description={data.summary}
        count={data.channels.length}
        onCopy={() => copy(generateAgentMarkdown("channel-scout", data), "channel-scout")}
        copied={copied === "channel-scout"}
        copyLabel={t("report.channel.copySection")}
      />

      <section>
        <ReportSubheading title={t("report.channel.recommendedChannels")} count={data.recommendedChannels.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.recommendedChannels.map((recommendation: any, index: number) => {
            const priority = PRIORITY_STYLE[recommendation.priority as keyof typeof PRIORITY_STYLE] || PRIORITY_STYLE.medium;
            const widthPct = recommendation.priority === "high" ? 95 : recommendation.priority === "medium" ? 60 : 30;
            return (
              <article key={index} className="py-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{recommendation.channel}</p>
                  <span className={`border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${priority.badge}`}>
                    {recommendation.priority}
                  </span>
                </div>
                <p className="mb-2 text-xs leading-5 text-slate-600">{recommendation.why}</p>
                <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
                  <div className={`h-full rounded-sm ${priority.bar}`} style={{ width: `${widthPct}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <ReportSubheading title={t("report.channel.landscape")} count={data.channels.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.channels.map((channel, index) => (
            <article key={index} className="py-3">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex-shrink-0 border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700">
                    {channel.category}
                  </span>
                  <p className="truncate text-sm font-semibold text-slate-900">{channel.name}</p>
                </div>
                <div
                  className="flex flex-shrink-0 items-center gap-1.5"
                  title={`${t("report.channel.effectivenessPrefix")} ${channel.effectiveness}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${effectivenessDot(channel.effectiveness)}`} aria-hidden />
                  <span className="text-[10px] capitalize text-slate-600">{channel.effectiveness}</span>
                </div>
              </div>

              <p className="mb-1 text-xs leading-5 text-slate-600">{channel.audience}</p>
              <p className="mb-2 text-[10px] leading-4 text-slate-500">{channel.notes}</p>

              <div className="mt-2 grid grid-cols-2 gap-4 text-[10px]">
                <MetricBar
                  label={t("report.channel.reach")}
                  value={channel.reach}
                  percentage={((REACH_RANK[channel.reach] || 3) / 5) * 100}
                  color="bg-slate-700"
                />
                <MetricBar
                  label={t("report.channel.costEfficiency")}
                  value={channel.cost}
                  percentage={((COST_RANK[channel.cost] || 3) / 5) * 100}
                  color="bg-emerald-700"
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {data.communityHubs && data.communityHubs.length > 0 && (
        <section>
          <ReportSubheading title={t("report.channel.communityHubs")} count={data.communityHubs.length} />
          <div className="grid grid-cols-1 border-y border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-slate-200">
            {data.communityHubs.map((hub: any, index: number) => {
              const safeUrl = canonicalizeSafeExternalUrl(hub.url);
              return (
                <article
                  key={index}
                  className="border-b border-slate-200 p-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                    >
                      {hub.name}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-slate-900">{hub.name}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-600">{hub.platform} · {hub.size}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{hub.focus}</p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <ReportSubheading title={t("report.channel.contentTopics")} count={data.contentTopics.length} />
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {data.contentTopics.map((topic: any, index: number) => {
            const volumeClass = VOLUME_STYLE[topic.searchVolume as keyof typeof VOLUME_STYLE] || VOLUME_STYLE.medium;
            return (
              <div key={index} className="flex items-center gap-2 py-2.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-800">{topic.topic}</span>
                <span className={`border px-1.5 py-0.5 text-[10px] font-medium capitalize ${volumeClass}`}>
                  {topic.searchVolume}
                </span>
                <span className="w-20 text-right font-mono tabular-nums text-slate-600">
                  {topic.competition} {t("report.channel.competitionSuffix")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <CitationList citations={data.citations} />
    </div>
  );
}

function MetricBar({ label, value, percentage, color }: { label: string; value: string; percentage: number; color: string }) {
  return (
    <div>
      <p className="mb-0.5 text-slate-500">{label}</p>
      <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
        <div className={`h-full rounded-sm ${color}`} style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-0.5 capitalize text-slate-700">{value}</p>
    </div>
  );
}
