"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

interface SectionHeaderProps {
  title: string;
  description?: string;
  count?: number;
  onCopy?: () => void;
  copyLabel?: string;
  copied?: boolean;
}

export function SectionHeader({
  title,
  description,
  count,
  onCopy,
  copyLabel,
  copied = false,
}: SectionHeaderProps) {
  const { t } = useLocale();
  const resolvedCopyLabel = copyLabel ?? t("report.common.copySection");

  return (
    <header className="border border-t-2 border-slate-200 border-t-[rgb(var(--foreground))] bg-white px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold tracking-tight text-slate-950">{title}</h2>
            {typeof count === "number" && (
              <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-slate-500">
                {count} {count === 1 ? t("report.common.item") : t("report.common.items")}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
          )}
        </div>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="min-h-9 flex-shrink-0 border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
            title={resolvedCopyLabel}
            aria-label={copied ? t("report.common.copied") : resolvedCopyLabel}
          >
            {copied ? t("report.common.copied") : resolvedCopyLabel}
          </button>
        )}
      </div>
    </header>
  );
}

export function ReportSubheading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-slate-200 pb-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">{title}</h3>
      {typeof count === "number" && (
        <span className="font-mono text-[10px] tabular-nums text-slate-500">{count}</span>
      )}
    </div>
  );
}
