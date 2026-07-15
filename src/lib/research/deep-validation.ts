import {
  DEEP_VALIDATION_PASS_KINDS,
  RESEARCH_AGENTS,
  type AgentId,
  type AgentOutput,
  type ClaimAdjudication,
  type ClaimAdjudicationCounts,
  type ClaimDisposition,
  type ClaimReviewFinding,
  type ClaimReviewPassKind,
  type ClaimReviewerIdentity,
  type ClaimReviewSource,
  type ClaimReviewVerdict,
  type ConfidenceLevel,
  type ResearchClaim,
  type ResearchClaimKind,
  type ResearchSession,
  type SourceCitation,
  type ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { buildResearchValidation } from "./validation-ledger";
import {
  confidenceAtMost,
  deriveDeterministicAdjudication,
} from "./deep-adjudication-policy";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

const SPECIALIST_IDS = new Set<AgentId>(RESEARCH_AGENTS);
const CONFIDENCE_LEVELS = new Set<ConfidenceLevel>(["low", "medium", "high"]);
const REVIEW_SOURCE_ORIGINS = new Set<ClaimReviewSource["origin"]>([
  "agent_citation",
  "retrieved_evidence",
  "independent_retrieval",
]);
const REVIEW_VERDICTS: Record<ClaimReviewPassKind, ReadonlySet<ClaimReviewVerdict>> = {
  claim_source_entailment: new Set([
    "entailed",
    "partially_entailed",
    "not_entailed",
    "insufficient_evidence",
  ]),
  independent_corroboration_conflict: new Set([
    "corroborated",
    "contradicted",
    "mixed",
    "insufficient_evidence",
  ]),
};
const CLAIM_DISPOSITIONS = new Set<ClaimDisposition>([
  "supported",
  "partially_supported",
  "conflicted",
  "unsupported",
  "insufficient_evidence",
]);

export const DEEP_VALIDATION_LIMITS = Object.freeze({
  defaultMaxClaims: 40,
  hardMaxClaims: 60,
  defaultMaxClaimsPerAgent: 10,
  hardMaxClaimsPerAgent: 16,
  maxReviewSources: 200,
  maxSourcesPerResult: 16,
  maxClaimTextLength: 420,
  maxRationaleLength: 800,
  maxLimitationLength: 320,
  maxLimitationsPerClaim: 6,
});

export class DeepValidationProtocolError extends Error {
  constructor(
    readonly code: "mode_required" | "invalid_pass_order" | "invalid_pass_payload",
    message: string,
  ) {
    super(message);
    this.name = "DeepValidationProtocolError";
  }
}

export interface ClaimExtractionOptions {
  maxClaims?: number;
  maxClaimsPerAgent?: number;
}

export interface InitializeDeepValidationOptions extends ClaimExtractionOptions {
  now?: string;
  additionalReviewSources?: readonly ClaimReviewSource[];
}

export type DeepValidationPassApplication =
  | {
      pass: "claim_source_entailment" | "independent_corroboration_conflict";
      findings: unknown;
    }
  | { pass: "adjudication"; adjudications: unknown };

export interface DeepSynthesisClaimContext {
  claimId: string;
  agentId: ResearchClaim["agentId"];
  text: string;
  disposition: "supported" | "partially_supported";
  confidence: ConfidenceLevel;
  supportingSourceIds: string[];
  limitations: string[];
}

export interface DeepSynthesisValidationContext {
  scope: "claim_evidence_support";
  factualAccuracy: "not_established";
  eligibleClaims: DeepSynthesisClaimContext[];
  excludedClaimIds: string[];
  conflictedClaimIds: string[];
  omittedEligibleClaimIds: string[];
  reviewerDiversityCount: number;
  limitations: string[];
  summary: string;
}

interface ClaimCandidate {
  agentId: ResearchClaim["agentId"];
  fieldPath: string;
  text: string;
  kind: ResearchClaimKind;
  criticality: ResearchClaim["criticality"];
  sourceIds: string[];
}

/**
 * Extracts only decision-relevant specialist claims through explicit schema
 * paths. It never recursively turns arbitrary model prose into prompt input.
 */
export function extractDecisionCriticalClaims(
  session: ResearchSession,
  options: ClaimExtractionOptions = {},
): ResearchClaim[] {
  const maxClaims = boundedInteger(
    options.maxClaims,
    DEEP_VALIDATION_LIMITS.defaultMaxClaims,
    DEEP_VALIDATION_LIMITS.hardMaxClaims,
  );
  const maxClaimsPerAgent = boundedInteger(
    options.maxClaimsPerAgent,
    DEEP_VALIDATION_LIMITS.defaultMaxClaimsPerAgent,
    DEEP_VALIDATION_LIMITS.hardMaxClaimsPerAgent,
  );
  const allowedSourceIds = new Set(collectClaimReviewSources(session).map((source) => source.id));
  const claims: ResearchClaim[] = [];
  const candidateQueues = RESEARCH_AGENTS.map((agentId) => {
    const output = session.agents[agentId]?.output;
    return output && output.agent === agentId
      ? claimCandidatesForOutput(output).slice(0, maxClaimsPerAgent)
      : [];
  });

  // Round-robin keeps the global claim bound from starving later specialists
  // (notably Channel Scout) when earlier schemas each expose many candidates.
  for (let candidateIndex = 0; candidateIndex < maxClaimsPerAgent; candidateIndex += 1) {
    for (const candidates of candidateQueues) {
      if (claims.length >= maxClaims) break;
      const candidate = candidates[candidateIndex];
      if (!candidate) continue;
      const text = boundedText(candidate.text, DEEP_VALIDATION_LIMITS.maxClaimTextLength);
      if (!text) continue;
      const sourceIds = uniqueStrings(candidate.sourceIds)
        .filter((sourceId) => allowedSourceIds.has(sourceId))
        .slice(0, DEEP_VALIDATION_LIMITS.maxSourcesPerResult);
      const identity = `${candidate.agentId}\n${candidate.fieldPath}`;
      claims.push({
        id: `claim_${stableHash(identity)}`,
        agentId: candidate.agentId,
        fieldPath: candidate.fieldPath,
        text,
        kind: candidate.kind,
        criticality: candidate.criticality,
        sourceIds,
        valueHash: `value_${stableHash(text)}`,
      });
    }
    if (claims.length >= maxClaims) break;
  }

  return dedupeBy(claims, (claim) => claim.id);
}

/** Collects the only persisted source IDs review results may reference. */
export function collectClaimReviewSources(session: ResearchSession): ClaimReviewSource[] {
  const sources = new Map<string, ClaimReviewSource>();
  const agentIds: readonly AgentId[] = [...RESEARCH_AGENTS, "synthesis"];

  for (const agentId of agentIds) {
    const evidenceSources = session.evidence?.agents[agentId]?.retrieval.sources ?? [];
    for (const source of evidenceSources) {
      const normalized = normalizeReviewSource(source, "retrieved_evidence");
      if (normalized && !sources.has(normalized.id)) sources.set(normalized.id, normalized);
    }
  }

  for (const agentId of agentIds) {
    const output = session.agents[agentId]?.output;
    if (!output || output.agent !== agentId) continue;
    for (const citation of output.citations ?? []) {
      const normalized = normalizeReviewSource(citation, "agent_citation");
      if (normalized && !sources.has(normalized.id)) sources.set(normalized.id, normalized);
    }
  }

  return [...sources.values()].slice(0, DEEP_VALIDATION_LIMITS.maxReviewSources);
}

/** Creates V2 while copying every V1 structural section without reinterpretation. */
export function initializeDeepValidation(
  session: ResearchSession,
  options: InitializeDeepValidationOptions = {},
): ValidationLedgerV2 {
  if (session.mode !== "deep") {
    throw new DeepValidationProtocolError(
      "mode_required",
      "Validation Ledger V2 can only be initialized for a Deep research session.",
    );
  }

  const now = options.now ?? new Date().toISOString();
  const structural = buildResearchValidation(session, now);
  const claims = extractDecisionCriticalClaims(session, options);
  const reviewSources = mergeReviewSources(
    collectClaimReviewSources(session),
    options.additionalReviewSources ?? [],
  );
  const adjudicationCounts = countAdjudications(claims, []);

  const ledger: ValidationLedgerV2 = {
    version: 2,
    generatedAt: now,
    stage: structural.stage,
    protocol: {
      requestedMode: "deep",
      plannedPasses: 3,
      executedPasses: 0,
      passKinds: [...DEEP_VALIDATION_PASS_KINDS],
      completedPassKinds: [],
      deepMultiPassExecuted: false,
    },
    specialists: { ...structural.specialists },
    urlAllowlist: { ...structural.urlAllowlist },
    sourceDiversity: { ...structural.sourceDiversity },
    citationCoverage: { ...structural.citationCoverage },
    provenance: {
      ...structural.provenance,
      mockAgents: [...structural.provenance.mockAgents],
      degradedAgents: [...structural.provenance.degradedAgents],
    },
    claims,
    reviewSources,
    findings: [],
    adjudications: [],
    adjudicationCounts,
    semanticValidation: {
      status: "pending",
      scope: "claim_evidence_support",
      totalPasses: 3,
      completedPasses: [],
      progress: 0,
      reviewedClaimCount: 0,
      adjudicatedClaimCount: 0,
      reviewerDiversityCount: 0,
      factualAccuracy: "not_established",
      sourceReliability: "not_assessed",
      statement: semanticValidationStatement("pending", 0, claims.length, 0),
    },
    synthesisSummary: "",
  };

  ledger.synthesisSummary = buildDeepSynthesisSummary(ledger);
  return ledger;
}

/**
 * Adds sources admitted by a trusted retrieval boundary. Model review output
 * itself must never call this helper with model-invented source objects.
 */
export function registerTrustedReviewSources(
  ledger: ValidationLedgerV2,
  sources: readonly ClaimReviewSource[],
): ValidationLedgerV2 {
  const reviewSources = mergeReviewSources(ledger.reviewSources, sources);
  if (reviewSources.length === ledger.reviewSources.length) return ledger;
  return { ...ledger, reviewSources };
}

export function applyClaimReviewPass(
  ledger: ValidationLedgerV2,
  pass: ClaimReviewPassKind,
  findings: unknown,
  now?: string,
): ValidationLedgerV2 {
  return applyDeepValidationPass(ledger, { pass, findings }, now);
}

export function applyClaimAdjudicationPass(
  ledger: ValidationLedgerV2,
  adjudications: unknown,
  now?: string,
): ValidationLedgerV2 {
  return applyDeepValidationPass(ledger, { pass: "adjudication", adjudications }, now);
}

/** Applies exactly the next pass and treats already-completed pass retries as idempotent. */
export function applyDeepValidationPass(
  ledger: ValidationLedgerV2,
  application: DeepValidationPassApplication,
  now: string = new Date().toISOString(),
): ValidationLedgerV2 {
  const completed = ledger.protocol.completedPassKinds;
  if (completed.includes(application.pass)) return ledger;

  const passIndex = ledger.protocol.executedPasses;
  const expectedPass = passIndex < 3
    ? DEEP_VALIDATION_PASS_KINDS[passIndex as 0 | 1 | 2]
    : undefined;
  if (application.pass !== expectedPass) {
    throw new DeepValidationProtocolError(
      "invalid_pass_order",
      `Expected ${expectedPass ?? "no further pass"}, received ${application.pass}.`,
    );
  }

  let findings = ledger.findings;
  let adjudications = ledger.adjudications;
  if (application.pass === "adjudication") {
    if (!Array.isArray(application.adjudications)) invalidPassPayload("adjudications");
    adjudications = sanitizeAdjudications(ledger, application.adjudications);
  } else {
    if (!Array.isArray(application.findings)) invalidPassPayload("findings");
    findings = [
      ...ledger.findings,
      ...sanitizeFindings(ledger, application.pass, application.findings),
    ];
  }

  const completedPassKinds = [...completed, application.pass];
  const executedPasses = completedPassKinds.length as 1 | 2 | 3;
  const adjudicationCounts = countAdjudications(ledger.claims, adjudications);
  const reviewedClaimCount = new Set(findings.map((finding) => finding.claimId)).size;
  const reviewerDiversityCount = countReviewerDiversity(findings, adjudications);
  const status = semanticStatus(executedPasses, ledger.claims.length, findings, adjudications);
  const semanticValidation: ValidationLedgerV2["semanticValidation"] = {
    status,
    scope: "claim_evidence_support",
    totalPasses: 3,
    completedPasses: [...completedPassKinds],
    progress: Math.round((executedPasses / 3) * 100),
    reviewedClaimCount,
    adjudicatedClaimCount: adjudications.length,
    reviewerDiversityCount,
    factualAccuracy: "not_established",
    sourceReliability: executedPasses >= 2 ? "assessed_not_proven" : "not_assessed",
    statement: semanticValidationStatement(
      status,
      executedPasses,
      ledger.claims.length,
      adjudications.length,
    ),
  };

  const next: ValidationLedgerV2 = {
    ...ledger,
    generatedAt: now,
    protocol: {
      ...ledger.protocol,
      executedPasses,
      completedPassKinds,
      deepMultiPassExecuted: executedPasses === 3,
    },
    findings,
    adjudications,
    adjudicationCounts,
    semanticValidation,
  };
  next.synthesisSummary = buildDeepSynthesisSummary(next);
  return next;
}

/** Compact context: only supported/partially-supported claims can support synthesis. */
export function buildDeepSynthesisContext(
  ledger: ValidationLedgerV2,
  maxEligibleClaims: number = 24,
): DeepSynthesisValidationContext {
  const maxClaims = boundedInteger(maxEligibleClaims, 24, 32);
  const claimsById = new Map(ledger.claims.map((claim) => [claim.id, claim]));
  const eligible: DeepSynthesisClaimContext[] = [];
  const excludedClaimIds: string[] = [];
  const conflictedClaimIds: string[] = [];

  for (const adjudication of ledger.adjudications) {
    const claim = claimsById.get(adjudication.claimId);
    if (!claim) continue;
    if (
      adjudication.synthesisEligible &&
      (adjudication.disposition === "supported" ||
        adjudication.disposition === "partially_supported")
    ) {
      eligible.push({
        claimId: claim.id,
        agentId: claim.agentId,
        text: boundedText(claim.text, DEEP_VALIDATION_LIMITS.maxClaimTextLength),
        disposition: adjudication.disposition,
        confidence: adjudication.confidence,
        supportingSourceIds: adjudication.supportingSourceIds.slice(
          0,
          DEEP_VALIDATION_LIMITS.maxSourcesPerResult,
        ),
        limitations: adjudication.limitations.slice(0, 3),
      });
    } else {
      excludedClaimIds.push(claim.id);
      if (adjudication.disposition === "conflicted") conflictedClaimIds.push(claim.id);
    }
  }

  const adjudicatedIds = new Set(ledger.adjudications.map((item) => item.claimId));
  for (const claim of ledger.claims) {
    if (!adjudicatedIds.has(claim.id)) excludedClaimIds.push(claim.id);
  }

  const includedClaims = eligible.slice(0, maxClaims);
  const omittedEligibleClaimIds = eligible.slice(maxClaims).map((claim) => claim.claimId);
  const limitations = uniqueStrings([
    "This context reports claim-to-evidence support, not established factual accuracy.",
    ...(ledger.semanticValidation.status === "partial"
      ? ["The three-pass review completed with incomplete claim adjudication."]
      : []),
    ...(conflictedClaimIds.length > 0
      ? [`${conflictedClaimIds.length} conflicted claim(s) are excluded from supporting synthesis.`]
      : []),
    ...(omittedEligibleClaimIds.length > 0
      ? [`${omittedEligibleClaimIds.length} eligible claim(s) were omitted by the context size bound.`]
      : []),
  ]);

  return {
    scope: "claim_evidence_support",
    factualAccuracy: "not_established",
    eligibleClaims: includedClaims,
    excludedClaimIds: uniqueStrings(excludedClaimIds),
    conflictedClaimIds: uniqueStrings(conflictedClaimIds),
    omittedEligibleClaimIds,
    reviewerDiversityCount: ledger.semanticValidation.reviewerDiversityCount,
    limitations,
    summary: buildDeepSynthesisSummary(ledger),
  };
}

export function buildDeepSynthesisSummary(ledger: ValidationLedgerV2): string {
  const counts = ledger.adjudicationCounts;
  return [
    `Deep claim-evidence review: ${ledger.protocol.executedPasses}/3 passes completed (${ledger.semanticValidation.status}).`,
    `${counts.adjudicated}/${counts.totalClaims} bounded decision-relevant claims adjudicated; ${counts.synthesisEligible} eligible to support synthesis.`,
    `Disposition counts: ${counts.supported} supported, ${counts.partiallySupported} partially supported, ${counts.conflicted} conflicted, ${counts.unsupported} unsupported, ${counts.insufficientEvidence} insufficient evidence, ${counts.unreviewed} unreviewed.`,
    `${ledger.semanticValidation.reviewerDiversityCount} reviewer identity configuration(s) observed.`,
    "Factual accuracy is not established; source reliability is assessed only as evidence support, never proven.",
  ].join("\n");
}

function claimCandidatesForOutput(output: AgentOutput): ClaimCandidate[] {
  const fallbackSourceIds = citationIds(output.citations);
  switch (output.agent) {
    case "market-sizer": {
      const market = output.marketSize;
      const sources = preferredSourceIds(market.sources, fallbackSourceIds);
      return [
        candidate(output.agent, "/marketSize/tam", `TAM is ${market.tam} ${market.currency} (${market.unit}).`, "market_metric", sources),
        candidate(output.agent, "/marketSize/sam", `SAM is ${market.sam} ${market.currency} (${market.unit}).`, "market_metric", sources),
        candidate(output.agent, "/marketSize/som", `Three-year SOM is ${market.som} ${market.currency} (${market.unit}).`, "market_metric", sources),
        candidate(output.agent, "/marketSize/growthRate", `Annual market growth is ${market.growthRate}% and the trend is ${market.growthTrend}.`, "market_metric", sources),
        ...output.targetSegments.slice(0, 3).map((segment, index) =>
          candidate(
            output.agent,
            `/targetSegments/${index}`,
            `Target segment ${segment.name} has an estimated size of ${segment.size}: ${segment.description}`,
            "market_metric",
            fallbackSourceIds,
            "material",
          ),
        ),
      ];
    }
    case "competitor-analyst":
      return [
        ...output.competitors.slice(0, 8).map((competitor, index) =>
          candidate(
            output.agent,
            `/competitors/${index}`,
            `${competitor.name} is positioned as ${competitor.positioning}; listed pricing is ${competitor.pricing.min}-${competitor.pricing.max} ${competitor.pricing.currency} under a ${competitor.pricing.model} model; differentiation: ${competitor.differentiation}`,
            "competitor",
            preferredSourceIds(competitor.citations, fallbackSourceIds),
          ),
        ),
        ...output.gaps.slice(0, 3).map((gap, index) =>
          candidate(
            output.agent,
            `/gaps/${index}`,
            `Market gap: ${gap.gap}. Opportunity: ${gap.opportunity}. Estimated difficulty: ${gap.difficulty}.`,
            "recommendation",
            fallbackSourceIds,
            "material",
          ),
        ),
      ];
    case "pain-detective":
      return [
        ...output.painPoints.slice(0, 8).map((painPoint, index) =>
          candidate(
            output.agent,
            `/painPoints/${index}`,
            `Pain point "${painPoint.pain}" is reported as ${painPoint.frequency} with ${painPoint.severity} severity.`,
            "pain",
            preferredSourceIds(painPoint.citations, fallbackSourceIds),
          ),
        ),
        ...output.unmetNeeds.slice(0, 3).map((need, index) =>
          candidate(
            output.agent,
            `/unmetNeeds/${index}`,
            `Unmet need: ${need.need}. Why unmet: ${need.whyUnmet}. Opportunity: ${need.opportunity}.`,
            "pain",
            fallbackSourceIds,
            "material",
          ),
        ),
      ];
    case "pricing-scout":
      return [
        ...output.priceBands.slice(0, 4).map((band, index) =>
          candidate(
            output.agent,
            `/priceBands/${index}`,
            `${band.name} pricing spans ${band.min}-${band.max} ${band.currency}, with a typical price of ${band.typical}.`,
            "pricing",
            fallbackSourceIds,
          ),
        ),
        ...output.willingnessToPay.slice(0, 4).map((estimate, index) =>
          candidate(
            output.agent,
            `/willingnessToPay/${index}`,
            `${estimate.segment} willingness-to-pay is estimated at ${estimate.estimate} with ${estimate.confidence} confidence.`,
            "pricing",
            fallbackSourceIds,
          ),
        ),
        ...output.recommendations.slice(0, 4).map((recommendation, index) =>
          candidate(
            output.agent,
            `/recommendations/${index}`,
            `Recommended ${recommendation.tier} price is ${recommendation.price}${recommendation.period ? ` (${recommendation.period})` : ""}. Rationale: ${recommendation.rationale}`,
            "recommendation",
            fallbackSourceIds,
          ),
        ),
      ];
    case "channel-scout":
      return [
        ...output.recommendedChannels.slice(0, 6).map((channel, index) =>
          candidate(
            output.agent,
            `/recommendedChannels/${index}`,
            `${channel.channel} is a ${channel.priority}-priority acquisition channel because ${channel.why}`,
            "channel",
            fallbackSourceIds,
          ),
        ),
        ...output.channels.slice(0, 4).map((channel, index) =>
          candidate(
            output.agent,
            `/channels/${index}`,
            `${channel.name} has ${channel.reach} reach, ${channel.cost} cost, and ${channel.effectiveness} effectiveness for ${channel.audience}.`,
            "channel",
            fallbackSourceIds,
            "material",
          ),
        ),
      ];
    case "synthesis":
      return [];
  }
}

function candidate(
  agentId: ResearchClaim["agentId"],
  fieldPath: string,
  text: string,
  kind: ResearchClaimKind,
  sourceIds: string[],
  criticality: ResearchClaim["criticality"] = "decision_critical",
): ClaimCandidate {
  return { agentId, fieldPath, text, kind, sourceIds, criticality };
}

function sanitizeFindings(
  ledger: ValidationLedgerV2,
  pass: ClaimReviewPassKind,
  values: readonly unknown[],
): ClaimReviewFinding[] {
  const claims = new Map(ledger.claims.map((claim) => [claim.id, claim]));
  const reviewSources = new Map(ledger.reviewSources.map((source) => [source.id, source]));
  const findings = new Map<string, ClaimReviewFinding>();

  for (const value of values.slice(0, ledger.claims.length * 2 + 8)) {
    if (!isRecord(value) || value.pass !== pass || typeof value.claimId !== "string") continue;
    if (findings.has(value.claimId)) continue;
    const claim = claims.get(value.claimId);
    if (!claim || value.claimValueHash !== claim.valueHash) continue;
    const reviewer = normalizeReviewer(value.reviewer);
    if (!reviewer || !isConfidence(value.confidence) || !REVIEW_VERDICTS[pass].has(value.verdict as ClaimReviewVerdict)) continue;

    // R2A: tighten the claim/source binding so Pass 2 (claim
    // entailment) can only cite sources that were *actually* retrieved
    // for *this* claim. The previous filter only required
    // `source.origin === "independent_retrieval"` and
    // `source.agent === claim.agentId` -- a source could be cited by
    // a different claim's review even though it was retrieved for a
    // sibling claim. `claimIds` is populated by the sanitizer at line
    // 850 from the retrieval payload, so requiring it here grounds the
    // reviewer's citation to the source's actual claim set.
    const allowedSources = pass === "claim_source_entailment"
      ? new Set(claim.sourceIds.filter((sourceId) => reviewSources.has(sourceId)))
      : new Set(
          ledger.reviewSources
            .filter(
              (source) =>
                source.origin === "independent_retrieval" &&
                source.agent === claim.agentId &&
                Array.isArray(source.claimIds) &&
                source.claimIds.includes(claim.id),
            )
            .map((source) => source.id),
        );
    const proposedSupportingSourceIds = allowlistedIds(value.supportingSourceIds, allowedSources);
    const proposedContradictingSourceIds = allowlistedIds(value.contradictingSourceIds, allowedSources);
    const verdict = evidenceBoundVerdict(
      value.verdict as ClaimReviewVerdict,
      proposedSupportingSourceIds,
      proposedContradictingSourceIds,
    );
    const { supportingSourceIds, contradictingSourceIds } = normalizeFindingEvidence(
      verdict,
      proposedSupportingSourceIds,
      proposedContradictingSourceIds,
    );
    const rationale = boundedText(value.rationale, DEEP_VALIDATION_LIMITS.maxRationaleLength);
    if (!rationale) continue;

    findings.set(claim.id, {
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      pass,
      reviewer,
      verdict,
      confidence: value.confidence,
      supportingSourceIds,
      contradictingSourceIds,
      rationale,
    });
  }

  return [...findings.values()];
}

function sanitizeAdjudications(
  ledger: ValidationLedgerV2,
  values: readonly unknown[],
): ClaimAdjudication[] {
  const claims = new Map(ledger.claims.map((claim) => [claim.id, claim]));
  const adjudications = new Map<string, ClaimAdjudication>();

  for (const value of values.slice(0, ledger.claims.length * 2 + 8)) {
    if (!isRecord(value) || typeof value.claimId !== "string") continue;
    if (adjudications.has(value.claimId)) continue;
    const claim = claims.get(value.claimId);
    if (!claim || value.claimValueHash !== claim.valueHash) continue;
    const reviewer = normalizeReviewer(value.reviewer);
    if (!reviewer || !isConfidence(value.confidence) || !CLAIM_DISPOSITIONS.has(value.disposition as ClaimDisposition)) continue;

    const priorFindings = ledger.findings.filter((finding) => finding.claimId === claim.id);
    // The model supplies qualifications, but the application owns the final
    // decision table so identical pass results cannot drift across retries.
    const policy = deriveDeterministicAdjudication(priorFindings);
    const { disposition, supportingSourceIds, contradictingSourceIds } = policy;
    const limitations = normalizeLimitations(value.limitations, disposition);
    const confidence = confidenceAtMost(value.confidence, policy.maximumConfidence)
      ? value.confidence
      : policy.maximumConfidence;

    adjudications.set(claim.id, {
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      reviewer,
      disposition,
      confidence,
      supportingSourceIds,
      contradictingSourceIds,
      reviewedPasses: [...policy.reviewedPasses, "adjudication"],
      synthesisEligible: disposition === "supported" || disposition === "partially_supported",
      limitations,
    });
  }

  return [...adjudications.values()];
}

function countAdjudications(
  claims: readonly ResearchClaim[],
  adjudications: readonly ClaimAdjudication[],
): ClaimAdjudicationCounts {
  const counts: ClaimAdjudicationCounts = {
    totalClaims: claims.length,
    adjudicated: adjudications.length,
    unreviewed: Math.max(0, claims.length - adjudications.length),
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

function countReviewerDiversity(
  findings: readonly ClaimReviewFinding[],
  adjudications: readonly ClaimAdjudication[],
): number {
  const identities = new Set<string>();
  for (const result of [...findings, ...adjudications]) {
    const reviewer = result.reviewer;
    identities.add(`${reviewer.reviewerId}\u0000${reviewer.providerId}\u0000${reviewer.model ?? ""}`);
  }
  return identities.size;
}

function semanticStatus(
  executedPasses: number,
  claimCount: number,
  findings: readonly ClaimReviewFinding[],
  adjudications: readonly ClaimAdjudication[],
): ValidationLedgerV2["semanticValidation"]["status"] {
  if (executedPasses < 3) return "in_progress";
  const entailmentCoverage = new Set(
    findings
      .filter((finding) => finding.pass === "claim_source_entailment")
      .map((finding) => finding.claimId),
  ).size;
  const corroborationCoverage = new Set(
    findings
      .filter((finding) => finding.pass === "independent_corroboration_conflict")
      .map((finding) => finding.claimId),
  ).size;
  if (
    claimCount > 0 &&
    adjudications.length === claimCount &&
    entailmentCoverage === claimCount &&
    corroborationCoverage === claimCount
  ) return "completed";
  return "partial";
}

function semanticValidationStatement(
  status: ValidationLedgerV2["semanticValidation"]["status"],
  executedPasses: number,
  claimCount: number,
  adjudicatedCount: number,
): string {
  return `Claim-evidence support review is ${status}: ${executedPasses}/3 passes executed and ${adjudicatedCount}/${claimCount} claims adjudicated. Factual accuracy remains not established.`;
}

function evidenceBoundVerdict(
  verdict: ClaimReviewVerdict,
  supportingSourceIds: readonly string[],
  contradictingSourceIds: readonly string[],
): ClaimReviewVerdict {
  if (
    (verdict === "entailed" || verdict === "partially_entailed" || verdict === "corroborated") &&
    supportingSourceIds.length === 0
  ) return "insufficient_evidence";
  if (verdict === "contradicted" && contradictingSourceIds.length === 0) {
    return "insufficient_evidence";
  }
  if (verdict === "mixed" && (supportingSourceIds.length === 0 || contradictingSourceIds.length === 0)) {
    return "insufficient_evidence";
  }
  return verdict;
}

function normalizeFindingEvidence(
  verdict: ClaimReviewVerdict,
  supportingSourceIds: string[],
  contradictingSourceIds: string[],
): { supportingSourceIds: string[]; contradictingSourceIds: string[] } {
  if (verdict === "entailed" || verdict === "partially_entailed" || verdict === "corroborated") {
    return { supportingSourceIds, contradictingSourceIds: [] };
  }
  if (verdict === "contradicted") {
    return { supportingSourceIds: [], contradictingSourceIds };
  }
  if (verdict === "mixed") return { supportingSourceIds, contradictingSourceIds };
  return { supportingSourceIds: [], contradictingSourceIds: [] };
}

function normalizeLimitations(value: unknown, disposition: ClaimDisposition): string[] {
  const limitations = Array.isArray(value)
    ? uniqueStrings(
        value
          .map((item) => boundedText(item, DEEP_VALIDATION_LIMITS.maxLimitationLength))
          .filter(Boolean),
      ).slice(0, DEEP_VALIDATION_LIMITS.maxLimitationsPerClaim)
    : [];
  if (disposition === "partially_supported" && limitations.length === 0) {
    limitations.push("Evidence supports only part of this claim; synthesis must preserve the qualification.");
  }
  return limitations;
}

function mergeReviewSources(
  current: readonly ClaimReviewSource[],
  incoming: readonly ClaimReviewSource[],
): ClaimReviewSource[] {
  const sources = new Map<string, ClaimReviewSource>();
  for (const source of [...current, ...incoming]) {
    const normalized = normalizeReviewSource(source, source?.origin);
    if (normalized && !sources.has(normalized.id)) sources.set(normalized.id, normalized);
    if (sources.size >= DEEP_VALIDATION_LIMITS.maxReviewSources) break;
  }
  return [...sources.values()];
}

function normalizeReviewSource(
  value: unknown,
  origin: unknown,
): ClaimReviewSource | undefined {
  if (!isRecord(value) || !REVIEW_SOURCE_ORIGINS.has(origin as ClaimReviewSource["origin"])) return undefined;
  const id = safeIdentifier(value.id);
  const title = boundedText(value.title, 512);
  const snippet = boundedText(value.snippet, 2_000);
  const accessedAt = boundedText(value.accessedAt, 64);
  if (
    !id ||
    !title ||
    !snippet ||
    !accessedAt ||
    !isConfidence(value.confidence) ||
    !isAgentId(value.agent)
  ) return undefined;

  const claimIds = origin === "independent_retrieval"
    ? uniqueStrings(value.claimIds).map(safeIdentifier).filter(Boolean).slice(0, 16)
    : [];
  if (origin === "independent_retrieval" && claimIds.length === 0) return undefined;
  const url = canonicalizeSafeExternalUrl(value.url);
  return {
    id,
    title,
    ...(url ? { url } : {}),
    snippet,
    accessedAt,
    confidence: value.confidence,
    agent: value.agent,
    origin: origin as ClaimReviewSource["origin"],
    ...(origin === "independent_retrieval" ? { claimIds } : {}),
  };
}

function normalizeReviewer(value: unknown): ClaimReviewerIdentity | undefined {
  if (!isRecord(value)) return undefined;
  const reviewerId = safeIdentifier(value.reviewerId);
  const providerId = safeIdentifier(value.providerId);
  const promptVersion = safeIdentifier(value.promptVersion);
  const model = value.model === undefined ? undefined : boundedText(value.model, 160);
  if (!reviewerId || !providerId || !promptVersion || (value.model !== undefined && !model)) return undefined;
  return { reviewerId, providerId, ...(model ? { model } : {}), promptVersion };
}

function allowlistedIds(value: unknown, allowlist: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value)
    .filter((id) => allowlist.has(id))
    .slice(0, DEEP_VALIDATION_LIMITS.maxSourcesPerResult);
}

function preferredSourceIds(primary: unknown, fallback: readonly string[]): string[] {
  const preferred = uniqueStrings(primary);
  return preferred.length > 0 ? preferred : [...fallback];
}

function citationIds(citations: readonly SourceCitation[] | undefined): string[] {
  return uniqueStrings((citations ?? []).map((citation) => citation?.id));
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const values = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (normalized) values.add(normalized);
  }
  return [...values];
}

function dedupeBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const output = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (!output.has(id)) output.set(id, value);
  }
  return [...output.values()];
}

function boundedInteger(value: unknown, fallback: number, hardMax: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(hardMax, Math.floor(value)));
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const normalized = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function safeIdentifier(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /[\u0000-\u001F\u007F]/.test(normalized)) return "";
  return normalized;
}

function stableHash(input: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b1;
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (SPECIALIST_IDS.has(value as AgentId) || value === "synthesis");
}

function isConfidence(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && CONFIDENCE_LEVELS.has(value as ConfidenceLevel);
}

function invalidPassPayload(field: string): never {
  throw new DeepValidationProtocolError(
    "invalid_pass_payload",
    `Deep validation ${field} must be an array.`,
  );
}
