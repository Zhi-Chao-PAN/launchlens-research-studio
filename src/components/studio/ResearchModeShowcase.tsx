"use client";

import {
  RESEARCH_MODE_CONFIGS,
  type ResearchModeAvailability,
  type ResearchModeId,
} from "@/lib/research/research-modes";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ResearchModeAvailabilityBadge } from "./ResearchModeAvailabilityBadge";

interface ResearchModeShowcaseProps {
  value: ResearchModeId;
  onChange: (mode: ResearchModeId) => void;
  disabled: boolean;
  runtimeAvailability?: Partial<Record<ResearchModeId, ResearchModeAvailability>>;
  readiness?: Partial<Record<ResearchModeId, { ready: number; total: number }>>;
}

const DEEP_PROOF_KEYS = [
  "researchMode.deep.proof.retrieval",
  "researchMode.deep.proof.claimBinding",
  "researchMode.deep.proof.review",
  "researchMode.deep.proof.recovery",
] as const;

export function ResearchModeShowcase({
  value,
  onChange,
  disabled,
  runtimeAvailability,
  readiness,
}: ResearchModeShowcaseProps) {
  const { t } = useLocale();
  const deep = RESEARCH_MODE_CONFIGS.deep;
  const standard = RESEARCH_MODE_CONFIGS.standard;
  const deepSelected = value === "deep";
  const standardSelected = value === "standard";

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      <label
        data-selected={deepSelected}
        className={`group relative overflow-hidden rounded-xl border bg-slate-950 p-5 text-white transition-colors sm:p-6 lg:col-span-2 ${
          deepSelected
            ? "border-teal-300 ring-2 ring-teal-300/20"
            : "border-slate-800 hover:border-teal-500/70"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input
          type="radio"
          name="research-mode"
          value="deep"
          checked={deepSelected}
          onChange={() => onChange("deep")}
          className="sr-only"
          aria-label={t("researchMode.deep.label", deep.label)}
          aria-describedby="research-mode-deep-promise research-mode-deep-best-for"
        />
        <span className="absolute inset-x-0 top-0 h-1 bg-teal-400" aria-hidden />

        <span className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">
            {t("researchMode.recommended")}
          </span>
          <ResearchModeAvailabilityBadge
            availability={runtimeAvailability?.deep ?? deep.availability}
            inverted
          />
        </span>

        <span className="mt-5 block text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("researchMode.deep.label", deep.label)}
        </span>
        <span id="research-mode-deep-promise" className="mt-2 block max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
          {t("researchMode.deep.promise")}
        </span>

        <span className="mt-5 grid gap-2 sm:grid-cols-2">
          {DEEP_PROOF_KEYS.map((key, index) => (
            <span key={key} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="font-mono text-[10px] font-semibold text-teal-300" aria-hidden>
                0{index + 1}
              </span>
              <span className="text-xs font-medium leading-5 text-slate-100">{t(key)}</span>
            </span>
          ))}
        </span>

        <span className="mt-5 block border-t border-white/10 pt-4">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {t("researchMode.deep.flowTitle")}
          </span>
          <span className="mt-1.5 block text-xs leading-5 text-slate-200">
            {t("researchMode.deep.flow")}
          </span>
        </span>

        <span className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <span id="research-mode-deep-best-for" className="max-w-xl text-xs leading-5 text-slate-400">
            {t("researchMode.deep.bestFor")}
          </span>
          <span className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-semibold ${
            deepSelected ? "bg-teal-300 text-slate-950" : "bg-white/10 text-white group-hover:bg-white/15"
          }`}>
            {deepSelected ? t("researchMode.selected") : t("researchMode.select")}
          </span>
        </span>

        <span className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[11px] font-medium text-slate-300">
          <span>{t("researchMode.deep.duration", {
            min: deep.expectedDurationSec.min / 60,
            max: deep.expectedDurationSec.max / 60,
          })}</span>
          <span>{t("researchMode.validationPass.other", { count: deep.validationPasses })}</span>
          {readiness?.deep && <span>{t("researchMode.requirementsReady", readiness.deep)}</span>}
        </span>
      </label>

      <label
        data-selected={standardSelected}
        className={`group flex rounded-xl border bg-white p-5 transition-colors sm:p-6 ${
          standardSelected
            ? "border-teal-600 ring-2 ring-teal-100"
            : "border-slate-200 hover:border-slate-400"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input
          type="radio"
          name="research-mode"
          value="standard"
          checked={standardSelected}
          onChange={() => onChange("standard")}
          className="sr-only"
          aria-label={t("researchMode.standard.label", standard.label)}
          aria-describedby="research-mode-standard-promise research-mode-standard-best-for"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t("researchMode.standard.kicker")}
            </span>
            <ResearchModeAvailabilityBadge availability={runtimeAvailability?.standard ?? standard.availability} />
          </span>
          <span className="mt-5 block text-xl font-semibold tracking-tight text-slate-950">
            {t("researchMode.standard.label", standard.label)}
          </span>
          <span id="research-mode-standard-promise" className="mt-2 block text-sm leading-6 text-slate-600">
            {t("researchMode.standard.promise")}
          </span>
          <span className="mt-5 block space-y-2 border-y border-slate-100 py-4 text-xs text-slate-600">
            <span className="flex items-center justify-between gap-3">
              <span>{t("researchProtocol.analysts")}</span>
              <strong className="text-slate-900">5 + 1</strong>
            </span>
            <span className="flex items-center justify-between gap-3">
              <span>{t("researchProtocol.validation")}</span>
              <strong className="text-slate-900">
                {t("researchMode.validationPass.one", { count: standard.validationPasses })}
              </strong>
            </span>
            <span className="flex items-center justify-between gap-3">
              <span>{t("researchProtocol.execution")}</span>
              <strong className="text-slate-900">{t("researchMode.standard.duration", {
                min: standard.expectedDurationSec.min / 60,
                max: standard.expectedDurationSec.max / 60,
              })}</strong>
            </span>
          </span>
          <span id="research-mode-standard-best-for" className="mt-4 block text-xs leading-5 text-slate-500">
            {t("researchMode.standard.bestFor")}
          </span>
          <span className={`mt-auto inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-xs font-semibold ${
            standardSelected
              ? "bg-slate-950 text-white"
              : "border border-slate-200 bg-white text-slate-700 group-hover:bg-slate-50"
          }`}>
            {standardSelected ? t("researchMode.selected") : t("researchMode.select")}
          </span>
        </span>
      </label>
    </div>
  );
}
