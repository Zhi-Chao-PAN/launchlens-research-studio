"use client";

import { type ReactNode } from "react";

/**
 * R223: reusable actionable error / empty-state banner.
 *
 * The previous error surfaces were bare text divs ("error-banner") or a
 * rose banner whose only action was "Dismiss" — no recovery path. This
 * component gives every error / not-found / failed-run state a consistent
 * layout: an icon, a title, an optional detail line, and up to two
 * actions (primary + secondary) so the user always has a next step.
 *
 * Variant controls the accent color:
 *  - "error"    rose  (failures, exceptions)
 *  - "warning"  amber (degraded runs, partial data)
 *  - "info"     sky   (not-found, expired session)
 *
 * The component is presentational only; callers pass translated strings
 * and onAction callbacks so it stays locale-aware.
 */
export interface ActionableErrorAction {
  label: string;
  onClick: () => void;
  /** "primary" renders a filled button; "secondary" an outline. Default primary. */
  variant?: "primary" | "secondary";
}

export interface ActionableErrorProps {
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
  actions?: ActionableErrorAction[];
  variant?: "error" | "warning" | "info";
  /** Optional extra className for the outer container. */
  className?: string;
  role?: "alert" | "status";
}

const VARIANT_STYLES: Record<NonNullable<ActionableErrorProps["variant"]>, { wrap: string; icon: string; title: string; detail: string }> = {
  error: {
    wrap: "bg-rose-50 border-rose-200",
    icon: "text-rose-500",
    title: "text-rose-800",
    detail: "text-rose-600",
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200",
    icon: "text-amber-500",
    title: "text-amber-800",
    detail: "text-amber-700",
  },
  info: {
    wrap: "bg-sky-50 border-sky-200",
    icon: "text-sky-500",
    title: "text-sky-800",
    detail: "text-sky-700",
  },
};

export function ActionableError({
  icon,
  title,
  detail,
  actions = [],
  variant = "error",
  className = "",
  role = "alert",
}: ActionableErrorProps) {
  const s = VARIANT_STYLES[variant];
  const defaultIcon = variant === "info" ? "ℹ️" : variant === "warning" ? "⚠️" : "⚠️";

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      className={`rounded-xl border p-4 flex items-start gap-3 ${s.wrap} ${className}`}
    >
      <span className={`text-xl flex-shrink-0 ${s.icon}`} aria-hidden>
        {icon ?? defaultIcon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${s.title}`}>{title}</p>
        {detail ? (
          <div className={`text-xs mt-0.5 break-words ${s.detail}`}>{detail}</div>
        ) : null}
        {actions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a, i) => {
              const isPrimary = (a.variant ?? "primary") === "primary";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={a.onClick}
                  className={
                    "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors " +
                    (isPrimary
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : "border border-slate-300 hover:bg-white text-slate-700")
                  }
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
