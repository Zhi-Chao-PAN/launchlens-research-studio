"use client";

import type { ConfidenceLevel } from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const VALID: ConfidenceLevel[] = ["low", "medium", "high"];

const config: Record<ConfidenceLevel, { bg: string; text: string; border: string; dot: string }> = {
  high: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-600" },
  medium: { bg: "bg-amber-50", text: "text-amber-900", border: "border-amber-200", dot: "bg-amber-600" },
  low: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", dot: "bg-rose-600" },
};

export function ConfidenceBadge({ level, withLabel = false, size = "sm" }: { level: ConfidenceLevel | string | undefined; withLabel?: boolean; size?: "xs" | "sm" | "md" }) {
  // R210 defense: provider normalization covers this in the happy path, but
  // older cached sessions, mocks, or future schema drift could feed us an
  // undefined/invalid level. Fall back to "low" instead of throwing
  // `config[undefined].bg` and white-screening the report tab.
  const { t } = useLocale();
  const safe: ConfidenceLevel = VALID.includes(level as ConfidenceLevel) ? (level as ConfidenceLevel) : "low";
  const c = config[safe];
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-sm px-2.5 py-1" : "text-xs px-2 py-0.5";
  const localizedLabel = t(`report.confidence.${safe}`);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border font-medium ${c.bg} ${c.text} ${c.border} ${sizeClass}`}
      title={localizedLabel}
    >
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${c.dot}`} aria-hidden />
      <span className={withLabel ? undefined : "capitalize"}>{withLabel ? localizedLabel : safe}</span>
    </span>
  );
}
