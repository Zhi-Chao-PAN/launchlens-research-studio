"use client";

import {
  RESEARCH_AGENTS,
  type AgentId,
  type AgentOutput,
  type EvidenceLedger,
  type ValidationLedger,
} from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  getResearchModeConfig,
  type ResearchModeId,
} from "@/lib/research/research-modes";
import type { DeepResearchCapability } from "@/lib/research/deep-research/capability";
import type { DeepRunProgress } from "@/lib/research/deep-research/model";
import { isEvidenceLedger, isValidationLedger } from "@/lib/research/ledger-guards";

interface ResearchProtocolPanelProps {
  mode: ResearchModeId;
  outputs?: Partial<Record<AgentId, AgentOutput | null>>;
  evidence?: EvidenceLedger | null;
  validation?: ValidationLedger | null;
  agents?: Partial<Record<AgentId, { status: string; degraded?: boolean }>>;
  status?: string;
  className?: string;
  runtimeCapability?: DeepResearchCapability | null;
  deepRun?: DeepRunProgress | null;
}

const TOTAL_AGENT_COUNT = RESEARCH_AGENTS.length + 1;
const TRACKING_QUERY_PARAMETERS = new Set([
  "_ga",
  "_gl",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

interface EvidenceSummary {
  sourceCount: number;
  matchedCitations: number;
  rejectedCitations: number;
  groundedAgents: number;
  hasStrictAllowlist: boolean;
  hasRetrieved: boolean;
  hasUnavailable: boolean;
  hasNotConfigured: boolean;
}

function countReportedCitations(outputs: ResearchProtocolPanelProps["outputs"]): number {
  if (!outputs) return 0;
  const keys = new Set<string>();
  for (const output of Object.values(outputs)) {
    if (!output || !("citations" in output) || !Array.isArray(output.citations)) continue;
    for (const citation of output.citations) {
      if (!citation || typeof citation !== "object") continue;
      const value = citation as { id?: string; url?: string; title?: string };
      const key = value.url || value.id || value.title;
      if (key) keys.add(key);
    }
  }
  return keys.size;
}

function summarizeEvidence(evidence: EvidenceLedger): EvidenceSummary {
  const sourceKeys = new Set<string>();
  let matchedCitations = 0;
  let rejectedCitations = 0;
  let groundedAgents = 0;
  let hasStrictAllowlist = false;
  let hasRetrieved = false;
  let hasUnavailable = false;
  let hasNotConfigured = false;

  for (const entry of Object.values(evidence.agents)) {
    if (!entry) continue;

    hasRetrieved ||= entry.retrieval.status === "retrieved";
    hasUnavailable ||= entry.retrieval.status === "unavailable";
    hasNotConfigured ||= entry.retrieval.status === "not_configured";
    if (entry.grounding === "grounded") groundedAgents++;

    for (const source of entry.retrieval.sources) {
      const key = sourceIdentity(source.url, source.id);
      if (key) sourceKeys.add(key);
    }

    if (entry.allowlist.policy === "strict") {
      hasStrictAllowlist = true;
      matchedCitations += finiteNonNegative(entry.allowlist.matched);
      rejectedCitations += finiteNonNegative(entry.allowlist.rejected);
    }
  }

  return {
    sourceCount: sourceKeys.size,
    matchedCitations,
    rejectedCitations,
    groundedAgents,
    hasStrictAllowlist,
    hasRetrieved,
    hasUnavailable,
    hasNotConfigured,
  };
}

function sourceIdentity(rawUrl: string | undefined, id: string | undefined): string | undefined {
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.hash = "";
        url.hostname = url.hostname.toLowerCase();
        for (const name of Array.from(url.searchParams.keys())) {
          const normalizedName = name.toLowerCase();
          if (normalizedName.startsWith("utm_") || TRACKING_QUERY_PARAMETERS.has(normalizedName)) {
            url.searchParams.delete(name);
          }
        }
        url.searchParams.sort();
        if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
        return `url:${url.toString()}`;
      }
    } catch {
      // Persisted ledgers can contain legacy URLs; fall back to their source id.
    }
  }
  return id ? `id:${id}` : undefined;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function ResearchProtocolPanel({
  mode,
  outputs,
  evidence,
  validation,
  agents,
  status = "idle",
  className = "",
  runtimeCapability,
  deepRun,
}: ResearchProtocolPanelProps) {
  const { t } = useLocale();
  const config = getResearchModeConfig(mode);
  const citationCount = countReportedCitations(outputs);
  const safeEvidence = isEvidenceLedger(evidence) ? evidence : null;
  const safeValidation = isValidationLedger(validation) ? validation : null;
  const deepValidation = safeValidation?.version === 2 ? safeValidation : null;
  const deepProtocolExecuted = Boolean(
    deepValidation && deepValidation.protocol.executedPasses > 0,
  );
  const runtimeAvailability = mode === "deep"
    ? runtimeCapability?.availability ?? config.availability
    : config.availability;
  const runtimeRequirements = mode === "deep" ? runtimeCapability?.requirements : undefined;
  const readyRequirementCount = runtimeRequirements?.filter((item) => item.ready).length ?? 0;
  const totalRequirementCount = runtimeRequirements?.length ?? 0;
  const firstBlocker = runtimeRequirements?.find((item) => !item.ready);
  const firstBlockerLabel = firstBlocker
    ? t(`researchRequirement.${firstBlocker.id}`, firstBlocker.label)
    : null;
  const committedDeepWork = deepRun
    ? deepRun.lifecycle === "completed"
      ? deepRun.totalWork
      : Math.min(deepRun.currentWorkIndex, deepRun.totalWork)
    : 0;
  const currentDeepWorkLabel = deepRun?.currentWork
    ? t(`researchProtocol.deepWork.${deepRun.currentWork.kind}`, {
        agent: deepRun.currentWork.agentId?.replaceAll("-", " ") ?? "specialist",
        count:
          deepRun.currentWork.kind === "gap_fill"
            ? (deepValidation?.gapFill?.targetedClaimCount ?? 0)
            : 0,
      })
    : null;
  const evidenceSummary = safeEvidence ? summarizeEvidence(safeEvidence) : null;
  const agentValues = agents ? Object.values(agents) : [];
  const completedAgents = agentValues.filter((agent) => agent?.status === "done").length;
  const degradedAgents = agentValues.filter((agent) => agent?.degraded).length;
  const isPreview = runtimeAvailability === "preview" && !deepProtocolExecuted;
  const modeKey = `researchMode.${mode}`;
  const statusKey = status === "completed"
    ? "complete"
    : status === "cancelled"
      ? "cancelled"
      : status === "cancelling"
        ? "cancelling"
        : status === "error"
          ? "error"
          : status === "running" || status === "loading"
            ? "running"
            : "idle";
  const retrievalLevel = t(`researchMode.retrieval.${config.retrieval}`);
  const validationPassCount = safeValidation?.protocol.executedPasses ?? config.validationPasses;
  const validationPasses = t(
    `researchMode.validationPass.${validationPassCount === 1 ? "one" : "other"}`,
    { count: validationPassCount },
  );
  const provenanceAgentCount = safeValidation
    ? new Set([...safeValidation.provenance.mockAgents, ...safeValidation.provenance.degradedAgents]).size
    : 0;

  const evidenceValue = evidenceSummary
    ? evidenceSummary.sourceCount > 0
      ? t(`researchProtocol.sourcesCollected.${evidenceSummary.sourceCount === 1 ? "one" : "other"}`, {
          count: evidenceSummary.sourceCount,
        })
      : evidenceSummary.hasUnavailable
        ? t("researchProtocol.retrievalUnavailable")
        : evidenceSummary.hasNotConfigured
          ? t("researchProtocol.retrievalNotConfigured")
          : evidenceSummary.hasRetrieved
            ? t("researchProtocol.sourcesCollected.other", { count: 0 })
            : t("researchProtocol.retrieval", { level: retrievalLevel })
    : citationCount > 0
      ? t(`researchProtocol.reportedCitation.${citationCount === 1 ? "one" : "other"}`, { count: citationCount })
      : t("researchProtocol.retrieval", { level: retrievalLevel });

  const evidenceDetail = evidenceSummary
    ? [
        evidenceSummary.hasStrictAllowlist ? t("researchProtocol.urlAllowlistActive") : null,
        evidenceSummary.hasStrictAllowlist ? t("researchProtocol.urlMembershipOnly") : null,
        evidenceSummary.hasStrictAllowlist
          ? t(`researchProtocol.matchedCitation.${evidenceSummary.matchedCitations === 1 ? "one" : "other"}`, {
              count: evidenceSummary.matchedCitations,
            })
          : null,
        evidenceSummary.hasStrictAllowlist
          ? t(`researchProtocol.rejectedCitation.${evidenceSummary.rejectedCitations === 1 ? "one" : "other"}`, {
              count: evidenceSummary.rejectedCitations,
            })
          : null,
        evidenceSummary.hasStrictAllowlist || evidenceSummary.groundedAgents > 0
          ? t("researchProtocol.urlGroundedAgents", {
              count: evidenceSummary.groundedAgents,
              total: TOTAL_AGENT_COUNT,
            })
          : null,
        evidenceSummary.sourceCount > 0 && evidenceSummary.hasUnavailable
          ? t("researchProtocol.retrievalUnavailable")
          : null,
        evidenceSummary.sourceCount > 0 && evidenceSummary.hasNotConfigured
          ? t("researchProtocol.retrievalNotConfigured")
          : null,
        deepValidation
          ? `${deepValidation.semanticValidation.reviewedClaimCount}/${deepValidation.claims.length} claims reviewed`
          : t("researchProtocol.claimVerificationPending"),
      ].filter((part): part is string => Boolean(part)).join(" · ")
    : isPreview
      ? t("researchProtocol.sourceAllowlistRequired")
      : t("researchProtocol.citationUrlVerificationPending");

  const validationDetail = safeValidation
    ? [
        t("researchProtocol.schemaCrossAgentSynthesis"),
        safeValidation.citationCoverage.nestedReferences > 0
          ? t("researchProtocol.citationReferencesResolved", {
              resolved: safeValidation.citationCoverage.resolvedNestedReferences,
              total: safeValidation.citationCoverage.nestedReferences,
            })
          : null,
        safeValidation.sourceDiversity.uniqueSourceCount > 0
          ? t("researchProtocol.sourceDomainCoverage", {
              sources: safeValidation.sourceDiversity.uniqueSourceCount,
              domains: safeValidation.sourceDiversity.uniqueDomainCount,
            })
          : null,
        provenanceAgentCount > 0
          ? t(
              `researchProtocol.demoFallback.${provenanceAgentCount === 1 ? "one" : "other"}`,
              { count: provenanceAgentCount },
            )
          : null,
        deepValidation
          ? deepValidation.semanticValidation.statement
          : t("researchProtocol.semanticValidationNotRun"),
      ].filter((part): part is string => Boolean(part)).join(" · ")
    : isPreview
      ? t("researchProtocol.draftCitationConflictReview")
      : t("researchProtocol.schemaCrossAgentSynthesis");

  const executionDetail = mode === "deep" && deepRun
    ? deepRun.lifecycle === "completed"
      ? t("researchProtocol.deepWorkComplete", { total: deepRun.totalWork })
      : [
          t("researchProtocol.deepWorkProgress", {
            completed: committedDeepWork,
            total: deepRun.totalWork,
          }),
          currentDeepWorkLabel && deepRun.currentWork
            ? t("researchProtocol.deepWorkCurrent", {
                work: currentDeepWorkLabel,
                attempt: deepRun.currentWork.attempts,
                max: deepRun.currentWork.maxAttempts,
              })
            : null,
        ].filter((part): part is string => Boolean(part)).join(" · ")
    : runtimeRequirements
    ? [
        t("researchMode.requirementsReady", {
          ready: readyRequirementCount,
          total: totalRequirementCount,
        }),
        firstBlockerLabel
          ? t("researchProtocol.nextBlocker", { label: firstBlockerLabel })
          : null,
      ].filter((part): part is string => Boolean(part)).join(" · ")
    : config.requiresAsyncExecution
      ? t("researchProtocol.asyncRunnerRequired")
      : t("researchProtocol.requestBoundGuard", { seconds: config.maxSynchronousDurationSec });

  const protocolNotice = mode === "deep"
    ? runtimeCapability?.availability === "available"
      ? t("researchProtocol.deepReadyNotice")
      : runtimeCapability
        ? [
            t("researchProtocol.deepPreviewNotice", {
              ready: readyRequirementCount,
              total: totalRequirementCount,
            }),
            firstBlockerLabel
              ? t("researchProtocol.nextBlocker", { label: firstBlockerLabel })
              : null,
          ].filter((part): part is string => Boolean(part)).join(" ")
        : deepProtocolExecuted
          ? t("researchProtocol.deepExecutedNotice")
          : t(`${modeKey}.capabilityNotice`, config.capabilityNotice, {
              seconds: config.maxSynchronousDurationSec,
            })
    : t("researchProtocol.standardNotice");

  const rows = [
    {
      id: "execution",
      label: t("researchProtocol.execution"),
      value: status === "idle"
        ? isPreview
          ? t("researchProtocol.previewOnly")
          : t("researchProtocol.ready")
        : t(`workspace.runStatus.${statusKey}`),
      detail: executionDetail,
    },
    {
      id: "evidence",
      label: t("researchProtocol.evidence"),
      value: evidenceValue,
      detail: evidenceDetail,
    },
    {
      id: "validation",
      label: t("researchProtocol.validation"),
      value: validationPasses,
      detail: validationDetail,
    },
    {
      id: "analysts",
      label: t("researchProtocol.analysts"),
      value: agentValues.length > 0
        ? t("researchProtocol.analystsComplete", { completed: completedAgents, total: 6 })
        : t("researchProtocol.parallelModel"),
      detail: degradedAgents > 0
        ? t(`researchProtocol.demoFallback.${degradedAgents === 1 ? "one" : "other"}`, { count: degradedAgents })
        : t("researchProtocol.specialistsThenSynthesis"),
    },
  ];

  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`} aria-labelledby="research-protocol-title">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("researchProtocol.eyebrow")}</p>
          <h2 id="research-protocol-title" className="mt-1 text-sm font-semibold text-slate-900">
            {t("researchProtocol.title")}
          </h2>
        </div>
        <span className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
          isPreview ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
        }`}>
          {t(`${modeKey}.label`, config.label)}
        </span>
      </div>

      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-3 first:pt-3 last:pb-1"
          >
            <dt className="text-xs text-slate-500">{row.label}</dt>
            <dd className="text-right text-xs font-semibold text-slate-800">{row.value}</dd>
            <dd className="col-span-2 mt-1 text-[11px] leading-4 text-slate-600">{row.detail}</dd>
          </div>
        ))}
      </dl>

      {mode === "deep" && deepRun && deepRun.totalWork > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium text-slate-700">
              {t("researchProtocol.deepWorkGraph")}
            </span>
            <span className="tabular-nums text-slate-500">
              {committedDeepWork}/{deepRun.totalWork}
            </span>
          </div>
          <div
            className="mt-2 grid grid-cols-11 gap-1"
            role="progressbar"
            aria-label={t("researchProtocol.deepWorkProgress", {
              completed: committedDeepWork,
              total: deepRun.totalWork,
            })}
            aria-valuemin={0}
            aria-valuemax={deepRun.totalWork}
            aria-valuenow={committedDeepWork}
          >
            {Array.from({ length: deepRun.totalWork }, (_, index) => {
              const isCommitted = index < committedDeepWork;
              const isCurrent =
                deepRun.lifecycle === "active" && index === deepRun.currentWorkIndex;
              const currentFailed =
                isCurrent && deepRun.currentWork?.status === "failed";
              const currentWaiting =
                isCurrent && deepRun.currentWork?.status === "retry_wait";
              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`h-1.5 rounded-sm ${
                    isCommitted
                      ? "bg-teal-500"
                      : currentFailed
                        ? "bg-rose-500"
                        : currentWaiting
                          ? "bg-amber-400"
                          : isCurrent
                            ? "bg-slate-900"
                            : "bg-slate-200"
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className={`mt-3 border-l-2 px-3 py-2 text-[11px] leading-5 ${
        mode === "deep" && runtimeAvailability === "preview"
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-slate-300 bg-slate-50 text-slate-600"
      }`}>
        {protocolNotice}
      </div>
    </section>
  );
}
