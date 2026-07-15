"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
import {
  clearAdminAlerts,
  getAdminAlerts,
  isUnauthorized,
} from "./admin-client";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import {
  AdminIcon,
  EmptyState,
  RefreshButton,
  ResourceState,
  StatusBadge,
  formatAdminTime,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function SecurityAlerts({
  locale,
  t,
  onUnauthorized,
  onUpdated,
}: {
  locale: AdminLocale;
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const { showToast } = useToast();
  const { askConfirm, dialog } = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const resource = useAdminResource(getAdminAlerts, {
    onUnauthorized,
    onUpdated,
    resourceKey: "security-alerts",
  });

  function confirmClear() {
    askConfirm(
      t("alerts.clearTitle"),
      t("alerts.clearBody"),
      async () => {
        try {
          setActionError(null);
          await clearAdminAlerts();
          await resource.refresh();
          showToast(t("alerts.cleared"), "success");
        } catch (error) {
          if (isUnauthorized(error)) {
            onUnauthorized();
            return;
          }
          setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
        }
      },
      {
        confirmLabel: t("alerts.clear"),
        cancelLabel: t("common.cancel"),
        tone: "danger",
      },
    );
  }

  return (
    <section aria-labelledby="alerts-title">
      <header className="ops-table-heading ops-alert-heading">
        <div>
          <p className="ops-panel-index">03</p>
          <h2 id="alerts-title">{t("security.alerts")}</h2>
        </div>
        <div className="ops-section-button-row">
          <RefreshButton t={t} pending={resource.isRefreshing} disabled={resource.isRateLimited} onClick={() => void resource.refresh()} />
          <button className="ops-button ops-button-danger" type="button" onClick={confirmClear} disabled={!resource.data?.length}>
            {t("alerts.clear")}
          </button>
        </div>
      </header>
      {actionError ? <div className="ops-inline-state ops-inline-state-error" role="alert">{actionError}</div> : null}
      <ResourceState error={resource.error} loading={resource.isLoading} retryAfterUntil={resource.retryAfterUntil} onRetry={() => void resource.refresh()} t={t} />
      {!resource.isLoading && resource.data?.length ? (
        <div className="ops-alert-ledger">
          {resource.data.map((alert) => (
            <article key={alert.id} className={`ops-alert ops-alert-${alert.severity}`}>
              <div className="ops-alert-rail" aria-hidden="true" />
              <header>
                <StatusBadge tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info"}>
                  {alert.severity}
                </StatusBadge>
                <strong>{alert.type}</strong>
                <time dateTime={new Date(alert.ts).toISOString()}>{formatAdminTime(alert.ts, locale)}</time>
              </header>
              <p>{alert.message}</p>
              {alert.count > 1 ? (
                <span className="ops-alert-count">
                  <AdminIcon name="warning" />
                  {t("alerts.events", { count: alert.count })}
                </span>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {!resource.isLoading && resource.data?.length === 0 ? <EmptyState title={t("alerts.empty")} /> : null}
      {dialog}
    </section>
  );
}
