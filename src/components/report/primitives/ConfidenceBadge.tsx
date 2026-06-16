"use client";

import type { ConfidenceLevel } from "@/lib/schema/research-schema";

const config: Record<ConfidenceLevel, { label: string; emoji: string; bg: string; text: string; ring: string }> = {
  high: { label: "High confidence", emoji: "🟢", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
  medium: { label: "Medium confidence", emoji: "🟡", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" },
  low: { label: "Low confidence", emoji: "🔴", bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" },
};

export function ConfidenceBadge({ level, withLabel = false, size = "sm" }: { level: ConfidenceLevel; withLabel?: boolean; size?: "xs" | "sm" | "md" }) {
  const c = config[level];
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : size === "md" ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${c.bg} ${c.text} ${c.ring} ${sizeClass}`}
      title={c.label}
    >
      <span aria-hidden>{c.emoji}</span>
      {withLabel ? <span>{c.label}</span> : <span className="capitalize">{level}</span>}
    </span>
  );
}
