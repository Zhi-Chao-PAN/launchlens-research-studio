"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
import {
  deleteResearchRun,
  downloadAdminExport,
  getResearchRuns,
  isUnauthorized,
} from "./admin-client";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import {
  AdminIcon,
  EmptyState,
  RefreshButton,
  ResourceState,
  SectionIntro,
  StatusBadge,
  formatAdminTime,
  formatDuration,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function ResearchPanel({
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
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(
    () => getResearchRuns({ query, status, limit: 50 }),
    [query, status],
  );
  const resource = useAdminResource(load, {
    onUnauthorized,
    onUpdated,
    resourceKey: `${query}:${status}`,
  });

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchDraft.trim());
  }

  async function exportRuns(format: "json" | "csv") {
    try {
      setActionError(null);
      await downloadAdminExport(
        `/api/research/runs?format=${format}`,
        `launchlens-research-runs.${format}`,
      );
      showToast(t("research.exported", { format: format.toUpperCase() }), "success");
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
    }
  }

  function confirmDelete(id: string) {
    askConfirm(
      t("research.deleteTitle"),
      t("research.deleteBody"),
      async () => {
        try {
          setActionError(null);
          await deleteResearchRun(id);
          await resource.refresh();
          showToast(t("research.deleted"), "success");
        } catch (error) {
          if (isUnauthorized(error)) {
            onUnauthorized();
            return;
          }
          setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
        }
      },
      {
        confirmLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
        tone: "danger",
      },
    );
  }

  const runs = resource.data?.runs ?? [];

  return (
    <section className="ops-view" aria-labelledby="research-title">
      <SectionIntro
        eyebrow={t("research.eyebrow")}
        titleId="research-title"
        title={t("research.title")}
        description={t("research.description")}
        actions={
          <RefreshButton
            t={t}
            pending={resource.isRefreshing}
            disabled={resource.isRateLimited}
            onClick={() => void resource.refresh()}
          />
        }
      />

      <div className="ops-toolbar">
        <form className="ops-search" role="search" onSubmit={handleSearch}>
          <label htmlFor="research-search">{t("research.search")}</label>
          <div>
            <input
              id="research-search"
              name="research-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t("research.searchPlaceholder")}
              autoComplete="off"
            />
            <button type="submit" className="ops-button ops-button-secondary">
              {t("research.search")}
            </button>
          </div>
        </form>
        <div className="ops-field ops-status-filter">
          <label htmlFor="research-status">{t("research.status")}</label>
          <select
            id="research-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t("research.allStatuses")}</option>
            <option value="completed">{t("research.completed")}</option>
            <option value="failed">{t("research.failed")}</option>
            <option value="cancelled">{t("research.cancelled")}</option>
          </select>
        </div>
        <div className="ops-export-group" aria-label={t("research.actions")}>
          <button type="button" className="ops-button ops-button-quiet" onClick={() => void exportRuns("json")}>
            <AdminIcon name="download" />
            {t("research.exportJson")}
          </button>
          <button type="button" className="ops-button ops-button-quiet" onClick={() => void exportRuns("csv")}>
            <AdminIcon name="download" />
            {t("research.exportCsv")}
          </button>
        </div>
      </div>

      {actionError ? <div className="ops-inline-state ops-inline-state-error" role="alert">{actionError}</div> : null}
      <ResourceState
        error={resource.error}
        loading={resource.isLoading}
        retryAfterUntil={resource.retryAfterUntil}
        onRetry={() => void resource.refresh()}
        t={t}
      />

      {!resource.isLoading && resource.data ? (
        <section className="ops-table-panel" aria-labelledby="research-table-title">
          <header className="ops-table-heading">
            <div>
              <p className="ops-panel-index">01</p>
              <h2 id="research-table-title">{t("research.title")}</h2>
            </div>
            <span>{t("research.count", { visible: runs.length, total: resource.data.total })}</span>
          </header>
          {runs.length ? (
            <div className="ops-table-scroll">
              <table className="ops-table">
                <caption className="sr-only">{t("research.tableCaption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("research.query")}</th>
                    <th scope="col">{t("research.provider")}</th>
                    <th scope="col">{t("research.created")}</th>
                    <th scope="col">{t("research.duration")}</th>
                    <th scope="col">{t("research.sources")}</th>
                    <th scope="col">{t("research.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <th scope="row" className="ops-run-query">
                        <StatusBadge tone={runStatusTone(run.status)}>{runStatusLabel(run.status, t)}</StatusBadge>
                        <Link href={`/research/${encodeURIComponent(run.id)}`}>{run.query}</Link>
                        {run.keywords.length ? (
                          <span>{run.keywords.slice(0, 3).join(" · ")}</span>
                        ) : null}
                      </th>
                      <td>
                        <strong>{run.provider}</strong>
                        <span className="ops-cell-secondary">{run.model}</span>
                      </td>
                      <td>{formatAdminTime(run.createdAt, locale)}</td>
                      <td className="ops-tabular">{formatDuration(run.durationMs)}</td>
                      <td>
                        <StatusBadge tone={run.hasSources ? "positive" : "neutral"}>
                          {run.hasSources ? t("research.hasSources") : t("research.noSources")}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="ops-row-actions">
                          <Link className="ops-text-button" href={`/research/${encodeURIComponent(run.id)}`}>
                            {t("research.view")}
                          </Link>
                          <button className="ops-text-button ops-text-danger" type="button" onClick={() => confirmDelete(run.id)}>
                            {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={query || status ? t("research.noMatch") : t("research.empty")} />
          )}
        </section>
      ) : null}
      {dialog}
    </section>
  );
}

function runStatusTone(status: string): "positive" | "danger" | "warning" | "neutral" {
  if (status === "completed") return "positive";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "warning";
  return "neutral";
}

function runStatusLabel(status: string, t: AdminTranslator): string {
  if (status === "completed") return t("research.completed");
  if (status === "failed") return t("research.failed");
  if (status === "cancelled") return t("research.cancelled");
  return status;
}
