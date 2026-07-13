"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { ReportView } from "@/components/report/ReportView";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  normalizeResearchMode,
  type ResearchModeId,
} from "@/lib/research/research-modes";
import type { ResearchDossier, ResearchDossierAgent } from "@/lib/research/storage";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import {
  parseSynthesis,
  type SynthesisOutput as DetailSynthesisOutput,
} from "@/lib/research/synthesis-parser";
import {
  AGENT_METADATA,
  agentIdsByOrder,
  type AgentId,
  type AgentOutput,
} from "@/lib/schema/research-schema";
import { ResearchProtocolPanel } from "./ResearchProtocolPanel";

const AGENT_ORDER = agentIdsByOrder();
const TOTAL_AGENT_COUNT = AGENT_ORDER.length;

type HistoricalRunStatus = "completed" | "failed" | "cancelled";

export interface HistoricalDossierPanelProps {
  dossier?: ResearchDossier | null;
  mode?: ResearchModeId;
  status?: HistoricalRunStatus;
  fallbackProvider?: string;
}

function projectDossierSynthesis(output: AgentOutput | undefined): DetailSynthesisOutput | null {
  if (!output || output.agent !== "synthesis") return null;

  return {
    agent: output.agent,
    execSummary: output.execSummary,
    opportunityScore: output.opportunityScore,
    riskScore: output.riskScore,
    keyInsights: output.keyInsights.map((insight) => ({
      insight: insight.insight,
      supportingAgents: [...insight.supportingAgents],
      confidence: insight.confidence,
    })),
    topThreeOpportunities: output.topThreeOpportunities.map((opportunity) => ({ ...opportunity })),
    topThreeRisks: output.topThreeRisks.map((risk) => ({ ...risk })),
    recommendedNextStep: output.recommendedNextStep,
    launchlensBrief: output.launchlensBrief,
    citations: output.citations.flatMap((citation) => {
      const url = canonicalizeSafeExternalUrl(citation.url);
      return url
        ? [{ title: citation.title, url, snippet: citation.snippet }]
        : [];
    }),
  };
}

/**
 * New runs persist the synthesis inside the full dossier. Historical records
 * written before that contract still keep a serialized `result`, so the
 * detail page must retain that fallback without letting it shadow newer data.
 */
export function resolveHistoricalSynthesis(
  dossier: ResearchDossier | null | undefined,
  legacyResult: string | null | undefined,
): DetailSynthesisOutput | null {
  const dossierSynthesis = projectDossierSynthesis(dossier?.agents?.synthesis?.output);
  if (dossierSynthesis) return dossierSynthesis;
  return parseSynthesis(typeof legacyResult === "string" ? legacyResult : "");
}

function buildOutputs(dossier: ResearchDossier | null | undefined): Record<AgentId, AgentOutput | null> {
  const outputs = {} as Record<AgentId, AgentOutput | null>;

  for (const agentId of AGENT_ORDER) {
    const candidate = dossier?.agents?.[agentId]?.output;
    outputs[agentId] = candidate?.agent === agentId ? candidate : null;
  }

  return outputs;
}

function buildProtocolAgents(
  dossier: ResearchDossier | null | undefined,
  outputs: Record<AgentId, AgentOutput | null>,
) {
  const agents = {} as Partial<Record<AgentId, { status: string; degraded?: boolean }>>;

  for (const agentId of AGENT_ORDER) {
    agents[agentId] = {
      status: outputs[agentId] ? "done" : "idle",
      degraded: dossier?.agents?.[agentId]?.degraded === true,
    };
  }

  return agents;
}

function initialAgent(outputs: Record<AgentId, AgentOutput | null>): AgentId {
  if (outputs.synthesis) return "synthesis";
  return AGENT_ORDER.find((agentId) => outputs[agentId]) ?? "synthesis";
}

function sourceCount(entry: ResearchDossierAgent | undefined, output: AgentOutput | null): number {
  const retrievedCount = entry?.evidence?.retrieval?.sourceCount;
  if (typeof retrievedCount === "number" && Number.isFinite(retrievedCount)) {
    return Math.max(0, retrievedCount);
  }
  if (output && "citations" in output && Array.isArray(output.citations)) return output.citations.length;
  return 0;
}

function protocolStatus(status: HistoricalRunStatus | undefined): string {
  if (status === "completed") return "completed";
  if (status === "failed") return "error";
  if (status === "cancelled") return "cancelled";
  return "idle";
}

function isMockProvider(provider: string | undefined): boolean {
  return provider?.trim().toLowerCase() === "mock";
}

export function HistoricalDossierPanel({
  dossier,
  mode,
  status = "completed",
  fallbackProvider,
}: HistoricalDossierPanelProps) {
  const { t } = useLocale();
  const outputs = useMemo(() => buildOutputs(dossier), [dossier]);
  const protocolAgents = useMemo(() => buildProtocolAgents(dossier, outputs), [dossier, outputs]);
  const [activeAgent, setActiveAgent] = useState<AgentId>(() => initialAgent(outputs));

  if (!dossier || dossier.version !== 1 || !dossier.agents) return null;

  const resolvedMode = normalizeResearchMode(mode);
  const completedCount = AGENT_ORDER.filter((agentId) => outputs[agentId]).length;
  const degradedCount = Math.max(
    AGENT_ORDER.filter((agentId) => dossier.agents[agentId]?.degraded).length,
    dossier.degraded ? 1 : 0,
  );
  const selectedEntry = dossier.agents[activeAgent];
  const selectedOutput = outputs[activeAgent];
  const selectedProvider = selectedEntry?.resolvedProviderId || fallbackProvider;
  const selectedSourceCount = sourceCount(selectedEntry, selectedOutput);
  const retrieval = selectedEntry?.evidence?.retrieval;
  const selectedIsDemo = selectedEntry?.degraded === true || isMockProvider(selectedProvider);
  const modeKey = `researchMode.${resolvedMode}`;
  const runStatusKey = status === "completed"
    ? "complete"
    : status === "failed"
      ? "error"
      : "cancelled";

  const handleAgentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const currentButton = target.closest<HTMLButtonElement>("button[aria-pressed]");
    if (!currentButton || !event.currentTarget.contains(currentButton)) return;

    const currentIndex = AGENT_ORDER.indexOf(activeAgent);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = AGENT_ORDER.length - 1;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + AGENT_ORDER.length) % AGENT_ORDER.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % AGENT_ORDER.length;

    event.preventDefault();
    setActiveAgent(AGENT_ORDER[nextIndex]);
    const switchButtons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button[aria-pressed]");
    switchButtons[nextIndex]?.focus();
  };

  return (
    <section
      className="mb-6 overflow-hidden border border-slate-200 bg-[#fbfaf6]"
      aria-labelledby="historical-dossier-title"
      data-testid="historical-dossier"
    >
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {t("history.badgeEvidence")}
          </p>
          <h2 id="historical-dossier-title" className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-950">
            {t("workspace.team.title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{t("workspace.team.process")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
            {t(`${modeKey}.label`)}
          </span>
          <span className="border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">
            {t(`workspace.runStatus.${runStatusKey}`)}
          </span>
          <span className="border border-slate-200 bg-white px-2 py-1 font-mono text-slate-600">
            {t("workspace.analystsProgress", { done: completedCount, total: TOTAL_AGENT_COUNT })}
          </span>
        </div>
      </header>

      {degradedCount > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:px-5" role="status">
          <p className="text-xs font-semibold">{t("report.degradedBanner.title", { count: degradedCount })}</p>
          <p className="mt-0.5 text-[11px] leading-5 text-amber-900">{t("report.degradedBanner.body")}</p>
        </div>
      )}

      <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div
            className="mb-2 flex min-h-9 flex-wrap items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"
            role="status"
            aria-live="polite"
          >
            <span className="font-semibold text-slate-800">
              {t(`agent.${activeAgent}.name`, AGENT_METADATA[activeAgent].name)}
            </span>
            <span aria-hidden className="text-slate-300">/</span>
            <span className="font-mono uppercase tracking-wide text-slate-500">
              {selectedOutput ? t("agent.status.done") : t("agent.status.idle")}
            </span>
            <span className="border-l border-slate-200 pl-2 font-mono text-slate-600">
              LLM · {isMockProvider(selectedProvider) ? t("provider.mock") : selectedProvider || t("history.providerUnknown")}
            </span>
            {retrieval && retrieval.sourceOrigin !== "none" && (
              <span className="border-l border-slate-200 pl-2 font-mono text-slate-600">
                {t("researchProtocol.evidence")} · {retrieval.providerId || retrieval.sourceOrigin}
              </span>
            )}
            <span className="border-l border-slate-200 pl-2 text-slate-600">
              {t(`report.sourceCount.${selectedSourceCount === 1 ? "one" : "other"}`, { count: selectedSourceCount })}
            </span>
            {selectedIsDemo && (
              <span className="border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
                {t("agent.degraded")}
                {selectedEntry?.degradedReason ? ` · ${selectedEntry.degradedReason}` : ""}
              </span>
            )}
          </div>

          <div
            className="h-[min(68rem,78vh)] min-h-[38rem]"
            onKeyDownCapture={handleAgentKeyDown}
            role="group"
            aria-label={t("history.badgeEvidence")}
          >
            <ReportView
              activeAgent={activeAgent}
              outputs={outputs}
              isLoading={false}
              onSwitchTab={setActiveAgent}
            />
          </div>
        </div>

        <aside aria-label={t("workspace.aria.evidenceValidation")}>
          <ResearchProtocolPanel
            mode={resolvedMode}
            outputs={outputs}
            evidence={dossier.evidence}
            validation={dossier.validation}
            agents={protocolAgents}
            status={protocolStatus(status)}
            className="h-fit"
          />
        </aside>
      </div>
    </section>
  );
}
