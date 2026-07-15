// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import {
  RESEARCH_AGENTS,
  type AgentId,
  type AgentState,
  type ClaimAdjudication,
  type ClaimReviewFinding,
  type ClaimReviewerIdentity,
  type ResearchSession,
  type ValidationLedgerV1,
} from "@/lib/schema/research-schema";
import { createEvidenceLedger } from "./evidence-ledger";
import {
  DeepValidationProtocolError,
  applyClaimAdjudicationPass,
  applyClaimReviewPass,
  buildDeepSynthesisContext,
  extractDecisionCriticalClaims,
  initializeDeepValidation,
  registerTrustedReviewSources,
} from "./deep-validation";
import {
  isValidationLedger,
  isValidationLedgerV1,
  isValidationLedgerV2,
} from "./ledger-guards";
import { buildResearchValidation } from "./validation-ledger";

const NOW = "2026-07-13T12:00:00.000Z";
const REVIEWER: ClaimReviewerIdentity = {
  reviewerId: "semantic-reviewer-a",
  providerId: "openai",
  model: "review-model",
  promptVersion: "deep-validation-v1",
};

function makeSession(mode: "standard" | "deep" = "deep"): ResearchSession {
  const agents = {} as Record<AgentId, AgentState>;
  const specialistOutputs = RESEARCH_AGENTS.map((agentId) =>
    generateMockAgentOutput(agentId, "Evidence-led launch research", ["evidence", "launch"]),
  );

  RESEARCH_AGENTS.forEach((agentId, index) => {
    agents[agentId] = {
      id: agentId,
      status: "done",
      progress: 100,
      currentStep: "Complete",
      output: specialistOutputs[index],
      resolvedProviderId: "openai",
    };
  });
  agents.synthesis = {
    id: "synthesis",
    status: "idle",
    progress: 0,
    currentStep: "Waiting",
  };

  return {
    id: `validation-${mode}`,
    query: "Evidence-led launch research",
    keywords: ["evidence", "launch"],
    mode,
    providerId: "openai",
    createdAt: NOW,
    updatedAt: NOW,
    status: "running",
    agents,
    citations: [],
    evidence: createEvidenceLedger(NOW),
  };
}

function passFindings(
  ledger: ReturnType<typeof initializeDeepValidation>,
  pass: ClaimReviewFinding["pass"],
): ClaimReviewFinding[] {
  return ledger.claims.map((claim) => {
    const sourceId = pass === "claim_source_entailment"
      ? claim.sourceIds[0]
      : ledger.reviewSources.find(
          (source) =>
            source.origin === "independent_retrieval" && source.agent === claim.agentId,
        )?.id;
    return {
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      pass,
      reviewer: REVIEWER,
      verdict: sourceId
        ? pass === "claim_source_entailment"
          ? "entailed"
          : "corroborated"
        : "insufficient_evidence",
      confidence: sourceId ? "medium" : "low",
      supportingSourceIds: sourceId ? [sourceId] : [],
      contradictingSourceIds: [],
      rationale: sourceId ? "The admitted source supports this bounded claim." : "No admitted source supports the claim.",
    };
  });
}

function withIndependentSources(
  ledger: ReturnType<typeof initializeDeepValidation>,
): ReturnType<typeof initializeDeepValidation> {
  const agents = [...new Set(ledger.claims.map((claim) => claim.agentId))];
  return registerTrustedReviewSources(
    ledger,
    agents.map((agentId) => ({
      id: `independent-${agentId}`,
      title: `Independent evidence for ${agentId}`,
      url: `https://independent.example/${agentId}`,
      snippet: `Fresh evidence independently checks the ${agentId} research dimension.`,
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: agentId,
      origin: "independent_retrieval" as const,
      claimIds: ledger.claims
        .filter((claim) => claim.agentId === agentId)
        .map((claim) => claim.id),
    })),
  );
}

describe("ValidationLedger V1 | V2 compatibility", () => {
  it("keeps V1 semantics exact while the common guard accepts both versions", () => {
    const v1 = buildResearchValidation(makeSession("standard"), NOW);
    expect(isValidationLedgerV1(v1)).toBe(true);
    expect(isValidationLedger(v1)).toBe(true);
    expect(v1.semanticValidation.factualAccuracy).toBe(false);

    const weakenedV1 = {
      ...v1,
      semanticValidation: {
        ...v1.semanticValidation,
        factualAccuracy: "not_established",
      },
    };
    expect(isValidationLedgerV1(weakenedV1)).toBe(false);
    expect(isValidationLedger(weakenedV1)).toBe(false);

    const v2 = initializeDeepValidation(makeSession(), { now: NOW });
    expect(isValidationLedgerV2(v2)).toBe(true);
    expect(isValidationLedger(v2)).toBe(true);
    expect(v2.semanticValidation.factualAccuracy).toBe("not_established");
  });

  it("retains all structural sections verbatim when initializing V2", () => {
    const session = makeSession();
    const structural: ValidationLedgerV1 = buildResearchValidation(session, NOW);
    const deep = initializeDeepValidation(session, { now: NOW });

    expect(deep.specialists).toEqual(structural.specialists);
    expect(deep.urlAllowlist).toEqual(structural.urlAllowlist);
    expect(deep.sourceDiversity).toEqual(structural.sourceDiversity);
    expect(deep.citationCoverage).toEqual(structural.citationCoverage);
    expect(deep.provenance).toEqual(structural.provenance);
  });
});

describe("deep claim extraction and pass reducers", () => {
  it("extracts stable decision-relevant claims within hard caller bounds", () => {
    const session = makeSession();
    const first = extractDecisionCriticalClaims(session, { maxClaims: 3, maxClaimsPerAgent: 2 });
    const second = extractDecisionCriticalClaims(session, { maxClaims: 3, maxClaimsPerAgent: 2 });

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first.every((claim) => claim.id.startsWith("claim_") && claim.valueHash.startsWith("value_"))).toBe(true);
    expect(first.every((claim) => claim.text.length <= 420)).toBe(true);
  });

  it("round-robins bounded claims across all five specialist agents", () => {
    const claims = extractDecisionCriticalClaims(makeSession(), {
      maxClaims: 25,
      maxClaimsPerAgent: 5,
    });
    const agents = new Set(claims.map((claim) => claim.agentId));

    expect(claims).toHaveLength(25);
    expect(agents).toEqual(new Set([
      "market-sizer",
      "competitor-analyst",
      "pain-detective",
      "pricing-scout",
      "channel-scout",
    ]));
    for (const agentId of agents) {
      expect(claims.filter((claim) => claim.agentId === agentId)).toHaveLength(5);
    }
  });

  it("filters invented claim/source IDs and stale claim hashes at the pass boundary", () => {
    const initial = initializeDeepValidation(makeSession(), { now: NOW, maxClaims: 4 });
    const claim = initial.claims[0];
    const staleClaim = initial.claims[1];
    const admittedSourceId = claim.sourceIds[0];
    expect(claim && staleClaim && admittedSourceId).toBeTruthy();

    const next = applyClaimReviewPass(
      initial,
      "claim_source_entailment",
      [
        {
          claimId: "invented-claim",
          claimValueHash: "invented-hash",
          pass: "claim_source_entailment",
          reviewer: REVIEWER,
          verdict: "entailed",
          confidence: "high",
          supportingSourceIds: ["invented-source"],
          contradictingSourceIds: [],
          rationale: "Hostile invented result",
        },
        {
          claimId: claim.id,
          claimValueHash: claim.valueHash,
          pass: "claim_source_entailment",
          reviewer: REVIEWER,
          verdict: "entailed",
          confidence: "high",
          supportingSourceIds: [admittedSourceId, "invented-source"],
          contradictingSourceIds: ["invented-source"],
          rationale: "Only allowlisted identifiers should survive.",
        },
        {
          claimId: staleClaim.id,
          claimValueHash: "stale-value-hash",
          pass: "claim_source_entailment",
          reviewer: REVIEWER,
          verdict: "entailed",
          confidence: "high",
          supportingSourceIds: staleClaim.sourceIds,
          contradictingSourceIds: [],
          rationale: "This review targets an old value.",
        },
      ],
      "2026-07-13T12:01:00.000Z",
    );

    expect(next.findings).toHaveLength(1);
    expect(next.findings[0]).toMatchObject({
      claimId: claim.id,
      supportingSourceIds: [admittedSourceId],
      contradictingSourceIds: [],
    });
    expect(isValidationLedgerV2(next)).toBe(true);

    const hostilePersisted = structuredClone(next);
    hostilePersisted.findings[0].supportingSourceIds.push("invented-source");
    expect(isValidationLedgerV2(hostilePersisted)).toBe(false);
  });

  it("advances exactly three ordered, idempotent passes with honest progress", () => {
    const initial = initializeDeepValidation(makeSession(), { now: NOW, maxClaims: 5 });
    expect(initial.semanticValidation).toMatchObject({ status: "pending", progress: 0 });

    expect(() =>
      applyClaimReviewPass(initial, "independent_corroboration_conflict", [], NOW),
    ).toThrowError(DeepValidationProtocolError);

    const pass1 = applyClaimReviewPass(
      initial,
      "claim_source_entailment",
      passFindings(initial, "claim_source_entailment"),
      "2026-07-13T12:01:00.000Z",
    );
    expect(pass1.protocol.executedPasses).toBe(1);
    expect(pass1.semanticValidation).toMatchObject({ status: "in_progress", progress: 33 });
    expect(applyClaimReviewPass(pass1, "claim_source_entailment", [], NOW)).toBe(pass1);

    const pass1WithIndependentSources = withIndependentSources(pass1);
    const pass2 = applyClaimReviewPass(
      pass1WithIndependentSources,
      "independent_corroboration_conflict",
      passFindings(pass1WithIndependentSources, "independent_corroboration_conflict"),
      "2026-07-13T12:02:00.000Z",
    );
    expect(pass2.protocol.executedPasses).toBe(2);
    expect(pass2.semanticValidation).toMatchObject({ progress: 67, sourceReliability: "assessed_not_proven" });

    const adjudications: ClaimAdjudication[] = pass2.claims.map((claim) => ({
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      reviewer: REVIEWER,
      disposition: "supported",
      confidence: "medium",
      supportingSourceIds: claim.sourceIds.slice(0, 1),
      contradictingSourceIds: [],
      reviewedPasses: [],
      synthesisEligible: false,
      limitations: [],
    }));
    const pass3 = applyClaimAdjudicationPass(
      pass2,
      adjudications,
      "2026-07-13T12:03:00.000Z",
    );

    expect(pass3.protocol).toMatchObject({ executedPasses: 3, deepMultiPassExecuted: true });
    expect(pass3.semanticValidation).toMatchObject({
      status: "completed",
      progress: 100,
      factualAccuracy: "not_established",
    });
    expect(pass3.adjudicationCounts).toMatchObject({
      totalClaims: 5,
      adjudicated: 5,
      supported: 5,
      synthesisEligible: 5,
    });
    expect(isValidationLedgerV2(pass3)).toBe(true);
  });

  it("keeps unsupported and conflicted claims out of synthesis support context", () => {
    const initial = initializeDeepValidation(makeSession(), { now: NOW, maxClaims: 5 });
    const pass1Findings = passFindings(initial, "claim_source_entailment");
    pass1Findings[1] = {
      ...pass1Findings[1],
      verdict: "not_entailed",
      confidence: "low",
      supportingSourceIds: [],
      rationale: "The original source does not entail this bounded claim.",
    };
    const pass1 = applyClaimReviewPass(initial, "claim_source_entailment", pass1Findings, NOW);
    const pass1WithIndependentSources = withIndependentSources(pass1);
    const pass2Findings = passFindings(
      pass1WithIndependentSources,
      "independent_corroboration_conflict",
    );
    pass2Findings[1] = {
      ...pass2Findings[1],
      verdict: "insufficient_evidence",
      confidence: "low",
      supportingSourceIds: [],
      rationale: "No independent source corroborates this claim.",
    };
    const conflictedClaim = pass1WithIndependentSources.claims[2];
    const contradictingSourceId = pass1WithIndependentSources.reviewSources.find(
      (source) =>
        source.origin === "independent_retrieval" &&
        source.agent === conflictedClaim.agentId,
    )?.id;
    expect(contradictingSourceId).toBeTruthy();
    pass2Findings[2] = {
      ...pass2Findings[2],
      verdict: "contradicted",
      confidence: "medium",
      supportingSourceIds: [],
      contradictingSourceIds: [contradictingSourceId!],
      rationale: "Independent evidence conflicts with this claim.",
    };
    const pass2 = applyClaimReviewPass(
      pass1WithIndependentSources,
      "independent_corroboration_conflict",
      pass2Findings,
      NOW,
    );

    const adjudications = pass2.claims.map((claim) => ({
        claimId: claim.id,
        claimValueHash: claim.valueHash,
        reviewer: REVIEWER,
        disposition: "supported" as const,
        confidence: "medium",
        supportingSourceIds: claim.sourceIds.slice(0, 1),
        contradictingSourceIds: [],
        reviewedPasses: [],
        synthesisEligible: true,
        limitations: [],
      }));
    const finalLedger = applyClaimAdjudicationPass(pass2, adjudications, NOW);
    const context = buildDeepSynthesisContext(finalLedger);
    const unsupportedId = pass2.claims[1].id;
    const conflictedId = pass2.claims[2].id;

    expect(context.eligibleClaims.map((claim) => claim.claimId)).not.toContain(unsupportedId);
    expect(context.eligibleClaims.map((claim) => claim.claimId)).not.toContain(conflictedId);
    expect(context.excludedClaimIds).toEqual(expect.arrayContaining([unsupportedId, conflictedId]));
    expect(context.conflictedClaimIds).toContain(conflictedId);
    expect(finalLedger.adjudications.find((item) => item.claimId === unsupportedId)?.synthesisEligible).toBe(false);
    expect(finalLedger.adjudications.find((item) => item.claimId === conflictedId)?.synthesisEligible).toBe(false);
    expect(finalLedger.synthesisSummary).toContain("Factual accuracy is not established");
  });

  it("does not let original or another agent's source masquerade as corroboration", () => {
    const initial = initializeDeepValidation(makeSession(), {
      now: NOW,
      maxClaims: 5,
      maxClaimsPerAgent: 1,
    });
    const pass1 = applyClaimReviewPass(
      initial,
      "claim_source_entailment",
      passFindings(initial, "claim_source_entailment"),
      NOW,
    );
    const withIndependent = withIndependentSources(pass1);
    const target = withIndependent.claims[0];
    const otherAgentSource = withIndependent.reviewSources.find(
      (source) =>
        source.origin === "independent_retrieval" && source.agent !== target.agentId,
    );
    const originalSourceId = target.sourceIds[0];
    expect(originalSourceId && otherAgentSource).toBeTruthy();

    const pass2 = applyClaimReviewPass(
      withIndependent,
      "independent_corroboration_conflict",
      [{
        claimId: target.id,
        claimValueHash: target.valueHash,
        pass: "independent_corroboration_conflict",
        reviewer: REVIEWER,
        verdict: "corroborated",
        confidence: "high",
        supportingSourceIds: [originalSourceId, otherAgentSource?.id],
        contradictingSourceIds: [],
        rationale: "These sources must not cross the pass or agent trust boundary.",
      }],
      NOW,
    );
    const finding = pass2.findings.find(
      (item) =>
        item.claimId === target.id && item.pass === "independent_corroboration_conflict",
    );

    expect(finding).toMatchObject({
      verdict: "insufficient_evidence",
      supportingSourceIds: [],
      contradictingSourceIds: [],
    });
  });
});
