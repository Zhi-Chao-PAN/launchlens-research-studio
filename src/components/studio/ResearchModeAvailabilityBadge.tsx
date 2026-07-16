"use client";

import type { ResearchModeAvailability } from "@/lib/research/research-modes";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function ResearchModeAvailabilityBadge({
  availability,
  inverted = false,
}: {
  availability: ResearchModeAvailability;
  inverted?: boolean;
}) {
  const { t } = useLocale();
  const ready = availability === "available";
  const tone = inverted
    ? ready
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : "border-amber-300/30 bg-amber-300/10 text-amber-200"
    : ready
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`}
        aria-hidden
      />
      {t(`researchMode.availability.${ready ? "ready" : "preview"}`)}
    </span>
  );
}
