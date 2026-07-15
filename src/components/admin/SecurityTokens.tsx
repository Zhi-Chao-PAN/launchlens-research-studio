"use client";

import { useState, type FormEvent } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
import {
  createAdminToken,
  getAdminTokens,
  isUnauthorized,
  revokeAdminToken,
} from "./admin-client";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import {
  EmptyState,
  RefreshButton,
  ResourceState,
  StatusBadge,
  formatAdminTime,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function SecurityTokens({
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
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"admin" | "bypass">("bypass");
  const [ttlHours, setTtlHours] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const resource = useAdminResource(getAdminTokens, {
    onUnauthorized,
    onUpdated,
    resourceKey: "security-tokens",
  });

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setActionError(null);
    const hours = Number(ttlHours);
    const ttlMs = Number.isFinite(hours) && hours > 0
      ? Math.round(hours * 3_600_000)
      : undefined;
    try {
      const token = await createAdminToken({
        label: label.trim() || "unnamed",
        scope,
        ...(ttlMs ? { ttlMs } : {}),
      });
      setNewToken(token);
      setLabel("");
      setTtlHours("");
      await resource.refresh();
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
    } finally {
      setPending(false);
    }
  }

  function confirmRevoke(hash: string) {
    askConfirm(
      t("tokens.revokeTitle"),
      t("tokens.revokeBody"),
      async () => {
        try {
          await revokeAdminToken(hash);
          await resource.refresh();
          showToast(t("tokens.revoked"), "success");
        } catch (error) {
          if (isUnauthorized(error)) {
            onUnauthorized();
            return;
          }
          setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
        }
      },
      {
        confirmLabel: t("tokens.revoke"),
        cancelLabel: t("common.cancel"),
        tone: "danger",
      },
    );
  }

  return (
    <div className="ops-security-grid">
      <section className="ops-form-panel" aria-labelledby="create-token-title">
        <header className="ops-panel-heading">
          <div>
            <p className="ops-panel-index">01</p>
            <h2 id="create-token-title">{t("tokens.createTitle")}</h2>
          </div>
        </header>
        <form className="ops-stacked-form" onSubmit={handleCreate}>
          <label className="ops-field" htmlFor="token-label">
            <span>{t("tokens.label")}</span>
            <input
              id="token-label"
              name="token-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t("tokens.labelPlaceholder")}
              autoComplete="off"
              maxLength={80}
            />
          </label>
          <div className="ops-form-row">
            <label className="ops-field" htmlFor="token-scope">
              <span>{t("tokens.scope")}</span>
              <select id="token-scope" value={scope} onChange={(event) => setScope(event.target.value as "admin" | "bypass")}>
                <option value="bypass">bypass</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="ops-field" htmlFor="token-ttl">
              <span>{t("tokens.ttl")}</span>
              <input
                id="token-ttl"
                name="token-ttl"
                type="number"
                min={0}
                max={8760}
                step={1}
                value={ttlHours}
                onChange={(event) => setTtlHours(event.target.value)}
                placeholder={t("tokens.ttlPlaceholder")}
                inputMode="numeric"
              />
            </label>
          </div>
          {actionError ? <p className="ops-form-error" role="alert">{actionError}</p> : null}
          <button className="ops-button ops-button-primary" type="submit" disabled={pending}>
            {pending ? t("tokens.creating") : t("tokens.create")}
          </button>
        </form>
        {newToken ? (
          <div className="ops-token-reveal" role="status">
            <strong>{t("tokens.once")}</strong>
            <code>{newToken}</code>
            <button className="ops-text-button" type="button" onClick={() => setNewToken(null)}>
              {t("common.dismiss")}
            </button>
          </div>
        ) : null}
      </section>

      <section className="ops-table-panel" aria-labelledby="tokens-table-title">
        <header className="ops-table-heading">
          <div>
            <p className="ops-panel-index">02</p>
            <h2 id="tokens-table-title">{t("tokens.active")}</h2>
          </div>
          <RefreshButton t={t} pending={resource.isRefreshing} disabled={resource.isRateLimited} onClick={() => void resource.refresh()} />
        </header>
        <ResourceState error={resource.error} loading={resource.isLoading} retryAfterUntil={resource.retryAfterUntil} onRetry={() => void resource.refresh()} t={t} />
        {!resource.isLoading && resource.data?.length ? (
          <div className="ops-table-scroll">
            <table className="ops-table">
              <caption className="sr-only">{t("tokens.tableCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("tokens.label")}</th>
                  <th scope="col">{t("tokens.scope")}</th>
                  <th scope="col">{t("tokens.hash")}</th>
                  <th scope="col">{t("tokens.created")}</th>
                  <th scope="col">{t("tokens.expires")}</th>
                  <th scope="col">{t("tokens.lastUsed")}</th>
                  <th scope="col">{t("tokens.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((token) => (
                  <tr key={token.hash}>
                    <th scope="row">{token.label}</th>
                    <td><StatusBadge tone={token.scope === "admin" ? "warning" : "info"}>{token.scope}</StatusBadge></td>
                    <td><code>{token.hash.slice(0, 14)}…</code></td>
                    <td>{formatAdminTime(token.createdAt, locale)}</td>
                    <td>{token.expiresAt ? formatAdminTime(token.expiresAt, locale) : t("common.never")}</td>
                    <td>{token.lastUsedAt ? formatAdminTime(token.lastUsedAt, locale) : t("common.never")}</td>
                    <td>
                      <button className="ops-text-button ops-text-danger" type="button" onClick={() => confirmRevoke(token.hash)}>
                        {t("tokens.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!resource.isLoading && resource.data?.length === 0 ? <EmptyState title={t("tokens.empty")} /> : null}
      </section>
      {dialog}
    </div>
  );
}
