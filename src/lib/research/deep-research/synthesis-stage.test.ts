import { afterEach, describe, expect, it, vi } from "vitest";

const providerState = vi.hoisted(() => ({
  generate: vi.fn(),
  isMock: false,
}));

vi.mock("@/lib/providers/provider-registry", () => ({
  selectProvider: () => ({
    id: "live-model",
    displayName: "Live model",
    isMock: providerState.isMock,
    supportsStreaming: false,
    generate: providerState.generate,
  }),
}));

import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import {
  applyClaimAdjudicationPass,
  applyClaimReviewPass,
  initializeDeepValidation,
  registerTrustedReviewSources,
} from "@/lib/research/deep-validation";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import type {
  ClaimReviewSource,
  ClaimReviewerIdentity,
  ResearchSession,
  SourceCitation,
  SynthesisOutput,
} from "@/lib/schema/research-schema";
import { runDeepSynthesisStage } from "./synthesis-stage";

const sessionIds: string[] = [];

const reviewer = (id: string): ClaimReviewerIdentity => ({
  reviewerId: id,
  providerId: "review-provider",
  model: "review-model",
  promptVersion: `v1:${id}`,
});

async function validatedSession(): Promise<ResearchSession> {
  const session = createResearchSession("AI finance operations platform", ["finance", "AI"], undefined, {
    mode: "deep",
  });
  sessionIds.push(session.id);
  const market = await mockResearchProvider.generate("market-sizer", {
    query: session.query,
    keywords: session.keywords,
  });
  session.agents["market-sizer"] = {
    ...session.agents["market-sizer"],
    status: "done",
    progress: 100,
    currentStep: "Complete",
    output: market,
    resolvedProviderId: "live-model",
    degraded: false,
  };
  session.citations = [...market.citations];
  let ledger = initializeDeepValidation(session, { maxClaims: 6, maxClaimsPerAgent: 6 });

  // Register independent retrieval sources bound to each claim. The
  // corroboration pass may only cite independent_retrieval sources (not the
  // agent's own citations), and each must declare which claim(s) it supports.
  const independentSources: ClaimReviewSource[] = ledger.claims
    .slice(0, 2)
    .flatMap((claim, sourceIndex) => [
      {
        id: `ind_${sourceIndex}_a_${claim.id}`,
        title: `Independent source ${sourceIndex}A`,
        url: `https://ind${sourceIndex}a.example.com/evidence`,
        snippet: `Independent corroboration for ${claim.fieldPath}.`,
        accessedAt: new Date().toISOString(),
        confidence: "medium" as const,
        agent: claim.agentId,
        origin: "independent_retrieval" as const,
        claimIds: [claim.id],
      },
      {
        id: `ind_${sourceIndex}_b_${claim.id}`,
        title: `Independent source ${sourceIndex}B`,
        url: `https://ind${sourceIndex}b.example.com/evidence`,
        snippet: `Second independent source for ${claim.fieldPath}.`,
        accessedAt: new Date().toISOString(),
        confidence: "medium" as const,
        agent: claim.agentId,
        origin: "independent_retrieval" as const,
        claimIds: [claim.id],
      },
    ]);
  if (independentSources.length < 2) throw new Error("fixture requires two independent sources");
  ledger = registerTrustedReviewSources(ledger, independentSources);

  // Map each claim to its dedicated independent source for corroboration.
  const claimIndependentSource = new Map(
    ledger.claims.map((claim, index) => {
      const source = independentSources[index % independentSources.length];
      return [claim.id, source.id];
    }),
  );

  ledger = applyClaimReviewPass(
    ledger,
    "claim_source_entailment",
    ledger.claims.map((claim) => ({
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      pass: "claim_source_entailment",
      reviewer: reviewer("entailment"),
      verdict: claim.sourceIds.length > 0 ? "entailed" : "insufficient_evidence",
      confidence: "medium",
      supportingSourceIds: claim.sourceIds.slice(0, 1),
      contradictingSourceIds: [],
      rationale: "The cited source supports the bounded claim.",
    })),
  );
  ledger = applyClaimReviewPass(
    ledger,
    "independent_corroboration_conflict",
    ledger.claims.map((claim) => ({
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      pass: "independent_corroboration_conflict",
      reviewer: reviewer("corroboration"),
      verdict: "corroborated",
      confidence: "medium",
      supportingSourceIds: [claimIndependentSource.get(claim.id)!],
      contradictingSourceIds: [],
      rationale: "A second review corroborates the bounded claim.",
    })),
  );
  ledger = applyClaimAdjudicationPass(
    ledger,
    ledger.claims.map((claim) => ({
      claimId: claim.id,
      claimValueHash: claim.valueHash,
      reviewer: reviewer("adjudicator"),
      disposition: "supported",
      confidence: "medium",
      supportingSourceIds: [claimIndependentSource.get(claim.id)!],
      contradictingSourceIds: [],
      limitations: [],
    })),
  );
  session.validation = ledger;
  return session;
}

function synthesisOutput(citations: SourceCitation[]): SynthesisOutput {
  return {
    agent: "synthesis",
    execSummary: "Validated evidence supports a bounded market opportunity.",
    opportunityScore: 72,
    riskScore: 46,
    keyInsights: [
      { insight: "Evidence-backed demand exists.", supportingAgents: ["market-sizer"], confidence: "medium" },
    ],
    topThreeOpportunities: [1, 2, 3].map((index) => ({
      title: `Opportunity ${index}`,
      description: "A bounded opportunity.",
      rationale: "Supported by eligible evidence.",
    })),
    topThreeRisks: [1, 2, 3].map((index) => ({
      title: `Risk ${index}`,
      description: "A bounded execution risk.",
      mitigation: "Validate with a focused pilot.",
    })),
    recommendedNextStep: "Run a focused customer validation pilot.",
    launchlensBrief: "Build and validate a focused finance operations pilot.",
    citations,
  };
}

afterEach(() => {
  providerState.generate.mockReset();
  providerState.isMock = false;
  for (const id of sessionIds.splice(0)) deleteSession(id);
});

describe("runDeepSynthesisStage", () => {
  it("uses eligible claims as the sole decision authority and canonicalizes citations", async () => {
    const session = await validatedSession();
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    // The source catalog contains only sources referenced by eligible claims'
    // supportingSourceIds -- i.e. the independent retrieval sources, not the
    // agent's own citations. Pick two from the catalog for the canonicalization
    // assertion.
    const eligibleSourceIds = new Set(
      session.validation.adjudications
        .filter((a) => a.synthesisEligible)
        .flatMap((a) => a.supportingSourceIds),
    );
    const allowed = session.validation.reviewSources
      .filter((source) => eligibleSourceIds.has(source.id))
      .slice(0, 2);
    if (allowed.length < 2) throw new Error("fixture requires two catalog sources");
    const invented: SourceCitation = {
      id: "invented",
      title: "Invented",
      url: "https://invented.example",
      snippet: "Invented source",
      accessedAt: new Date().toISOString(),
      confidence: "high",
      agent: "synthesis",
    };
    providerState.generate.mockResolvedValue(
      synthesisOutput([
        { ...allowed[0], agent: "synthesis", title: "model-mutated title" },
        { ...allowed[1], agent: "synthesis" },
        invented,
      ]),
    );

    const result = await runDeepSynthesisStage(session);

    expect(providerState.generate).toHaveBeenCalledTimes(1);
    const context = providerState.generate.mock.calls[0][1];
    expect(context.upstream).toEqual([]);
    expect(JSON.parse(context.validationSummary)).toMatchObject({
      scope: "claim_evidence_support",
      factualAccuracy: "not_established",
    });
    expect(result.agents.synthesis.output?.citations.map((citation) => citation.id))
      .toEqual(allowed.map((source) => source.id));
    expect(result.agents.synthesis.output?.citations[0].title).toBe(allowed[0].title);
    expect(JSON.stringify(result.agents.synthesis.output)).not.toContain("invented.example");
  });

  it("rejects a provider that silently falls back", async () => {
    const session = await validatedSession();
    providerState.generate.mockImplementation(async (_agentId, context) => {
      context.onFallback?.("http_error", { status: 401 });
      return synthesisOutput([]);
    });
    await expect(runDeepSynthesisStage(session)).rejects.toMatchObject({
      code: "synthesis_provider_http_error",
      retryable: false,
    });
  });

  it("fails before model execution when a persisted claim valueHash binding is corrupted", async () => {
    const session = await validatedSession();
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    const claim = session.validation.claims[0];
    if (!claim) throw new Error("fixture requires a claim");
    claim.valueHash = `tampered_${claim.valueHash}`;

    await expect(runDeepSynthesisStage(session)).rejects.toMatchObject({
      code: "semantic_validation_incomplete",
      retryable: false,
    });
    expect(providerState.generate).not.toHaveBeenCalled();
  });

  it("fails before model execution when three-pass validation is absent", async () => {
    const session = createResearchSession("not validated", [], undefined, { mode: "deep" });
    sessionIds.push(session.id);
    await expect(runDeepSynthesisStage(session)).rejects.toMatchObject({
      code: "semantic_validation_incomplete",
      retryable: false,
    });
    expect(providerState.generate).not.toHaveBeenCalled();
  });
});
