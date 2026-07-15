"use client";

import { getAdminStats } from "./admin-client";
import type { AdminTranslator } from "./admin-i18n";
import {
  EmptyState,
  RefreshButton,
  ResourceState,
  SectionIntro,
  formatDuration,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function OverviewPanel({
  t,
  onUnauthorized,
  onUpdated,
}: {
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const resource = useAdminResource(getAdminStats, {
    onUnauthorized,
    onUpdated,
    resourceKey: "overview",
  });
  const stats = resource.data;
  const activity = stats?.hourlyActivity;
  const activityMax = Math.max(1, ...(activity?.values ?? [0]));

  return (
    <section className="ops-view" aria-labelledby="overview-title">
      <SectionIntro
        eyebrow={t("overview.eyebrow")}
        titleId="overview-title"
        title={t("overview.title")}
        description={t("overview.description")}
        actions={
          <RefreshButton
            t={t}
            pending={resource.isRefreshing}
            disabled={resource.isRateLimited}
            onClick={() => void resource.refresh()}
          />
        }
      />
      <ResourceState
        error={resource.error}
        loading={resource.isLoading}
        retryAfterUntil={resource.retryAfterUntil}
        onRetry={() => void resource.refresh()}
        t={t}
      />

      {!resource.isLoading && stats ? (
        <>
          <div className="ops-metric-layout">
            <article className="ops-metric-primary">
              <p>{t("overview.total")}</p>
              <strong>{stats.research?.total ?? 0}</strong>
              <div>
                <span>{t("overview.today", { count: stats.research?.today ?? 0 })}</span>
                <span>{t("overview.week", { count: stats.research?.thisWeek ?? 0 })}</span>
              </div>
            </article>
            <div className="ops-metric-grid">
              <Metric
                label={t("overview.completed")}
                value={stats.research?.completed ?? 0}
                detail={t("overview.successRate", { rate: stats.research?.successRate ?? 0 })}
                tone="positive"
              />
              <Metric
                label={t("overview.failed")}
                value={stats.research?.failed ?? 0}
                detail={`${t("overview.running")}: ${stats.research?.running ?? 0}`}
                tone="danger"
              />
              <Metric
                label={t("overview.alerts")}
                value={stats.alerts?.active ?? 0}
                detail={t("overview.alertSplit", {
                  critical: stats.alerts?.critical ?? 0,
                  warning: stats.alerts?.warning ?? 0,
                })}
                tone="warning"
              />
              <Metric
                label={t("overview.shares")}
                value={stats.shares?.total ?? 0}
                detail={t("overview.views", {
                  active: stats.shares?.active ?? 0,
                  views: stats.shares?.totalViews ?? 0,
                })}
                tone="info"
              />
              <Metric
                label={t("overview.duration")}
                value={formatDuration(stats.research?.avgDurationMs ?? 0)}
                detail={t("overview.completedRuns")}
                tone="neutral"
              />
            </div>
          </div>

          <div className="ops-overview-lower">
            <section className="ops-data-panel" aria-labelledby="activity-title">
              <header className="ops-panel-heading">
                <div>
                  <p className="ops-panel-index">01</p>
                  <h2 id="activity-title">{t("overview.activity")}</h2>
                </div>
                <span>24H</span>
              </header>
              {activity?.values?.length ? (
                <figure className="ops-activity">
                  <figcaption className="sr-only">{t("overview.activityCaption")}</figcaption>
                  <div className="ops-activity-bars">
                    {activity.values.map((value, index) => {
                      const time = activity.labels[index] ?? String(index);
                      return (
                        <div className="ops-activity-bar" key={`${time}-${index}`}>
                          <meter
                            min={0}
                            max={activityMax}
                            value={value}
                            aria-label={t("overview.runsAt", { count: value, time })}
                            title={t("overview.runsAt", { count: value, time })}
                          />
                          {index % 4 === 0 ? <span>{time}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </figure>
              ) : (
                <EmptyState title={t("overview.empty")} />
              )}
            </section>

            <section className="ops-data-panel" aria-labelledby="keywords-title">
              <header className="ops-panel-heading">
                <div>
                  <p className="ops-panel-index">02</p>
                  <h2 id="keywords-title">{t("overview.keywords")}</h2>
                </div>
              </header>
              {stats.topKeywords?.length ? (
                <ol className="ops-keyword-list">
                  {stats.topKeywords.map((keyword, index) => (
                    <li key={keyword.keyword}>
                      <span className="ops-keyword-rank">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{keyword.keyword}</strong>
                      <span>{t("overview.keywordCount", { count: keyword.count })}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title={t("overview.empty")} />
              )}
            </section>
          </div>
        </>
      ) : null}

      {!resource.isLoading && !stats && !resource.error ? (
        <EmptyState title={t("overview.empty")} />
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "positive" | "danger" | "warning" | "info" | "neutral";
}) {
  return (
    <article className={`ops-metric ops-metric-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
