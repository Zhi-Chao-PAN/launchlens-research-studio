"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/toast/ToastContext";
import {
  downloadAdminExport,
  getAuditEvents,
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

const auditTypes = [
  "auth_failed",
  "auth_success",
  "token_created",
  "token_revoked",
  "rate_limited",
  "csrf_failed",
  "admin_action",
] as const;

export function SecurityAudit({
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
  const [typeFilter, setTypeFilter] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(() => getAuditEvents(typeFilter), [typeFilter]);
  const resource = useAdminResource(load, {
    onUnauthorized,
    onUpdated,
    resourceKey: `security-audit:${typeFilter}`,
  });

  async function exportAudit(format: "csv" | "jsonl") {
    try {
      setActionError(null);
      const params = new URLSearchParams({ format });
      if (typeFilter) params.set("type", typeFilter);
      await downloadAdminExport(
        `/api/admin/audit?${params.toString()}`,
        `launchlens-audit.${format}`,
      );
      showToast(t("audit.exported", { format: format.toUpperCase() }), "success");
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
    }
  }

  return (
    <section className="ops-table-panel" aria-labelledby="audit-title">
      <header className="ops-table-heading ops-table-heading-wrap">
        <div>
          <p className="ops-panel-index">01</p>
          <h2 id="audit-title">{t("security.audit")}</h2>
        </div>
        <div className="ops-audit-controls">
          <label className="ops-field" htmlFor="audit-filter">
            <span>{t("audit.filter")}</span>
            <select id="audit-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">{t("audit.allTypes")}</option>
              {auditTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <button type="button" className="ops-button ops-button-quiet" onClick={() => void exportAudit("csv")}>
            <AdminIcon name="download" />
            {t("audit.exportCsv")}
          </button>
          <button type="button" className="ops-button ops-button-quiet" onClick={() => void exportAudit("jsonl")}>
            <AdminIcon name="download" />
            {t("audit.exportJsonl")}
          </button>
          <RefreshButton t={t} pending={resource.isRefreshing} disabled={resource.isRateLimited} onClick={() => void resource.refresh()} />
        </div>
      </header>
      {actionError ? <div className="ops-inline-state ops-inline-state-error" role="alert">{actionError}</div> : null}
      <ResourceState error={resource.error} loading={resource.isLoading} retryAfterUntil={resource.retryAfterUntil} onRetry={() => void resource.refresh()} t={t} />
      {!resource.isLoading && resource.data?.length ? (
        <div className="ops-table-scroll">
          <table className="ops-table">
            <caption className="sr-only">{t("audit.tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("audit.id")}</th>
                <th scope="col">{t("audit.type")}</th>
                <th scope="col">{t("audit.time")}</th>
                <th scope="col">{t("audit.ip")}</th>
                <th scope="col">{t("audit.token")}</th>
                <th scope="col">{t("audit.scope")}</th>
                <th scope="col">{t("audit.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.map((event) => (
                <tr key={event.id}>
                  <td className="ops-tabular">#{event.id}</td>
                  <th scope="row">
                    <StatusBadge tone={auditTone(event.type)}>{event.type}</StatusBadge>
                  </th>
                  <td>{formatAdminTime(event.timestamp, locale)}</td>
                  <td><code>{event.ipHash ? `${event.ipHash.slice(0, 12)}…` : "—"}</code></td>
                  <td><code>{event.tokenHash ? `${event.tokenHash.slice(0, 12)}…` : "—"}</code></td>
                  <td>{event.scope ?? "—"}</td>
                  <td className="ops-audit-detail">{event.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!resource.isLoading && resource.data?.length === 0 ? <EmptyState title={t("audit.empty")} /> : null}
    </section>
  );
}

function auditTone(type: string): "positive" | "danger" | "warning" | "neutral" | "info" {
  if (type === "auth_success" || type === "token_created") return "positive";
  if (type === "auth_failed" || type === "csrf_failed") return "danger";
  if (type === "rate_limited" || type === "token_revoked") return "warning";
  if (type === "admin_action") return "info";
  return "neutral";
}
