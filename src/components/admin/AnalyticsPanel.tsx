"use client";

import { useState } from "react";
import { getResearchFunnel, type ResearchFunnelModeSummary } from "./admin-client";
import type { AdminTranslator } from "./admin-i18n";
import {
  EmptyState,
  RefreshButton,
  ResourceState,
  SectionIntro,
  StatusBadge,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

const WINDOWS = [7, 30, 90] as const;

export function AnalyticsPanel({
  t,
  onUnauthorized,
  onUpdated,
}: {
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const [days, setDays] = useState<number>(30);
  const resource = useAdminResource(() => getResearchFunnel(days), {
    onUnauthorized,
    onUpdated,
    resourceKey: `funnel-${days}`,
  });
  const summary = resource.data;
  const steps = summary ? [
    { key: "viewed", label: t("analytics.viewed"), value: summary.viewed },
    { key: "deepSelected", label: t("analytics.deepSelected"), value: summary.deepSelected },
    { key: "queryFilled", label: t("analytics.queryFilled"), value: summary.queryFilled },
    { key: "started", label: t("analytics.started"), value: summary.started },
    { key: "completed", label: t("analytics.completed"), value: summary.completed },
    { key: "shared", label: t("analytics.shared"), value: summary.shared },
  ] : [];
  const maxStep = Math.max(1, ...steps.map((step) => step.value));

  return (
    <section className="ops-view" aria-labelledby="analytics-title">
      <SectionIntro
        eyebrow={t("analytics.eyebrow")}
        titleId="analytics-title"
        title={t("analytics.title")}
        description={t("analytics.description")}
        actions={
          <div className="ops-analytics-controls">
            <label className="ops-select-label" htmlFor="analytics-window">
              <span>{t("analytics.window")}</span>
              <select
                id="analytics-window"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {WINDOWS.map((value) => (
                  <option key={value} value={value}>{t("analytics.days", { days: value })}</option>
                ))}
              </select>
            </label>
            <RefreshButton
              t={t}
              pending={resource.isRefreshing}
              disabled={resource.isRateLimited}
              onClick={() => void resource.refresh()}
            />
          </div>
        }
      />
      <ResourceState
        error={resource.error}
        loading={resource.isLoading}
        retryAfterUntil={resource.retryAfterUntil}
        onRetry={() => void resource.refresh()}
        t={t}
      />

      {!resource.isLoading && summary ? (
        <>
          <div className="ops-analytics-status" role="status">
            <StatusBadge tone={summary.configured ? "positive" : "warning"}>
              {summary.configured ? t("analytics.configured") : t("analytics.notConfigured")}
            </StatusBadge>
            <p>{t("analytics.dataNote")}</p>
          </div>

          <section className="ops-data-panel ops-funnel-panel" aria-labelledby="funnel-steps-title">
            <header className="ops-panel-heading">
              <div>
                <p className="ops-panel-index">01</p>
                <h2 id="funnel-steps-title">{t("analytics.conversion")}</h2>
              </div>
              <span>{t("analytics.days", { days: summary.windowDays })}</span>
            </header>
            {steps.some((step) => step.value > 0) ? (
              <ol className="ops-funnel-steps" aria-label={t("analytics.conversion")}>
                {steps.map((step, index) => {
                  const previous = steps[index - 1]?.value ?? null;
                  const rateFromPrevious = previous && previous > 0
                    ? Math.round((step.value / previous) * 100)
                    : null;
                  return (
                    <li key={step.key} className="ops-funnel-step">
                      <div className="ops-funnel-step-head">
                        <span className="ops-funnel-step-index">0{index + 1}</span>
                        <strong>{step.label}</strong>
                        <b>{step.value}</b>
                      </div>
                      <div className="ops-funnel-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(4, (step.value / maxStep) * 100)}%` }} />
                      </div>
                      <span className="ops-funnel-step-rate">
                        {rateFromPrevious === null ? t("analytics.count", { count: step.value }) : t("analytics.rate", { rate: rateFromPrevious })}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title={t("analytics.noData")} />
            )}
          </section>

          <div className="ops-analytics-grid">
            <ModeCard t={t} mode="standard" summary={summary.modes.standard} />
            <ModeCard t={t} mode="deep" summary={summary.modes.deep} />
          </div>

          <section className="ops-data-panel ops-analytics-rates" aria-labelledby="analytics-rates-title">
            <header className="ops-panel-heading">
              <div>
                <p className="ops-panel-index">02</p>
                <h2 id="analytics-rates-title">{t("analytics.modeComparison")}</h2>
              </div>
            </header>
            <div className="ops-analytics-rate-grid">
              <RateMetric label={t("analytics.startRate")} value={summary.startRate} />
              <RateMetric label={t("analytics.completionRate")} value={summary.completionRate} />
              <RateMetric label={t("analytics.shareRate")} value={summary.shareRate} />
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function ModeCard({
  t,
  mode,
  summary,
}: {
  t: AdminTranslator;
  mode: "standard" | "deep";
  summary: ResearchFunnelModeSummary;
}) {
  const tone = mode === "deep" ? "info" : "neutral";
  return (
    <section className={`ops-data-panel ops-mode-card ops-mode-card-${mode}`} aria-labelledby={`analytics-${mode}-title`}>
      <header className="ops-panel-heading">
        <div>
          <p className="ops-panel-index">{mode === "deep" ? "04" : "03"}</p>
          <h2 id={`analytics-${mode}-title`}>{t(`analytics.${mode}`)}</h2>
        </div>
        <StatusBadge tone={tone}>{t("analytics.count", { count: summary.started })}</StatusBadge>
      </header>
      <dl className="ops-mode-metrics">
        <MetricRow label={t("analytics.queryFilled")} value={summary.queryFilled} />
        <MetricRow label={t("analytics.started")} value={summary.started} />
        <MetricRow label={t("analytics.completed")} value={summary.completed} />
        <MetricRow label={t("analytics.shared")} value={summary.shared} />
        <MetricRow label={t("analytics.completionRate")} value={formatRate(summary.completionRate)} />
        <MetricRow label={t("analytics.shareRate")} value={formatRate(summary.shareRate)} />
      </dl>
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function RateMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <article className="ops-analytics-rate">
      <p>{label}</p>
      <strong>{formatRate(value)}</strong>
    </article>
  );
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
