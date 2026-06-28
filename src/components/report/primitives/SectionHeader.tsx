"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: string;
  count?: number;
  onCopy?: () => void;
  copyLabel?: string;
  copied?: boolean;
  accent?: "indigo" | "rose" | "emerald" | "amber" | "sky" | "violet";
}

const ACCENT_BG: Record<NonNullable<SectionHeaderProps["accent"]>, string> = {
  indigo: "from-indigo-500 to-violet-500",
  rose: "from-rose-500 to-pink-500",
  emerald: "from-emerald-500 to-teal-500",
  amber: "from-amber-500 to-orange-500",
  sky: "from-sky-500 to-blue-500",
  violet: "from-violet-500 to-purple-500",
};

const ACCENT_SOFT: Record<NonNullable<SectionHeaderProps["accent"]>, string> = {
  indigo: "from-indigo-50 to-violet-50",
  rose: "from-rose-50 to-pink-50",
  emerald: "from-emerald-50 to-teal-50",
  amber: "from-amber-50 to-orange-50",
  sky: "from-sky-50 to-blue-50",
  violet: "from-violet-50 to-purple-50",
};

export function SectionHeader({
  title,
  description,
  icon,
  count,
  onCopy,
  copyLabel,
  copied = false,
  accent = "indigo",
}: SectionHeaderProps) {
  const { t } = useLocale();
  // Default copy label from the i18n dictionary; callers can still override
  // with a section-specific key by passing `copyLabel` directly. We pick
  // the common "Copy section" so the report copy buttons localize by
  // default without every section having to thread a t() call in.
  const resolvedCopyLabel = copyLabel ?? t("report.common.copySection");
  return (
    <div className={`bg-gradient-to-r ${ACCENT_SOFT[accent]} rounded-xl p-5 relative`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon && (
            <span
              className={`flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${ACCENT_BG[accent]} flex items-center justify-center text-xl text-white shadow-sm`}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              <span>{title}</span>
              {typeof count === "number" && (
                <span className="text-[10px] font-mono uppercase tracking-wide text-slate-500 bg-white/70 px-2 py-0.5 rounded-full">
                  {count} {count === 1 ? t("report.common.item") : t("report.common.items")}
                </span>
              )}
            </h3>
            {description && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{description}</p>}
          </div>
        </div>
        {onCopy && (
          <button
            onClick={onCopy}
            className="flex-shrink-0 text-[10px] font-medium text-slate-600 hover:text-slate-800 bg-white/70 hover:bg-white px-2 py-1 rounded transition-colors flex items-center gap-1"
            title={resolvedCopyLabel}
          >
            <span aria-hidden>{copied ? "✅" : "📋"}</span>
            <span className="hidden sm:inline">{copied ? t("report.common.copied") : resolvedCopyLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
