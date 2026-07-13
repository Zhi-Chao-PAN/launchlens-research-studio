"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { AGENT_METADATA, type AgentId } from "@/lib/schema/research-schema";

interface WorkspaceStats {
  totalRuns: number;
  starredCount: number;
  thisWeekRuns: number;
  totalDurationMin: number;
  templates: number;
}

export function WorkspaceStatsStrip({ stats }: { stats: WorkspaceStats | null }) {
  const { t } = useLocale();
  const items = [
    { label: t("workspace.stats.allRuns"), value: stats?.totalRuns ?? "—" },
    { label: t("workspace.stats.thisWeek"), value: stats?.thisWeekRuns ?? "—" },
    { label: t("workspace.stats.starred"), value: stats?.starredCount ?? "—" },
    { label: t("workspace.stats.templates"), value: stats?.templates ?? "—" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="workspace-activity-title">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("workspace.stats.eyebrow")}</p>
        <h2 id="workspace-activity-title" className="mt-1 text-sm font-semibold text-slate-900">{t("workspace.stats.title")}</h2>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.label} className="px-4 py-3">
            <dt className="text-[11px] text-slate-500">{item.label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ResearchTeamRoster({ agentIds }: { agentIds: AgentId[] }) {
  const { t } = useLocale();

  return (
    <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="research-team-title">
      <div className="flex items-end justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("workspace.team.eyebrow")}</p>
          <h2 id="research-team-title" className="mt-1 text-sm font-semibold text-slate-900">{t("workspace.team.title")}</h2>
        </div>
        <span className="hidden text-xs text-slate-600 sm:block">{t("workspace.team.process")}</span>
      </div>
      <ol className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {agentIds.map((id, index) => {
          const meta = AGENT_METADATA[id];
          return (
            <li key={id} className="flex gap-3 px-4 py-4 sm:px-5">
              <span className="font-mono text-[11px] font-semibold text-slate-600">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">
                  {t(("agent." + id + ".name") as never, meta.name)}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t(("agent." + id + ".description") as never, meta.description)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
