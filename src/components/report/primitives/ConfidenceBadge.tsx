"use client";

import type { ConfidenceLevel } from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const visual: Record<ConfidenceLevel, { emoji: string; bg: string; text: string; ring: string }> = {
  high: { emoji: "🟢", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  medium: { emoji: "🟡", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  low: { emoji: "🔴", bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
};

const LABEL_KEYS: Record<ConfidenceLevel, string> = {
  high: "confidence.high",
  medium: "confidence.medium",
  low: "confidence.low",
};

const DEFAULT_LABELS: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ConfidenceBadge({
  level,
  withLabel = false,
  size = "sm",
}: {
  level: ConfidenceLevel;
  withLabel?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const { t } = useLocale();
  const v = visual[level];
  const label = t(LABEL_KEYS[level], DEFAULT_LABELS[level]);
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${v.bg} ${v.text} ${v.ring} ${sizeClass}`}
      title={label}
    >
      <span aria-hidden>{v.emoji}</span>
      {withLabel ? <span>{label}</span> : <span className="capitalize">{level}</span>}
    </span>
  );
}
