"use client";

import type { ConfidenceLevel } from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const VALID: ConfidenceLevel[] = ["low", "medium", "high"];

const config: Record<ConfidenceLevel, { emoji: string; bg: string; text: string; ring: string }> = {
  high: { emoji: "🟢", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  medium: { emoji: "🟡", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  low: { emoji: "🔴", bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
};

export function ConfidenceBadge({ level, withLabel = false, size = "sm" }: { level: ConfidenceLevel | string | undefined; withLabel?: boolean; size?: "xs" | "sm" | "md" }) {
  // R210 defense: provider normalization covers this in the happy path, but
  // older cached sessions, mocks, or future schema drift could feed us an
  // undefined/invalid level. Fall back to "low" instead of throwing
  // `config[undefined].bg` and white-screening the report tab.
  const { t } = useLocale();
  const safe: ConfidenceLevel = VALID.includes(level as ConfidenceLevel) ? (level as ConfidenceLevel) : "low";
  const c = config[safe];
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  const label = t(`report.confidence.${safe}`);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${c.bg} ${c.text} ${c.ring} ${sizeClass}`}
      title={label}
    >
      <span aria-hidden>{c.emoji}</span>
      {withLabel ? <span>{label}</span> : <span className="capitalize">{safe}</span>}
    </span>
  );
}
