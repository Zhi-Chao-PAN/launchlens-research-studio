import {
  DEEP_VALIDATION_PASS_KINDS,
  type ClaimAdjudication,
  type ClaimReviewFinding,
  type ClaimReviewerIdentity,
  type AgentId,
  type EvidenceLedger,
  type ResearchClaim,
  type ValidationLedger,
  type ValidationLedgerV1,
  type ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { isResearchModeId } from "./research-modes";
import {
  confidenceAtMost,
  deriveDeterministicAdjudication,
} from "./deep-adjudication-policy";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

const AGENT_IDS = new Set<AgentId>([
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENT_IDS.has(value as AgentId);
}

function isAgentIdArray(value: unknown): value is AgentId[] {
  return Array.isArray(value) && value.every(isAgentId);
}

function isEvidenceSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isOptionalString(value.url) &&
    typeof value.snippet === "string" &&
    typeof value.accessedAt === "string" &&
    isOneOf(value.confidence, ["low", "medium", "high"] as const) &&
    isAgentId(value.agent) &&
    isOptionalString(value.retrievedAt) &&
    (value.score === undefined || isFiniteNonNegative(value.score))
  );
}

function isEvidenceEntry(value: unknown, agentId: string): boolean {
  if (!isRecord(value) || value.agentId !== agentId || !isAgentId(value.agentId)) return false;
  if (!isRecord(value.retrieval) || !isRecord(value.allowlist)) return false;

  const retrieval = value.retrieval;
  const allowlist = value.allowlist;
  return (
    isOneOf(retrieval.status, ["not_requested", "not_configured", "retrieved", "unavailable"] as const) &&
    isOneOf(retrieval.sourceOrigin, ["agent_retrieval", "specialist_union", "none"] as const) &&
    isOptionalString(retrieval.providerId) &&
    isOptionalString(retrieval.focusedQuery) &&
    (retrieval.focusedQueries === undefined ||
      (Array.isArray(retrieval.focusedQueries) &&
        retrieval.focusedQueries.length <= 8 &&
        retrieval.focusedQueries.every((query) =>
          typeof query === "string" && query.length > 0 && query.length <= 399
        ))) &&
    isFiniteNonNegative(retrieval.sourceCount) &&
    Array.isArray(retrieval.sources) &&
    retrieval.sources.every(isEvidenceSource) &&
    isOptionalString(retrieval.unavailableReason) &&
    isOneOf(allowlist.policy, ["compatible", "strict"] as const) &&
    ["total", "matched", "rejected", "missingUrl", "retained"].every((key) =>
      isFiniteNonNegative(allowlist[key]),
    ) &&
    isOneOf(value.grounding, ["grounded", "ungrounded"] as const) &&
    typeof value.updatedAt === "string"
  );
}

export function isEvidenceLedger(value: unknown): value is EvidenceLedger {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.agents)) return false;
  return Object.entries(value.agents).every(([agentId, entry]) =>
    AGENT_IDS.has(agentId as AgentId) && isEvidenceEntry(entry, agentId),
  );
}

export function isValidationLedgerV1(value: unknown): value is ValidationLedgerV1 {
  if (!isRecord(value) || value.version !== 1 || typeof value.generatedAt !== "string") return false;
  if (!isOneOf(value.stage, ["pre_synthesis", "final"] as const)) return false;
  if (
    !isRecord(value.protocol) ||
    !isResearchModeId(value.protocol.requestedMode) ||
    value.protocol.executedPasses !== 1 ||
    value.protocol.passKind !== "structural_evidence_integrity" ||
    value.protocol.deepMultiPassExecuted !== false
  ) return false;

  if (
    !isRecord(value.specialists) ||
    value.specialists.expected !== 5 ||
    !isFiniteNonNegative(value.specialists.completedWithOutput) ||
    !isFiniteNonNegative(value.specialists.failed) ||
    !isFiniteNonNegative(value.specialists.incomplete) ||
    !isOneOf(value.specialists.status, ["complete", "partial", "none"] as const)
  ) return false;

  if (!isRecord(value.urlAllowlist)) return false;
  const urlAllowlist = value.urlAllowlist;
  if (
    !isOneOf(urlAllowlist.status, ["not_run", "matched", "matched_with_rejections", "no_matches"] as const) ||
    !["strictAgentCount", "compatibleAgentCount", "matched", "rejected", "missingUrl", "groundedAgentCount"].every((key) =>
      isFiniteNonNegative(urlAllowlist[key]),
    ) ||
    urlAllowlist.interpretation !== "url_membership_only"
  ) return false;

  if (
    !isRecord(value.sourceDiversity) ||
    !isOneOf(value.sourceDiversity.status, ["not_available", "single_domain", "multiple_domains"] as const) ||
    !isFiniteNonNegative(value.sourceDiversity.uniqueSourceCount) ||
    !isFiniteNonNegative(value.sourceDiversity.uniqueDomainCount) ||
    value.sourceDiversity.interpretation !== "descriptive_only"
  ) return false;

  if (!isRecord(value.citationCoverage)) return false;
  const citationCoverage = value.citationCoverage;
  if (
    !isOneOf(citationCoverage.status, ["not_available", "complete", "partial"] as const) ||
    ![
      "outputsEvaluated",
      "outputsWithCitations",
      "topLevelCitations",
      "citationsWithHttpUrl",
      "nestedReferences",
      "resolvedNestedReferences",
      "unresolvedNestedReferences",
    ].every((key) => isFiniteNonNegative(citationCoverage[key])) ||
    citationCoverage.interpretation !== "structural_presence_and_id_resolution_only"
  ) return false;

  if (
    !isRecord(value.provenance) ||
    !isOneOf(value.provenance.status, [
      "none_observed",
      "mock_outputs_present",
      "degraded_outputs_present",
      "mock_and_degraded_outputs_present",
    ] as const) ||
    !isAgentIdArray(value.provenance.mockAgents) ||
    !isAgentIdArray(value.provenance.degradedAgents) ||
    value.provenance.interpretation !== "execution_provenance_only"
  ) return false;

  return (
    isRecord(value.semanticValidation) &&
    value.semanticValidation.status === "not_run" &&
    value.semanticValidation.claimToSourceEntailment === false &&
    value.semanticValidation.factualAccuracy === false &&
    value.semanticValidation.sourceReliability === false &&
    typeof value.semanticValidation.statement === "string" &&
    typeof value.synthesisSummary === "string"
  );
}

export function isValidationLedgerV2(value: unknown): value is ValidationLedgerV2 {
  if (!isRecord(value) || value.version !== 2 || typeof value.generatedAt !== "string") return false;
  if (!isOneOf(value.stage, ["pre_synthesis", "final"] as const)) return false;
  if (!hasStructuralValidationSections(value)) return false;
  if (!isDeepProtocol(value.protocol)) return false;
  if (!Array.isArray(value.claims) || !Array.isArray(value.reviewSources)) return false;
  if (!Array.isArray(value.findings) || !Array.isArray(value.adjudications)) return false;
  const rawFindings = value.findings;
  const rawAdjudications = value.adjudications;

  const claims = value.claims;
  if (!claims.every(isResearchClaim)) return false;
  const claimIds = claims.map((claim) => claim.id);
  if (!hasUniqueStrings(claimIds)) return false;
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));

  if (!value.reviewSources.every(isClaimReviewSource)) return false;
  const sourceIds = value.reviewSources.map((source) => source.id);
  if (!hasUniqueStrings(sourceIds)) return false;
  const reviewSourcesById = new Map(value.reviewSources.map((source) => [source.id, source]));
  if (
    claims.some((claim) =>
      claim.sourceIds.some((sourceId) => {
        const source = reviewSourcesById.get(sourceId);
        return (
          !source ||
          source.agent !== claim.agentId ||
          source.origin === "independent_retrieval"
        );
      }),
    )
  ) {
    return false;
  }
  if (
    value.reviewSources.some((source) => {
      if (source.origin !== "independent_retrieval") return source.claimIds !== undefined;
      if (!source.claimIds || source.claimIds.length === 0) return true;
      return source.claimIds.some((claimId) => {
        const claim = claimsById.get(claimId);
        return !claim || claim.agentId !== source.agent;
      });
    })
  ) return false;

  const completedPasses = new Set(value.protocol.completedPassKinds);
  if (
    !rawFindings.every((finding) =>
      isClaimReviewFinding(finding, claimsById, reviewSourcesById, completedPasses),
    )
  ) return false;
  const findings = rawFindings as ClaimReviewFinding[];
  const findingKeys = findings.map((finding) => `${finding.pass}\u0000${finding.claimId}`);
  if (!hasUniqueStrings(findingKeys)) return false;

  if (
    !rawAdjudications.every((adjudication) => {
      if (!isRecord(adjudication) || typeof adjudication.claimId !== "string") return false;
      const claimFindings = findings.filter(
        (finding) => finding.claimId === adjudication.claimId,
      );
      return isClaimAdjudication(
        adjudication,
        claimsById,
        deriveDeterministicAdjudication(claimFindings),
        completedPasses,
      );
    })
  ) return false;
  const adjudications = rawAdjudications as ClaimAdjudication[];
  if (!hasUniqueStrings(adjudications.map((adjudication) => adjudication.claimId))) return false;

  const expectedCounts = adjudicationCounts(claims.length, adjudications);
  if (!sameAdjudicationCounts(value.adjudicationCounts, expectedCounts)) return false;
  const semanticLedger = {
    protocol: value.protocol,
    findings,
    adjudications,
  } as {
    protocol: ValidationLedgerV2["protocol"];
    findings: ClaimReviewFinding[];
    adjudications: ClaimAdjudication[];
  };
  if (!isDeepSemanticValidation(value.semanticValidation, semanticLedger, expectedCounts)) return false;
  if (!isValidGapFill(value.gapFill, claims, value.reviewSources)) return false;
  return typeof value.synthesisSummary === "string";
}

/**
 * Strict guard for the optional `gapFill` metadata. Verifies:
 *   - shape (record with the four documented fields)
 *   - `completedAt` is an ISO 8601 timestamp not in the future
 *   - `targetedClaimIds` references only claims that exist
 *   - `sourcesAdded` matches the count of `independent_retrieval` review
 *     sources whose `claimIds` are a subset of `targetedClaimIds`
 *   - `targetedClaimCount` equals `targetedClaimIds.length`
 *   - `sourcesAdded` and `targetedClaimCount` are non-negative integers
 */
function isValidGapFill(
  rawGapFill: unknown,
  claims: ReadonlyArray<{ id: string }>,
  reviewSources: ReadonlyArray<{
    id: string;
    origin: string;
    claimIds?: string[];
  }>,
): boolean {
  if (rawGapFill === undefined) return true;
  if (!isRecord(rawGapFill)) return false;
  const { completedAt, targetedClaimIds, sourcesAdded, targetedClaimCount } = rawGapFill;
  if (typeof completedAt !== "string") return false;
  const completedAtMs = Date.parse(completedAt);
  if (!Number.isFinite(completedAtMs)) return false;
  if (completedAtMs > Date.now() + 60_000) return false;
  if (!Array.isArray(targetedClaimIds)) return false;
  if (targetedClaimIds.some((id) => typeof id !== "string")) return false;
  if (!Number.isInteger(sourcesAdded) || (sourcesAdded as number) < 0) return false;
  if (!Number.isInteger(targetedClaimCount) || (targetedClaimCount as number) < 0) return false;
  // `targetedClaimCount` records how many gap-eligible claims the stage
  // identified; the actual sources added is a subset of those claims'
  // claimIds. A non-zero targeted count with zero sources added is the
  // legitimate "retrieval returned nothing for every gap claim" path,
  // so we only require the two counters to agree when sources were
  // actually added.
  if (
    (sourcesAdded as number) > 0 &&
    (targetedClaimCount as number) !== targetedClaimIds.length
  ) {
    return false;
  }
  if (targetedClaimIds.length > (targetedClaimCount as number)) return false;
  const claimIds = new Set(claims.map((claim) => claim.id));
  if (targetedClaimIds.some((id) => !claimIds.has(id as string))) return false;
  const targeted = new Set(targetedClaimIds as string[]);
  // The independent_retrieval sources actually added by gap-fill are
  // exactly those whose claim binding lives entirely inside the targeted
  // slice. Anything not targeting the gap claims is not gap-fill output.
  const matched = reviewSources.filter(
    (source) =>
      source.origin === "independent_retrieval" &&
      Array.isArray(source.claimIds) &&
      source.claimIds.length > 0 &&
      source.claimIds.every((id) => targeted.has(id as string)) &&
      source.id.startsWith("gap-"),
  );
  if (matched.length !== sourcesAdded) return false;
  return true;
}

export function isValidationLedger(value: unknown): value is ValidationLedger {
  if (!isRecord(value)) return false;
  if (value.version === 1) return isValidationLedgerV1(value);
  if (value.version === 2) return isValidationLedgerV2(value);
  return false;
}

function hasStructuralValidationSections(value: Record<string, unknown>): boolean {
  if (
    !isRecord(value.specialists) ||
    value.specialists.expected !== 5 ||
    !isFiniteNonNegative(value.specialists.completedWithOutput) ||
    !isFiniteNonNegative(value.specialists.failed) ||
    !isFiniteNonNegative(value.specialists.incomplete) ||
    !isOneOf(value.specialists.status, ["complete", "partial", "none"] as const)
  ) return false;

  if (!isRecord(value.urlAllowlist)) return false;
  const urlAllowlist = value.urlAllowlist;
  if (
    !isOneOf(urlAllowlist.status, ["not_run", "matched", "matched_with_rejections", "no_matches"] as const) ||
    !["strictAgentCount", "compatibleAgentCount", "matched", "rejected", "missingUrl", "groundedAgentCount"].every((key) =>
      isFiniteNonNegative(urlAllowlist[key]),
    ) ||
    urlAllowlist.interpretation !== "url_membership_only"
  ) return false;

  if (
    !isRecord(value.sourceDiversity) ||
    !isOneOf(value.sourceDiversity.status, ["not_available", "single_domain", "multiple_domains"] as const) ||
    !isFiniteNonNegative(value.sourceDiversity.uniqueSourceCount) ||
    !isFiniteNonNegative(value.sourceDiversity.uniqueDomainCount) ||
    value.sourceDiversity.interpretation !== "descriptive_only"
  ) return false;

  if (!isRecord(value.citationCoverage)) return false;
  const citationCoverage = value.citationCoverage;
  if (
    !isOneOf(citationCoverage.status, ["not_available", "complete", "partial"] as const) ||
    ![
      "outputsEvaluated",
      "outputsWithCitations",
      "topLevelCitations",
      "citationsWithHttpUrl",
      "nestedReferences",
      "resolvedNestedReferences",
      "unresolvedNestedReferences",
    ].every((key) => isFiniteNonNegative(citationCoverage[key])) ||
    citationCoverage.interpretation !== "structural_presence_and_id_resolution_only"
  ) return false;

  return (
    isRecord(value.provenance) &&
    isOneOf(value.provenance.status, [
      "none_observed",
      "mock_outputs_present",
      "degraded_outputs_present",
      "mock_and_degraded_outputs_present",
    ] as const) &&
    isAgentIdArray(value.provenance.mockAgents) &&
    isAgentIdArray(value.provenance.degradedAgents) &&
    value.provenance.interpretation === "execution_provenance_only"
  );
}

function isDeepProtocol(value: unknown): value is ValidationLedgerV2["protocol"] {
  if (!isRecord(value)) return false;
  if (value.requestedMode !== "deep" || value.plannedPasses !== 3) return false;
  if (!Number.isInteger(value.executedPasses) || !isFiniteNonNegative(value.executedPasses) || value.executedPasses > 3) {
    return false;
  }
  if (!isExactStringArray(value.passKinds, DEEP_VALIDATION_PASS_KINDS)) return false;
  if (!Array.isArray(value.completedPassKinds)) return false;
  const expectedCompleted = DEEP_VALIDATION_PASS_KINDS.slice(0, value.executedPasses);
  if (!isExactStringArray(value.completedPassKinds, expectedCompleted)) return false;
  return value.deepMultiPassExecuted === (value.executedPasses === 3);
}

function isResearchClaim(value: unknown): value is ResearchClaim {
  if (!isRecord(value)) return false;
  return (
    isBoundedNonEmptyString(value.id, 160) &&
    isSpecialistAgentId(value.agentId) &&
    isBoundedNonEmptyString(value.fieldPath, 320) &&
    isBoundedNonEmptyString(value.text, 420) &&
    isOneOf(value.kind, [
      "market_metric",
      "competitor",
      "pain",
      "pricing",
      "channel",
      "recommendation",
    ] as const) &&
    isOneOf(value.criticality, ["decision_critical", "material"] as const) &&
    isBoundedStringArray(value.sourceIds, 16, 160) &&
    hasUniqueStrings(value.sourceIds) &&
    isBoundedNonEmptyString(value.valueHash, 160)
  );
}

function isClaimReviewSource(value: unknown): value is ValidationLedgerV2["reviewSources"][number] {
  return (
    isEvidenceSource(value) &&
    isRecord(value) &&
    isBoundedNonEmptyString(value.id, 160) &&
    isBoundedNonEmptyString(value.title, 512) &&
    isBoundedNonEmptyString(value.snippet, 2_000) &&
    isBoundedNonEmptyString(value.accessedAt, 64) &&
    (value.url === undefined || isCanonicalSafeExternalUrl(value.url)) &&
    (value.claimIds === undefined ||
      (isBoundedStringArray(value.claimIds, 16, 160) && hasUniqueStrings(value.claimIds))) &&
    isOneOf(value.origin, ["agent_citation", "retrieved_evidence", "independent_retrieval"] as const)
  );
}

function isReviewerIdentity(value: unknown): value is ClaimReviewerIdentity {
  if (!isRecord(value)) return false;
  return (
    isBoundedNonEmptyString(value.reviewerId, 160) &&
    isBoundedNonEmptyString(value.providerId, 160) &&
    isBoundedNonEmptyString(value.promptVersion, 160) &&
    (value.model === undefined || isBoundedNonEmptyString(value.model, 160))
  );
}

function isClaimReviewFinding(
  value: unknown,
  claimsById: ReadonlyMap<string, ResearchClaim>,
  reviewSourcesById: ReadonlyMap<string, ValidationLedgerV2["reviewSources"][number]>,
  completedPasses: ReadonlySet<string>,
): value is ClaimReviewFinding {
  if (!isRecord(value) || typeof value.claimId !== "string") return false;
  const claim = claimsById.get(value.claimId);
  if (!claim || value.claimValueHash !== claim.valueHash) return false;
  if (!isOneOf(value.pass, ["claim_source_entailment", "independent_corroboration_conflict"] as const)) return false;
  if (!completedPasses.has(value.pass) || !isReviewerIdentity(value.reviewer)) return false;
  if (!isOneOf(value.confidence, ["low", "medium", "high"] as const)) return false;
  const verdicts = value.pass === "claim_source_entailment"
    ? ["entailed", "partially_entailed", "not_entailed", "insufficient_evidence"] as const
    : ["corroborated", "contradicted", "mixed", "insufficient_evidence"] as const;
  if (!isOneOf(value.verdict, verdicts)) return false;
  if (!isBoundedStringArray(value.supportingSourceIds, 16, 160)) return false;
  if (!isBoundedStringArray(value.contradictingSourceIds, 16, 160)) return false;
  if (!hasUniqueStrings(value.supportingSourceIds) || !hasUniqueStrings(value.contradictingSourceIds)) return false;
  const allowedSources = value.pass === "claim_source_entailment"
    ? new Set(claim.sourceIds)
    : new Set(
        [...reviewSourcesById.values()]
          .filter(
            (source) =>
              source.origin === "independent_retrieval" &&
              source.agent === claim.agentId &&
              source.claimIds?.includes(claim.id),
          )
          .map((source) => source.id),
      );
  if ([...value.supportingSourceIds, ...value.contradictingSourceIds].some((id) => !allowedSources.has(id))) {
    return false;
  }
  if (!isBoundedNonEmptyString(value.rationale, 800)) return false;
  if (
    (value.verdict === "entailed" || value.verdict === "partially_entailed" || value.verdict === "corroborated") &&
    value.supportingSourceIds.length === 0
  ) return false;
  if (value.verdict === "contradicted" && value.contradictingSourceIds.length === 0) return false;
  if (
    value.verdict === "mixed" &&
    (value.supportingSourceIds.length === 0 || value.contradictingSourceIds.length === 0)
  ) return false;
  if (
    (value.verdict === "entailed" ||
      value.verdict === "partially_entailed" ||
      value.verdict === "corroborated") &&
    value.contradictingSourceIds.length > 0
  ) return false;
  if (value.verdict === "contradicted" && value.supportingSourceIds.length > 0) return false;
  if (
    (value.verdict === "not_entailed" || value.verdict === "insufficient_evidence") &&
    (value.supportingSourceIds.length > 0 || value.contradictingSourceIds.length > 0)
  ) return false;
  return true;
}

function isClaimAdjudication(
  value: unknown,
  claimsById: ReadonlyMap<string, ResearchClaim>,
  policy: ReturnType<typeof deriveDeterministicAdjudication>,
  completedPasses: ReadonlySet<string>,
): value is ClaimAdjudication {
  if (!isRecord(value) || typeof value.claimId !== "string") return false;
  const claim = claimsById.get(value.claimId);
  if (!claim || value.claimValueHash !== claim.valueHash || !isReviewerIdentity(value.reviewer)) return false;
  if (!isOneOf(value.disposition, [
    "supported",
    "partially_supported",
    "conflicted",
    "unsupported",
    "insufficient_evidence",
  ] as const)) return false;
  if (value.disposition !== policy.disposition) return false;
  if (!isOneOf(value.confidence, ["low", "medium", "high"] as const)) return false;
  if (!confidenceAtMost(value.confidence, policy.maximumConfidence)) return false;
  if (!isBoundedStringArray(value.supportingSourceIds, 16, 160)) return false;
  if (!isBoundedStringArray(value.contradictingSourceIds, 16, 160)) return false;
  if (!hasUniqueStrings(value.supportingSourceIds) || !hasUniqueStrings(value.contradictingSourceIds)) return false;
  if (!isExactStringArray(value.supportingSourceIds, policy.supportingSourceIds)) return false;
  if (!isExactStringArray(value.contradictingSourceIds, policy.contradictingSourceIds)) return false;
  if (!Array.isArray(value.reviewedPasses) || !hasUniqueStrings(value.reviewedPasses)) return false;
  if (!value.reviewedPasses.every((pass) => isOneOf(pass, DEEP_VALIDATION_PASS_KINDS))) return false;
  const expectedPasses = [...policy.reviewedPasses, "adjudication"];
  if (!isExactStringArray(value.reviewedPasses, expectedPasses)) return false;
  if (!value.reviewedPasses.every((pass) => completedPasses.has(pass))) return false;
  const synthesisEligible = value.disposition === "supported" || value.disposition === "partially_supported";
  if (value.synthesisEligible !== synthesisEligible) return false;
  if (!isBoundedStringArray(value.limitations, 6, 320)) return false;
  if (value.disposition === "partially_supported" && value.limitations.length === 0) return false;
  if (synthesisEligible && value.supportingSourceIds.length === 0) return false;
  if (value.disposition === "conflicted" && value.contradictingSourceIds.length === 0) return false;
  return true;
}

function adjudicationCounts(
  totalClaims: number,
  adjudications: readonly ClaimAdjudication[],
): ValidationLedgerV2["adjudicationCounts"] {
  const counts: ValidationLedgerV2["adjudicationCounts"] = {
    totalClaims,
    adjudicated: adjudications.length,
    unreviewed: Math.max(0, totalClaims - adjudications.length),
    supported: 0,
    partiallySupported: 0,
    conflicted: 0,
    unsupported: 0,
    insufficientEvidence: 0,
    synthesisEligible: 0,
  };
  for (const adjudication of adjudications) {
    if (adjudication.disposition === "supported") counts.supported++;
    else if (adjudication.disposition === "partially_supported") counts.partiallySupported++;
    else if (adjudication.disposition === "conflicted") counts.conflicted++;
    else if (adjudication.disposition === "unsupported") counts.unsupported++;
    else counts.insufficientEvidence++;
    if (adjudication.synthesisEligible) counts.synthesisEligible++;
  }
  return counts;
}

function sameAdjudicationCounts(value: unknown, expected: ValidationLedgerV2["adjudicationCounts"]): boolean {
  if (!isRecord(value)) return false;
  return (Object.keys(expected) as Array<keyof typeof expected>).every(
    (key) => value[key] === expected[key],
  );
}

function isDeepSemanticValidation(
  value: unknown,
  ledger: Record<string, unknown> & {
    protocol: ValidationLedgerV2["protocol"];
    findings: ClaimReviewFinding[];
    adjudications: ClaimAdjudication[];
  },
  counts: ValidationLedgerV2["adjudicationCounts"],
): value is ValidationLedgerV2["semanticValidation"] {
  if (!isRecord(value)) return false;
  if (!isOneOf(value.status, ["pending", "in_progress", "completed", "partial", "failed"] as const)) return false;
  if (value.scope !== "claim_evidence_support" || value.totalPasses !== 3) return false;
  if (!isExactStringArray(value.completedPasses, ledger.protocol.completedPassKinds)) return false;
  if (value.progress !== Math.round((ledger.protocol.executedPasses / 3) * 100)) return false;
  const reviewedClaimCount = new Set(ledger.findings.map((finding) => finding.claimId)).size;
  if (value.reviewedClaimCount !== reviewedClaimCount || value.adjudicatedClaimCount !== counts.adjudicated) return false;
  const reviewerDiversityCount = countReviewerIdentities(ledger.findings, ledger.adjudications);
  if (value.reviewerDiversityCount !== reviewerDiversityCount) return false;
  if (value.factualAccuracy !== "not_established") return false;
  const expectedReliability = ledger.protocol.executedPasses >= 2 ? "assessed_not_proven" : "not_assessed";
  if (value.sourceReliability !== expectedReliability || typeof value.statement !== "string") return false;

  if (value.status === "failed") return true;
  if (ledger.protocol.executedPasses === 0) return value.status === "pending";
  if (ledger.protocol.executedPasses < 3) return value.status === "in_progress";
  const entailmentCoverage = new Set(
    ledger.findings
      .filter((finding) => finding.pass === "claim_source_entailment")
      .map((finding) => finding.claimId),
  ).size;
  const corroborationCoverage = new Set(
    ledger.findings
      .filter((finding) => finding.pass === "independent_corroboration_conflict")
      .map((finding) => finding.claimId),
  ).size;
  const expectedStatus =
    counts.totalClaims > 0 &&
    counts.adjudicated === counts.totalClaims &&
    entailmentCoverage === counts.totalClaims &&
    corroborationCoverage === counts.totalClaims
    ? "completed"
    : "partial";
  return value.status === expectedStatus;
}

function countReviewerIdentities(
  findings: readonly ClaimReviewFinding[],
  adjudications: readonly ClaimAdjudication[],
): number {
  return new Set([...findings, ...adjudications].map(({ reviewer }) =>
    `${reviewer.reviewerId}\u0000${reviewer.providerId}\u0000${reviewer.model ?? ""}`,
  )).size;
}

function isSpecialistAgentId(value: unknown): value is ResearchClaim["agentId"] {
  return isAgentId(value) && value !== "synthesis";
}

function isBoundedNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isBoundedStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= maxLength)
  );
}

function hasUniqueStrings(value: readonly unknown[]): boolean {
  return value.every((item) => typeof item === "string") && new Set(value).size === value.length;
}

function isExactStringArray(value: unknown, expected: readonly string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function isCanonicalSafeExternalUrl(value: unknown): value is string {
  return typeof value === "string" && canonicalizeSafeExternalUrl(value) === value;
}
