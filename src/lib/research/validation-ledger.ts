import { normalizeResearchMode } from "@/lib/research/research-modes";
import {
  RESEARCH_AGENTS,
  type AgentId,
  type AgentOutput,
  type ResearchSession,
  type SourceCitation,
  type ValidationLedgerV1,
} from "@/lib/schema/research-schema";

const ALL_AGENT_IDS: readonly AgentId[] = [...RESEARCH_AGENTS, "synthesis"];
const SEMANTIC_VALIDATION_NOT_RUN =
  "Claim-to-source entailment, factual accuracy, and source reliability were not evaluated; this ledger reports structural and provenance checks only.";

/**
 * Build the complete structural validation snapshot through one pure seam.
 *
 * Callers provide a session and optionally a fixed ISO timestamp for
 * deterministic tests. All individual checks remain implementation details;
 * recomputing the pre-synthesis snapshot as `final` is a revision of the same
 * Standard structural pass, not a second validation pass.
 */
export function buildResearchValidation(
  session: ResearchSession,
  now: string = new Date().toISOString(),
): ValidationLedgerV1 {
  const specialists = summarizeSpecialists(session);
  const evaluatedAgentIds = ALL_AGENT_IDS.filter(
    (agentId) => session.agents[agentId]?.status === "done" && Boolean(session.agents[agentId]?.output),
  );
  const urlAllowlist = summarizeUrlAllowlist(session, evaluatedAgentIds);
  const sourceDiversity = summarizeSourceDiversity(session, evaluatedAgentIds);
  const citationCoverage = summarizeCitationCoverage(session, evaluatedAgentIds);
  const provenance = summarizeProvenance(session, evaluatedAgentIds);
  const stage = isSynthesisSettled(session) ? "final" : "pre_synthesis";

  const ledger: ValidationLedgerV1 = {
    version: 1,
    generatedAt: now,
    stage,
    protocol: {
      requestedMode: normalizeResearchMode(session.mode),
      executedPasses: 1,
      passKind: "structural_evidence_integrity",
      deepMultiPassExecuted: false,
    },
    specialists,
    urlAllowlist,
    sourceDiversity,
    citationCoverage,
    provenance,
    semanticValidation: {
      status: "not_run",
      claimToSourceEntailment: false,
      factualAccuracy: false,
      sourceReliability: false,
      statement: SEMANTIC_VALIDATION_NOT_RUN,
    },
    synthesisSummary: "",
  };

  ledger.synthesisSummary = buildSynthesisSummary(ledger);
  return ledger;
}

function summarizeSpecialists(session: ResearchSession): ValidationLedgerV1["specialists"] {
  let completedWithOutput = 0;
  let failed = 0;

  for (const agentId of RESEARCH_AGENTS) {
    const state = session.agents[agentId];
    if (state?.status === "done" && state.output) completedWithOutput++;
    else if (state?.status === "error") failed++;
  }

  const incomplete = Math.max(0, RESEARCH_AGENTS.length - completedWithOutput - failed);
  return {
    expected: 5,
    completedWithOutput,
    failed,
    incomplete,
    status:
      completedWithOutput === RESEARCH_AGENTS.length
        ? "complete"
        : completedWithOutput === 0
          ? "none"
          : "partial",
  };
}

function summarizeUrlAllowlist(
  session: ResearchSession,
  evaluatedAgentIds: readonly AgentId[],
): ValidationLedgerV1["urlAllowlist"] {
  let strictAgentCount = 0;
  let compatibleAgentCount = 0;
  let matched = 0;
  let rejected = 0;
  let missingUrl = 0;
  let groundedAgentCount = 0;

  for (const agentId of evaluatedAgentIds) {
    const entry = session.evidence?.agents[agentId];
    if (!entry) continue;
    if (entry.allowlist.policy === "strict") strictAgentCount++;
    else compatibleAgentCount++;
    matched += finiteNonNegative(entry.allowlist.matched);
    rejected += finiteNonNegative(entry.allowlist.rejected);
    missingUrl += finiteNonNegative(entry.allowlist.missingUrl);
    if (entry.grounding === "grounded") groundedAgentCount++;
  }

  let status: ValidationLedgerV1["urlAllowlist"]["status"] = "not_run";
  if (strictAgentCount > 0 && matched === 0) status = "no_matches";
  else if (strictAgentCount > 0 && (rejected > 0 || missingUrl > 0)) {
    status = "matched_with_rejections";
  } else if (strictAgentCount > 0) status = "matched";

  return {
    status,
    strictAgentCount,
    compatibleAgentCount,
    matched,
    rejected,
    missingUrl,
    groundedAgentCount,
    interpretation: "url_membership_only",
  };
}

function summarizeSourceDiversity(
  session: ResearchSession,
  evaluatedAgentIds: readonly AgentId[],
): ValidationLedgerV1["sourceDiversity"] {
  const sources = new Set<string>();
  const domains = new Set<string>();

  for (const agentId of evaluatedAgentIds) {
    const retrievedSources = session.evidence?.agents[agentId]?.retrieval.sources;
    if (!Array.isArray(retrievedSources)) continue;
    for (const source of retrievedSources) {
      const normalized = normalizeHttpUrl(source?.url);
      if (!normalized) continue;
      sources.add(normalized.href);
      domains.add(normalized.hostname);
    }
  }

  const uniqueSourceCount = sources.size;
  const uniqueDomainCount = domains.size;
  return {
    status:
      uniqueDomainCount === 0
        ? "not_available"
        : uniqueDomainCount === 1
          ? "single_domain"
          : "multiple_domains",
    uniqueSourceCount,
    uniqueDomainCount,
    interpretation: "descriptive_only",
  };
}

function summarizeCitationCoverage(
  session: ResearchSession,
  evaluatedAgentIds: readonly AgentId[],
): ValidationLedgerV1["citationCoverage"] {
  let outputsWithCitations = 0;
  let topLevelCitations = 0;
  let citationsWithHttpUrl = 0;
  let nestedReferences = 0;
  let resolvedNestedReferences = 0;

  for (const agentId of evaluatedAgentIds) {
    const output = session.agents[agentId]?.output;
    if (!output) continue;
    const citations = topLevelCitationList(output);
    if (citations.length > 0) outputsWithCitations++;
    topLevelCitations += citations.length;
    citationsWithHttpUrl += citations.filter((citation) => Boolean(normalizeHttpUrl(citation.url))).length;

    const citationIds = new Set(
      citations
        .map((citation) => citation.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const references = nestedCitationReferences(output);
    nestedReferences += references.length;
    resolvedNestedReferences += references.filter((reference) => citationIds.has(reference)).length;
  }

  const outputsEvaluated = evaluatedAgentIds.length;
  const unresolvedNestedReferences = nestedReferences - resolvedNestedReferences;
  const status: ValidationLedgerV1["citationCoverage"]["status"] =
    outputsEvaluated === 0
      ? "not_available"
      : outputsWithCitations === outputsEvaluated && unresolvedNestedReferences === 0
        ? "complete"
        : "partial";

  return {
    status,
    outputsEvaluated,
    outputsWithCitations,
    topLevelCitations,
    citationsWithHttpUrl,
    nestedReferences,
    resolvedNestedReferences,
    unresolvedNestedReferences,
    interpretation: "structural_presence_and_id_resolution_only",
  };
}

function summarizeProvenance(
  session: ResearchSession,
  evaluatedAgentIds: readonly AgentId[],
): ValidationLedgerV1["provenance"] {
  const mockAgents: AgentId[] = [];
  const degradedAgents: AgentId[] = [];

  for (const agentId of evaluatedAgentIds) {
    const state = session.agents[agentId];
    if (state?.degraded === true) degradedAgents.push(agentId);
    if (state?.resolvedProviderId === "mock" || (!state?.resolvedProviderId && session.providerId === "mock")) {
      mockAgents.push(agentId);
    }
  }

  let status: ValidationLedgerV1["provenance"]["status"] = "none_observed";
  if (mockAgents.length > 0 && degradedAgents.length > 0) {
    status = "mock_and_degraded_outputs_present";
  } else if (mockAgents.length > 0) {
    status = "mock_outputs_present";
  } else if (degradedAgents.length > 0) {
    status = "degraded_outputs_present";
  }

  return {
    status,
    mockAgents,
    degradedAgents,
    interpretation: "execution_provenance_only",
  };
}

function buildSynthesisSummary(ledger: ValidationLedgerV1): string {
  const coverage = ledger.citationCoverage;
  return [
    "Structural evidence-integrity snapshot (counts only; not factual verification).",
    `Protocol: ${ledger.protocol.executedPasses} structural pass executed; Deep multi-pass validation not run.`,
    `Specialists: ${ledger.specialists.completedWithOutput}/${ledger.specialists.expected} completed with output; ${ledger.specialists.failed} failed; ${ledger.specialists.incomplete} incomplete.`,
    `URL allowlist: ${ledger.urlAllowlist.strictAgentCount} strict agent outputs, ${ledger.urlAllowlist.compatibleAgentCount} compatibility-only outputs; ${ledger.urlAllowlist.matched} URL matches, ${ledger.urlAllowlist.rejected} rejected, ${ledger.urlAllowlist.missingUrl} missing URL. URL matching proves membership only.`,
    `Citation structure: ${coverage.outputsWithCitations}/${coverage.outputsEvaluated} outputs contain top-level citations; ${coverage.resolvedNestedReferences}/${coverage.nestedReferences} nested citation references resolve. This is not claim coverage.`,
    `Source diversity: ${ledger.sourceDiversity.uniqueSourceCount} unique retrieved URLs across ${ledger.sourceDiversity.uniqueDomainCount} domains; diversity is descriptive, not a reliability judgment.`,
    `Execution provenance: ${ledger.provenance.mockAgents.length} mock outputs and ${ledger.provenance.degradedAgents.length} degraded outputs observed.`,
    "Claim-to-source semantic validation, factual accuracy, and source reliability checks: NOT RUN.",
  ].join("\n");
}

function isSynthesisSettled(session: ResearchSession): boolean {
  const status = session.agents.synthesis?.status;
  return status === "done" || status === "error";
}

function topLevelCitationList(output: AgentOutput): SourceCitation[] {
  return Array.isArray(output.citations) ? output.citations : [];
}

function nestedCitationReferences(output: AgentOutput): string[] {
  switch (output.agent) {
    case "market-sizer":
      return stringArray(output.marketSize?.sources);
    case "competitor-analyst":
      return Array.isArray(output.competitors)
        ? output.competitors.flatMap((competitor) => stringArray(competitor?.citations))
        : [];
    case "pain-detective":
      return Array.isArray(output.painPoints)
        ? output.painPoints.flatMap((painPoint) => stringArray(painPoint?.citations))
        : [];
    default:
      return [];
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function normalizeHttpUrl(value: unknown): URL | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url;
  } catch {
    return undefined;
  }
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
