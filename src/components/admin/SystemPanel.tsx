"use client";

import { getSystemStatus } from "./admin-client";
import type { AdminTranslator } from "./admin-i18n";
import {
  AdminIcon,
  EmptyState,
  RefreshButton,
  ResourceState,
  SectionIntro,
  StatusBadge,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function SystemPanel({
  t,
  onUnauthorized,
  onUpdated,
}: {
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const resource = useAdminResource(getSystemStatus, {
    onUnauthorized,
    onUpdated,
    resourceKey: "system",
  });
  const data = resource.data;

  return (
    <section className="ops-view" aria-labelledby="system-title">
      <SectionIntro
        eyebrow={t("system.eyebrow")}
        titleId="system-title"
        title={t("system.title")}
        description={t("system.description")}
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

      {!resource.isLoading && data ? (
        <div className="ops-system-layout">
          <SystemBlock index="01" title={t("system.webhook")}>
            <DescriptionList
              rows={[
                [t("system.pending"), data.webhook?.pending ?? "—"],
                [t("system.maxRetries"), data.webhook?.maxRetries ?? "—"],
                [t("system.retryDelay"), data.webhook ? `${data.webhook.initialDelayMs}ms` : "—"],
                [t("system.queueSize"), data.webhook?.maxQueueSize ?? "—"],
              ]}
            />
          </SystemBlock>

          <SystemBlock index="02" title={t("system.rateLimit")}>
            <DescriptionList
              rows={[
                [t("system.capacity"), data.telemetry.rateLimit.capacity],
                [t("system.window"), `${Math.round(data.telemetry.rateLimit.refillIntervalMs / 1000)}s`],
              ]}
            />
          </SystemBlock>

          <SystemBlock index="03" title={t("system.telemetry")}>
            <DescriptionList
              rows={[
                [t("system.requests"), data.telemetry.summary.total],
                [t("system.success"), `${Math.round(data.telemetry.summary.successRate * 100)}%`],
                [t("system.avg"), `${Math.round(data.telemetry.summary.averageMs)}ms`],
              ]}
            />
          </SystemBlock>

          <SystemBlock index="04" title={t("system.breakers")}>
            {Object.keys(data.telemetry.breakers).length ? (
              <ul className="ops-breaker-list">
                {Object.entries(data.telemetry.breakers).map(([name, breaker]) => (
                  <li key={name}>
                    <code>{name}</code>
                    <span>{t("system.breakerFailures", { count: breaker.failures })}</span>
                    <StatusBadge tone={breaker.open ? "danger" : "positive"}>
                      {breaker.open ? t("system.breakerOpen") : t("system.breakerClosed")}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t("system.noBreakers")} />
            )}
          </SystemBlock>

          <SystemBlock index="05" title={t("system.storage")} className="ops-system-wide">
            <DescriptionList
              rows={[
                [
                  t("system.persistence"),
                  data.telemetry.storage.enabled ? t("system.enabled") : t("system.memoryOnly"),
                ],
                [
                  t("system.memoryRuns"),
                  `${data.telemetry.storage.inMemoryCount} / ${data.telemetry.storage.maxMemoryRuns}`,
                ],
                [t("system.totalRuns"), data.telemetry.dashboard.totalRuns],
                [t("system.thisWeek"), data.telemetry.dashboard.recentRuns],
              ]}
            />
            <div className="ops-status-breakdown" aria-label={t("system.statusBreakdown")}>
              <StatusBadge tone="positive">
                {t("research.completed")}: {data.telemetry.dashboard.byStatus.completed}
              </StatusBadge>
              <StatusBadge tone="danger">
                {t("research.failed")}: {data.telemetry.dashboard.byStatus.failed}
              </StatusBadge>
              <StatusBadge tone="warning">
                {t("research.cancelled")}: {data.telemetry.dashboard.byStatus.cancelled}
              </StatusBadge>
            </div>
          </SystemBlock>

          <aside className="ops-system-note ops-system-wide">
            <AdminIcon name="security" />
            <div>
              <h2>{t("system.trustedIps")}</h2>
              <p>{t("system.trustedIpsBody")}</p>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function SystemBlock({
  index,
  title,
  className = "",
  children,
}: {
  index: string;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`ops-system-block ${className}`}>
      <header className="ops-panel-heading">
        <div>
          <p className="ops-panel-index">{index}</p>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function DescriptionList({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <dl className="ops-description-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
