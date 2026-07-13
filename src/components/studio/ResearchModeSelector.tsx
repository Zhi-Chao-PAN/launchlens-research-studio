"use client";

import {
  RESEARCH_MODE_CONFIGS,
  type ResearchModeAvailability,
  type ResearchModeId,
} from "@/lib/research/research-modes";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface ResearchModeSelectorProps {
  value: ResearchModeId;
  onChange: (mode: ResearchModeId) => void;
  disabled?: boolean;
  compact?: boolean;
  runtimeAvailability?: Partial<Record<ResearchModeId, ResearchModeAvailability>>;
  readiness?: Partial<Record<ResearchModeId, { ready: number; total: number }>>;
}

const MODE_ORDER: ResearchModeId[] = ["standard", "deep"];

export function ResearchModeSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  runtimeAvailability,
  readiness,
}: ResearchModeSelectorProps) {
  const { t } = useLocale();
  const selected = RESEARCH_MODE_CONFIGS[value];
  const selectedKey = `researchMode.${value}`;

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {t("researchMode.legend")}
      </legend>
      <div className={`mt-2 grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {MODE_ORDER.map((modeId) => {
          const config = RESEARCH_MODE_CONFIGS[modeId];
          const availability = runtimeAvailability?.[modeId] ?? config.availability;
          const modeReadiness = readiness?.[modeId];
          const isSelected = modeId === value;
          const modeKey = `researchMode.${modeId}`;
          const duration = t(`${modeKey}.duration`, {
            min: config.expectedDurationSec.min / 60,
            max: config.expectedDurationSec.max / 60,
          });
          const validationPasses = t(
            `researchMode.validationPass.${config.validationPasses === 1 ? "one" : "other"}`,
            { count: config.validationPasses },
          );
          return (
            <label
              key={modeId}
              className={`relative block cursor-pointer rounded-lg border px-3.5 py-3 transition-colors ${
                isSelected
                  ? "border-slate-900 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={compact ? "research-mode-compact" : "research-mode"}
                value={modeId}
                checked={isSelected}
                onChange={() => onChange(modeId)}
                className="sr-only"
                aria-describedby={`research-mode-${modeId}-details`}
              />
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{t(`${modeKey}.label`, config.label)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isSelected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {t(`researchMode.availability.${availability === "available" ? "ready" : "preview"}`)}
                </span>
              </span>
              <span
                id={`research-mode-${modeId}-details`}
                className={`mt-1.5 block text-xs leading-5 ${isSelected ? "text-slate-300" : "text-slate-500"}`}
              >
                {duration} · {validationPasses}
                {modeReadiness
                  ? ` · ${t("researchMode.requirementsReady", {
                      ready: modeReadiness.ready,
                      total: modeReadiness.total,
                    })}`
                  : ""}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        <span className="font-medium text-slate-700">{t(`${selectedKey}.depthLabel`, selected.depthLabel)}:</span>{" "}
        {t(`${selectedKey}.description`, selected.description)}
      </p>
    </fieldset>
  );
}
