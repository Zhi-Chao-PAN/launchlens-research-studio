"use client";

import type { ReactNode } from "react";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import { getRetrySeconds } from "./use-admin-resource";

export type AdminIconName =
  | "overview"
  | "research"
  | "providers"
  | "security"
  | "system"
  | "refresh"
  | "external"
  | "logout"
  | "menu"
  | "close"
  | "arrow"
  | "download"
  | "key"
  | "check"
  | "warning";

export function AdminIcon({ name }: { name: AdminIconName }) {
  const paths: Record<AdminIconName, ReactNode> = {
    overview: (
      <>
        <path d="M4 4h6v6H4zM14 4h6v3h-6zM14 11h6v9h-6zM4 14h6v6H4z" />
      </>
    ),
    research: (
      <>
        <path d="M5 3h10l4 4v14H5z" />
        <path d="M14 3v5h5M8 12h8M8 16h6" />
      </>
    ),
    providers: (
      <>
        <path d="M7 8a5 5 0 1 1 9.2 2.7L21 15.5 17.5 19 16 17.5 14.5 19 12 16.5l1.3-1.3" />
        <circle cx="7" cy="8" r="1" />
      </>
    ),
    security: (
      <>
        <path d="M12 3 20 6v5c0 5.2-3.3 8.4-8 10-4.7-1.6-8-4.8-8-10V6z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
    system: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    external: <path d="M14 4h6v6M20 4l-9 9M19 13v7H4V5h7" />,
    logout: <path d="M10 5H4v14h6M14 8l4 4-4 4M8 12h10" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M5 20h14" />,
    key: (
      <>
        <circle cx="8" cy="12" r="4" />
        <path d="M12 12h9M17 12v3M20 12v2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: <path d="M12 3 2.8 20h18.4zM12 9v4M12 17h.01" />,
  };
  return (
    <svg
      className="ops-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function SectionIntro({
  eyebrow,
  titleId,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  titleId?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="ops-section-intro">
      <div>
        <p className="ops-eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        <p className="ops-section-description">{description}</p>
      </div>
      {actions ? <div className="ops-section-actions">{actions}</div> : null}
    </header>
  );
}

export function RefreshButton({
  onClick,
  pending,
  disabled = false,
  t,
}: {
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  t: AdminTranslator;
}) {
  return (
    <button
      className="ops-button ops-button-secondary"
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
    >
      <AdminIcon name="refresh" />
      {pending ? t("common.refreshing") : t("common.refresh")}
    </button>
  );
}

export function ResourceState({
  error,
  loading,
  retryAfterUntil = null,
  onRetry,
  t,
}: {
  error: Error | null;
  loading: boolean;
  retryAfterUntil?: number | null;
  onRetry: () => void;
  t: AdminTranslator;
}) {
  if (loading) {
    return (
      <div className="ops-skeleton" aria-busy="true" aria-label={t("common.loading")}>
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (!error) return null;
  const retrySeconds = getRetrySeconds(error, retryAfterUntil);
  const waitingForRetry = retrySeconds !== null;
  return (
    <div className="ops-inline-state ops-inline-state-error" role="alert">
      <AdminIcon name="warning" />
      <div>
        <strong>
          {retrySeconds !== null
            ? t("common.rateLimited", { seconds: retrySeconds })
            : t("common.loadFailed")}
        </strong>
        {!waitingForRetry ? <p>{error.message}</p> : null}
      </div>
      <button
        className="ops-text-button"
        type="button"
        onClick={onRetry}
        disabled={waitingForRetry}
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "neutral" | "positive" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return <span className={`ops-status ops-status-${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="ops-empty" role="status">
      <span className="ops-empty-mark" aria-hidden="true" />
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function formatAdminTime(
  value: number | string | null | undefined,
  locale: AdminLocale,
): string {
  if (value === null || value === undefined) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
