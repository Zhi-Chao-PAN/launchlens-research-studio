import { describe, it, expect } from "vitest";
import {
  toLaunchLensBrief,
  serializeBrief,
  buildReportUrl,
  getLaunchLensAiUrl,
  getResearchStudioUrl,
  LAUNCHLENS_BRIEF_SCHEMA_VERSION,
  LAUNCHLENS_FIELD_MAX,
  LAUNCHLENS_IDEA_MIN,
} from "@/lib/export/brief-mapper";
import { briefHashFor, encodeBase64UrlUtf8, BRIEF_HASH_PREFIX } from "@/lib/export/base64url";
import type {
  AgentId,
  AgentOutput,
  ClaimReviewerIdentity,
  ResearchSession,
  SynthesisOutput,
} from "@/lib/schema/research-schema";
import {
  initializeDeepValidation,
  applyClaimAdjudicationPass,
  applyClaimReviewPass,
} from "@/lib/research/deep-validation";

// A fully-populated session fixture mirroring the shape research-engine leaves
// behind after a successful 6-agent run. Built once, reused with overrides.
function fullOutputs(): Record<AgentId, AgentOutput> {
  return {
    "market-sizer": {
      agent: "market-sizer",
      summary: "Sizing summary",
      marketSize: { tam: 5_000_000_000, sam: 800_000_000, som: 50_000_000, currency: "USD", growthRate: 18, growthTrend: "accelerating", unit: "revenue", sources: [], confidence: "high" },
      keyTrends: [],
      targetSegments: [
        { name: "Indie SaaS founders", size: 120000, description: "Solo or two-person teams shipping B2B tools" },
      ],
      citations: [],
    },
    "competitor-analyst": {
      agent: "competitor-analyst",
      summary: "Comp summary",
      competitors: [
        { id: "c1", name: "AcmeCorp", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "mid-market", differentiation: "x", citations: [] },
        { id: "c2", name: "BetaCo", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "niche", differentiation: "x", citations: [] },
      ],
      competitiveMatrix: [],
      gaps: [{ gap: "No mobile-first onboarding", opportunity: "Ship a mobile-native flow", difficulty: "medium" }],
      citations: [],
    },
    "pain-detective": {
      agent: "pain-detective",
      summary: "Pain summary",
      painPoints: [],
      unmetNeeds: [{ need: "Real-time churn signal", whyUnmet: "Existing tools are batch", opportunity: "Stream signals" }],
      userPersonas: [
        { name: "Solo Founder", role: "CEO", goals: ["Ship faster"], frustrations: ["Too many tools"] },
        { name: "Growth Lead", role: "Marketing", goals: ["Reduce churn"], frustrations: ["No data"] },
      ],
      citations: [],
    },
    "pricing-scout": {
      agent: "pricing-scout",
      summary: "Pricing summary",
      priceBands: [],
      competitorPricing: [],
      monetizationModels: [],
      willingnessToPay: [],
      recommendations: [
        { tier: "Starter", price: 29, rationale: "Below AcmeCorp entry to lower switching cost", period: "monthly" },
        { tier: "Pro", price: 79, rationale: "Captures willingness-to-pay from growth teams", period: "monthly" },
      ],
      citations: [],
    },
    "channel-scout": {
      agent: "channel-scout",
      summary: "Channel summary",
      channels: [],
      communityHubs: [],
      contentTopics: [],
      recommendedChannels: [],
      citations: [],
    },
    synthesis: {
      agent: "synthesis",
      execSummary: "A focused opportunity in indie SaaS onboarding with clear willingness to pay.",
      opportunityScore: 78,
      riskScore: 42,
      keyInsights: [],
      topThreeOpportunities: [{ title: "Mobile-first onboarding gap", description: "d", rationale: "r" }],
      topThreeRisks: [{ title: "AcmeCorp may ship mobile", description: "d", mitigation: "Ship faster and own the niche" }],
      recommendedNextStep: "Validate with 10 founders",
      launchlensBrief: "legacy free-text brief — should not be used by the structured mapper",
      citations: [],
    },
  };
}

function buildSession(overrides: Partial<ResearchSession> = {}): ResearchSession {
  const outputs = fullOutputs();
  const agents = {} as ResearchSession["agents"];
  (Object.keys(outputs) as AgentId[]).forEach((id) => {
    agents[id] = { id, status: "done", progress: 100, currentStep: "Done", output: outputs[id] };
  });
  return {
    id: "sess-abc123",
    query: "AI onboarding analyst for indie SaaS founders",
    keywords: ["onboarding", "saas"],
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:05:00Z",
    status: "completed",
    agents,
    citations: [],
    ...overrides,
  };
}

describe("toLaunchLensBrief — envelope", () => {
  it("stamps schema version and source", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.schemaVersion).toBe(LAUNCHLENS_BRIEF_SCHEMA_VERSION);
    expect(brief.source).toBe("launchlens-research-studio");
  });

  it("carries session id and query for provenance", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.sessionId).toBe("sess-abc123");
    expect(brief.query).toBe("AI onboarding analyst for indie SaaS founders");
  });

  it("emits an ISO exportedAt timestamp", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe("toLaunchLensBrief — field mapping", () => {
  it("maps idea from query + exec summary", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea).toContain("AI onboarding analyst for indie SaaS founders");
    expect(brief.input.idea).toContain("focused opportunity in indie SaaS onboarding");
  });

  it("maps audience from pain personas + market segments", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.audience).toContain("Solo Founder");
    expect(brief.input.audience).toContain("Growth Lead");
    expect(brief.input.audience).toContain("Indie SaaS founders");
  });

  it("maps market from TAM/growth + competitors + gaps", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.market).toContain("$5B");
    expect(brief.input.market).toContain("18%/yr");
    expect(brief.input.market).toContain("AcmeCorp");
    expect(brief.input.market).toContain("No mobile-first onboarding");
  });

  it("maps constraints from pricing recs + unmet needs + risks", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.constraints).toContain("Starter");
    expect(brief.input.constraints).toContain("Real-time churn signal");
    expect(brief.input.constraints).toContain("AcmeCorp may ship mobile");
  });

  it("uses the fixed default tone (no tone agent exists)", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.tone).toBe("Practical, crisp, and founder-friendly");
  });

  it("records opportunity/risk scores and completed agents in meta", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.meta.opportunityScore).toBe(78);
    expect(brief.meta.riskScore).toBe(42);
    expect(brief.meta.completedAgents).toContain("market-sizer");
    expect(brief.meta.completedAgents).toContain("synthesis");
  });
});

// ISO timestamp for deterministic test fixtures.
const NOW = "2026-07-13T00:00:00.000Z";
const REVIEWER: ClaimReviewerIdentity = {
  reviewerId: "brief-mapper-reviewer",
  providerId: "test-provider",
  model: "test-model",
  promptVersion: "brief-mapper-v1",
};

describe("toLaunchLensBrief — Deep validation boundary", () => {
  /**
   * R2C: build a real V2-shaped ledger via the production flow so it
   * passes the full `isValidationLedgerV2` predicate. The pre-R2C
   * version of this helper hand-rolled a V2-shaped object that the
   * canonical predicate would now reject.
   *
   * The simplest production path is:
   *   1) initialize with N claims, M admitted sources per claim
   *   2) run Pass 1 with each finding citing an admitted source
   *   3) register one independent source per claim
   *   4) run Pass 2 with each finding citing the bound independent source
   *   5) run the adjudication pass
   *
   * To get a specific disposition matrix (e.g. "1 supported, 2 unsupported"),
   * we drive each Pass-1 verdict to the value that yields the wanted
   * Pass-2 / adjudication outcome. A claim is `unsupported` when Pass 1
   * reports "not_entailed" and Pass 2 reports "insufficient_evidence";
   * `supported` when Pass 1 says "entailed" and Pass 2 says
   * "corroborated".
   */
  function deepValidation(
    dispositions: Array<{
      id: string;
      agentId: Exclude<AgentId, "synthesis">;
      fieldPath: string;
      text: string;
      disposition: "supported" | "partially_supported" | "unsupported";
    }>,
  ): NonNullable<ResearchSession["validation"]> {
    const session = buildSession({ mode: "deep" });
    const initial = initializeDeepValidation(session, {
      maxClaims: dispositions.length,
      maxClaimsPerAgent: dispositions.length,
    });
    // Re-key the bounded claims for the assertion and attach one trusted,
    // same-agent admitted source per claim. The production sanitizer owns
    // all later evidence bindings; tests never hand-roll a finished ledger.
    const claims = initial.claims.map((claim, index) => {
      const intent = dispositions[index]!;
      return {
        ...claim,
        id: intent.id,
        agentId: intent.agentId,
        fieldPath: intent.fieldPath,
        text: intent.text,
        sourceIds: [`admitted-${intent.id}`],
      };
    });
    const admittedSources = claims.map((claim) => ({
      id: `admitted-${claim.id}`,
      title: `Admitted evidence for ${claim.id}`,
      url: `https://admitted.example/${claim.id}`,
      snippet: `Admitted evidence for ${claim.id}.`,
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: claim.agentId,
      origin: "retrieved_evidence" as const,
    }));
    const ledgerWithAdaptedClaims = {
      ...initial,
      claims,
      reviewSources: admittedSources,
    };

    const sourceFor = (claimId: string) =>
      claims.find((c) => c.id === claimId)?.sourceIds[0];

    // Build per-disposition Pass 1 findings.
    const pass1Findings = claims.map((claim, index) => {
      const intent = dispositions[index]!;
      const isUnsupported = intent.disposition === "unsupported";
      const isPartial = intent.disposition === "partially_supported";
      return {
        claimId: claim.id,
        claimValueHash: claim.valueHash,
        pass: "claim_source_entailment" as const,
        reviewer: REVIEWER,
        verdict: (isUnsupported
          ? "not_entailed"
          : isPartial
            ? "partially_entailed"
            : "entailed") as
          | "not_entailed"
          | "partially_entailed"
          | "entailed",
        confidence: (isUnsupported ? "low" : "medium") as "low" | "medium",
        supportingSourceIds: isUnsupported ? [] : [sourceFor(claim.id)!],
        contradictingSourceIds: [],
        rationale: isUnsupported
          ? "Source does not entail the claim."
          : "Source entails the claim.",
      };
    });

    const pass1 = applyClaimReviewPass(
      ledgerWithAdaptedClaims,
      "claim_source_entailment",
      pass1Findings,
      NOW,
    );

    // Register an independent source per claim, bound by claimIds.
    const independentSources = claims.map((claim) => ({
      id: `indep-${claim.id}`,
      title: `Independent evidence for ${claim.id}`,
      url: `https://independent.example/${claim.id}`,
      snippet: `Independent corroboration of ${claim.id}.`,
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: claim.agentId,
      origin: "independent_retrieval" as const,
      claimIds: [claim.id],
    }));
    const pass1WithIndep = {
      ...pass1,
      reviewSources: [...pass1.reviewSources, ...independentSources],
    };

    // Build Pass 2 findings.
    const pass2Findings = claims.map((claim, index) => {
      const intent = dispositions[index]!;
      const indepId = independentSources.find((s) => s.claimIds.includes(claim.id))!.id;
      if (intent.disposition === "unsupported") {
        return {
          claimId: claim.id,
          claimValueHash: claim.valueHash,
          pass: "independent_corroboration_conflict" as const,
          reviewer: REVIEWER,
          verdict: "insufficient_evidence" as const,
          confidence: "low" as const,
          supportingSourceIds: [],
          contradictingSourceIds: [],
          rationale: "No independent source corroborates the claim.",
        };
      }
      return {
        claimId: claim.id,
        claimValueHash: claim.valueHash,
        pass: "independent_corroboration_conflict" as const,
        reviewer: REVIEWER,
        verdict: "corroborated" as const,
        confidence: "high" as const,
        supportingSourceIds: [indepId],
        contradictingSourceIds: [],
        rationale: "Independent source corroborates the claim.",
      };
    });
    const pass2 = applyClaimReviewPass(
      pass1WithIndep,
      "independent_corroboration_conflict",
      pass2Findings,
      NOW,
    );

    // Adjudication pass: the test's intent is the per-claim disposition.
    const adjudications = claims.map((claim, index) => {
      const intent = dispositions[index]!;
      const indepId = independentSources.find((s) => s.claimIds.includes(claim.id))!.id;
      return {
        claimId: claim.id,
        claimValueHash: claim.valueHash,
        reviewer: REVIEWER,
        disposition: intent.disposition,
        confidence: (intent.disposition === "unsupported" ? "low" : "medium") as
          | "low"
          | "medium",
        supportingSourceIds:
          intent.disposition === "unsupported" ? [] : [indepId],
        contradictingSourceIds: [],
        reviewedPasses: [
          "claim_source_entailment",
          "independent_corroboration_conflict",
        ] as const,
        synthesisEligible:
          intent.disposition === "supported" || intent.disposition === "partially_supported",
        limitations:
          intent.disposition === "partially_supported"
            ? ["Only partial entailment was established."]
            : [],
      };
    });
    const finalLedger = applyClaimAdjudicationPass(pass2, adjudications, NOW);
    return finalLedger as unknown as NonNullable<ResearchSession["validation"]>;
  }

  it("does not re-export rejected TAM, growth, or pricing from raw specialist outputs", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepValidation([
        {
          id: "tam",
          agentId: "market-sizer",
          fieldPath: "/marketSize/tam",
          text: "TAM is 5000000000 USD.",
          disposition: "unsupported",
        },
        {
          id: "pricing",
          agentId: "pricing-scout",
          fieldPath: "/recommendations/0",
          text: "Recommended Starter price is 29 USD.",
          disposition: "unsupported",
        },
        {
          id: "pain",
          agentId: "pain-detective",
          fieldPath: "/painPoints/0",
          text: "Users report evidence trust concerns.",
          disposition: "partially_supported",
        },
      ]),
    });

    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);

    expect(serialized).not.toContain("$5B");
    expect(serialized).not.toContain("18%/yr");
    expect(serialized).not.toContain("Starter");
    expect(serialized).not.toContain("$29");
    expect(brief.input.market).toMatch(/remain unverified/i);
    expect(brief.input.constraints).toContain("0/3 fully supported");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });

  it("admits a fully supported Deep claim without reviving adjacent rejected fields", () => {
    // R2C: this test now drives the deterministic adjudicator via the
    // production pipeline (initializeDeepValidation -> Pass 1 -> Pass 2
    // -> adjudication). The pre-R2C version hand-rolled a V2 ledger
    // and trusted the test's `disposition`; the new contract uses the
    // canonical adjudicator to derive the disposition, so we drive
    // the policy through the findings.
    const session = buildSession({ mode: "deep" });
    const initial = initializeDeepValidation(session, { maxClaims: 2, maxClaimsPerAgent: 2 });
    // Re-key the initial claims to TAM + pricing with intent matching
    // the test's expectations. valueHash is preserved from the
    // initializer so the claimValueHash bindings stay valid.
    const adaptedClaims = initial.claims.map((claim, index) =>
      index === 0
        ? {
            ...claim,
            id: "tam",
            agentId: "market-sizer" as const,
            fieldPath: "/marketSize/tam",
            text: "TAM is 5000000000 USD from the cited category report.",
          }
        : {
            ...claim,
            id: "pricing",
            agentId: "pricing-scout" as const,
            fieldPath: "/recommendations/0",
            text: "Recommended Starter price is 29 USD.",
          },
    );
    const ledgerWithAdaptedClaims = { ...initial, claims: adaptedClaims };
    // The V2 ledger needs admitted sources for the supported claim
    // and an independent source bound to each claim. We register
    // them as `retrieved_evidence` and `independent_retrieval`
    // directly so the test doesn't depend on a populated
    // session.evidence.agents.
    const admittedSource = {
      id: "src-tam",
      title: "TAM source",
      url: "https://e.example/tam",
      snippet: "TAM is 5000000000 USD.",
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: "market-sizer" as const,
      origin: "retrieved_evidence" as const,
    };
    const tamClaim = adaptedClaims[0]!;
    const pricingClaim = adaptedClaims[1]!;
    const tamClaimWithSource = { ...tamClaim, sourceIds: [admittedSource.id] };
    const ledgerWithSource = {
      ...ledgerWithAdaptedClaims,
      claims: [tamClaimWithSource, pricingClaim],
      reviewSources: [admittedSource],
    };
    // Register one independent source per claim.
    const indepTam = {
      id: "indep-tam",
      title: "Independent TAM",
      url: "https://e.example/indep-tam",
      snippet: "Independent corroboration of TAM.",
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: "market-sizer" as const,
      origin: "independent_retrieval" as const,
      claimIds: ["tam"],
    };
    const indepPricing = {
      id: "indep-pricing",
      title: "Independent Pricing",
      url: "https://e.example/indep-pricing",
      snippet: "No independent corroboration of pricing.",
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: "pricing-scout" as const,
      origin: "independent_retrieval" as const,
      claimIds: ["pricing"],
    };
    const ledgerWithIndep = {
      ...ledgerWithSource,
      reviewSources: [admittedSource, indepTam, indepPricing],
    };
    // Pass 1: TAM entailed, pricing not_entailed.
    const pass1 = applyClaimReviewPass(ledgerWithIndep, "claim_source_entailment", [
      {
        claimId: "tam",
        claimValueHash: tamClaimWithSource.valueHash,
        pass: "claim_source_entailment" as const,
        reviewer: REVIEWER,
        verdict: "entailed" as const,
        confidence: "medium" as const,
        supportingSourceIds: [admittedSource.id],
        contradictingSourceIds: [],
        rationale: "Source entails the TAM claim.",
      },
      {
        claimId: "pricing",
        claimValueHash: pricingClaim.valueHash,
        pass: "claim_source_entailment" as const,
        reviewer: REVIEWER,
        verdict: "not_entailed" as const,
        confidence: "low" as const,
        supportingSourceIds: [],
        contradictingSourceIds: [],
        rationale: "No admitted source entails the pricing claim.",
      },
    ], NOW);
    // Pass 2: TAM corroborated, pricing insufficient_evidence.
    const pass2 = applyClaimReviewPass(pass1, "independent_corroboration_conflict", [
      {
        claimId: "tam",
        claimValueHash: tamClaimWithSource.valueHash,
        pass: "independent_corroboration_conflict" as const,
        reviewer: REVIEWER,
        verdict: "corroborated" as const,
        confidence: "high" as const,
        supportingSourceIds: [indepTam.id],
        contradictingSourceIds: [],
        rationale: "Independent corroboration of TAM.",
      },
      {
        claimId: "pricing",
        claimValueHash: pricingClaim.valueHash,
        pass: "independent_corroboration_conflict" as const,
        reviewer: REVIEWER,
        verdict: "insufficient_evidence" as const,
        confidence: "low" as const,
        supportingSourceIds: [],
        contradictingSourceIds: [],
        rationale: "No independent corroboration of pricing.",
      },
    ], NOW);
    // The third pass still requires one bounded reviewer record per claim;
    // the application then derives the authoritative dispositions.
    const finalLedger = applyClaimAdjudicationPass(pass2, [
      {
        claimId: "tam",
        claimValueHash: tamClaimWithSource.valueHash,
        reviewer: REVIEWER,
        disposition: "supported",
        confidence: "high",
        limitations: [],
      },
      {
        claimId: "pricing",
        claimValueHash: pricingClaim.valueHash,
        reviewer: REVIEWER,
        disposition: "insufficient_evidence",
        confidence: "low",
        limitations: [],
      },
    ], NOW);
    const brief = toLaunchLensBrief(buildSession({
      mode: "deep",
      validation: finalLedger as unknown as NonNullable<ResearchSession["validation"]>,
    }));
    // R2C: the supported TAM claim is now admitted (per the
    // deterministic adjudicator); the unsupported pricing claim is
    // rejected from the brief.
    expect(brief.input.market).toContain("TAM is 5000000000 USD");
    expect(brief.input.constraints).not.toContain("Starter");
  });

  it("never imports raw synthesis scores or next-step even after the claim threshold is met", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepValidation([
        {
          id: "tam",
          agentId: "market-sizer",
          fieldPath: "/marketSize/tam",
          text: "TAM is 5000000000 USD.",
          disposition: "supported",
        },
        {
          id: "competitor",
          agentId: "competitor-analyst",
          fieldPath: "/competitors/0",
          text: "A direct competitor serves the mid-market segment.",
          disposition: "supported",
        },
        {
          id: "pain",
          agentId: "pain-detective",
          fieldPath: "/unmetNeeds/0",
          text: "Users need real-time churn signals.",
          disposition: "supported",
        },
      ]),
    });
    session.agents.synthesis = {
      id: "synthesis",
      status: "done",
      progress: 100,
      currentStep: "Done",
      output: {
        agent: "synthesis",
        execSummary: "POISON_THRESHOLD_EXEC_SUMMARY",
        opportunityScore: 99,
        riskScore: 1,
        keyInsights: [],
        topThreeOpportunities: [],
        topThreeRisks: [],
        recommendedNextStep: "POISON_THRESHOLD_NEXT_STEP",
        launchlensBrief: "",
        citations: [],
      },
    };

    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);

    expect(serialized).not.toContain("POISON_THRESHOLD_EXEC_SUMMARY");
    expect(serialized).not.toContain("POISON_THRESHOLD_NEXT_STEP");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(brief.input.constraints).toContain("collect primary evidence");
  });

  // P1-1 regression: Deep mode with NO validation ledger must fail-closed.
  // It must never fall through to the Standard branch, which would export
  // unverified TAM, pricing, pain points, and synthesis scores.
  it("fail-closes when Deep mode has no validation ledger (poison-token regression)", () => {
    const session = buildSession({ mode: "deep" });
    // Poison tokens that would only appear if the Standard branch ran.
    const synthesis = session.agents.synthesis.output as SynthesisOutput;

    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);

    // No specialist-derived figures may enter the brief.
    expect(serialized).not.toContain("$5B");
    expect(serialized).not.toContain("18%/yr");
    expect(serialized).not.toContain("AcmeCorp");
    expect(serialized).not.toContain("Starter");
    expect(serialized).not.toContain("$29");
    expect(serialized).not.toContain("Solo Founder");
    // No synthesis prose may enter the brief either.
    expect(serialized).not.toContain(synthesis.execSummary);
    expect(serialized).not.toContain(synthesis.recommendedNextStep);
    expect(serialized).not.toContain(synthesis.launchlensBrief);
    // Scores must be null -- the synthesis has not been evidence-validated.
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    // The query is always preserved.
    expect(brief.input.idea).toContain("AI onboarding analyst");
  });

  // P1-1 regression: Deep mode with a V1 (unsupported) validation ledger
  // must also fail-closed.
  it("fail-closes when Deep mode has a V1 validation ledger (poison-token regression)", () => {
    const session = buildSession({
      mode: "deep",
      validation: { version: 1 } as unknown as ResearchSession["validation"],
    });

    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);

    expect(serialized).not.toContain("$5B");
    expect(serialized).not.toContain("Starter");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });

  // P1-2 regression: when Deep evidence exists but is insufficient, synthesis
  // prose (execSummary, recommendedNextStep) must NOT leak into the brief.
  it("does not leak synthesis execSummary or next-step when Deep evidence is insufficient (poison-token regression)", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepValidation([
        {
          id: "tam",
          agentId: "market-sizer",
          fieldPath: "/marketSize/tam",
          text: "TAM is 5000000000 USD.",
          disposition: "unsupported",
        },
      ]),
    });
    const synthesis = session.agents.synthesis.output as SynthesisOutput;

    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);

    // execSummary must not appear in the idea field.
    expect(brief.input.idea).not.toContain(synthesis.execSummary);
    // recommendedNextStep must not appear in the constraints field.
    expect(brief.input.constraints).not.toContain(synthesis.recommendedNextStep);
    // The serialized brief must not contain the execSummary anywhere.
    expect(serialized).not.toContain(synthesis.execSummary);
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });
});

describe("toLaunchLensBrief — truncation", () => {
  it("compresses rich agent outputs before falling back to visible truncation", () => {
    const rich = buildSession({
      query:
        "AI portfolio automation workspace for computer science students preparing international AI master applications and product-engineering careers",
      agents: {
        ...buildSession().agents,
        "market-sizer": {
          id: "market-sizer",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["market-sizer"] as any),
            marketSize: {
              tam: 1_500_000_000,
              sam: 180_000_000,
              som: 24_000_000,
              currency: "USD",
              growthRate: 28.5,
              growthTrend: "accelerating",
              unit: "revenue",
              sources: [],
              confidence: "medium",
            },
            targetSegments: [
              {
                name: "International AI master's applicants",
                size: 600000,
                description:
                  "CS students applying to selective AI programs across the US, UK, Europe, Singapore, and Australia with many parallel application artifacts",
              },
              {
                name: "Product-engineering career switchers",
                size: 240000,
                description:
                  "Builders translating ML projects into product stories for AI product engineer or full-stack agent architect roles",
              },
            ],
          },
        },
        "competitor-analyst": {
          id: "competitor-analyst",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["competitor-analyst"] as any),
            competitors: [
              { ...(fullOutputs()["competitor-analyst"] as any).competitors[0], name: "GitHub" },
              { ...(fullOutputs()["competitor-analyst"] as any).competitors[1], name: "Replit" },
              { ...(fullOutputs()["competitor-analyst"] as any).competitors[1], id: "c3", name: "Portfolium" },
            ],
            gaps: [
              {
                gap:
                  "No product unifies GitHub-grade project evidence, program-specific master's application positioning, and product-engineering narrative translation",
                opportunity: "Own the GitHub-to-application workflow",
                difficulty: "medium",
              },
            ],
          },
        },
        "pain-detective": {
          id: "pain-detective",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["pain-detective"] as any),
            unmetNeeds: [
              {
                need: "Translate scattered ML artifacts into a coherent AI product-engineering narrative",
                whyUnmet: "Generic portfolio tools do not understand admissions and product framing",
                opportunity: "Narrative automation",
              },
            ],
            userPersonas: [
              {
                name: "Final-year CS applicant",
                role: "International AI master's candidate",
                goals: ["Turn GitHub, Kaggle, papers, and demos into a selective-program application story"],
                frustrations: ["Application artifacts are scattered and hard to prioritize"],
              },
              {
                name: "AI product-engineering career switcher",
                role: "Builder repositioning ML work for product roles",
                goals: ["Explain technical work as shipped product impact"],
                frustrations: ["General resume tools sound generic"],
              },
            ],
          },
        },
        "pricing-scout": {
          id: "pricing-scout",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["pricing-scout"] as any),
            recommendations: [
              {
                tier: "Student Pro",
                price: 19,
                rationale:
                  "Low enough for international students while monetizing serious applicants who need multi-program customization",
                period: "monthly",
              },
              {
                tier: "Applicant",
                price: 49,
                rationale:
                  "Captures higher WTP from students applying to many selective programs and needing recommender coordination",
                period: "monthly",
              },
            ],
          },
        },
        synthesis: {
          id: "synthesis",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs().synthesis as SynthesisOutput),
            execSummary:
              "An AI portfolio automation workspace targeting CS students preparing international AI master's applications sits in a fast-growing but fragmented niche with no incumbent owning the GitHub-to-application workflow.",
            opportunityScore: 72,
            riskScore: 52,
            topThreeOpportunities: [
              {
                title: "End-to-end GitHub-to-application pipeline",
                description: "d",
                rationale: "r",
              },
            ],
            topThreeRisks: [
              {
                title: "Free-substitute pressure from Notion, GitHub, and ChatGPT",
                description: "d",
                mitigation:
                  "Differentiate with program-specific templates, GitHub ingestion, and recommender coordination",
              },
            ],
          },
        },
      },
    });

    const brief = toLaunchLensBrief(rich);

    expect(brief.meta.truncated).toEqual([]);
    expect(brief.input.idea.length).toBeLessThanOrEqual(500);
    expect(brief.input.audience.length).toBeLessThanOrEqual(240);
    expect(brief.input.market.length).toBeLessThanOrEqual(120);
    expect(brief.input.constraints.length).toBeLessThanOrEqual(320);
    expect(brief.input.market).toContain("$1.5B");
    expect(brief.input.market).toContain("28.5%/yr");
    expect(brief.input.constraints).toContain("Student Pro $19");
  });

  it("does not visibly truncate an audience that exactly fits before final punctuation", () => {
    const d03Like = buildSession({
      agents: {
        ...buildSession().agents,
        "market-sizer": {
          id: "market-sizer",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["market-sizer"] as Extract<AgentOutput, { agent: "market-sizer" }>),
            targetSegments: [
              {
                name: "International CS undergraduates applying to AI",
                size: 120000,
                description: "Students preparing international applications.",
              },
              {
                name: "Domestic AI master's applicants (US/UK/Canada)",
                size: 80000,
                description: "Applicants targeting selective domestic and international programs.",
              },
            ],
          },
        },
        "pain-detective": {
          id: "pain-detective",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            ...(fullOutputs()["pain-detective"] as Extract<AgentOutput, { agent: "pain-detective" }>),
            userPersonas: [
              {
                name: "The Ambitious Applicant",
                role: "Junior or senior CS undergraduate",
                goals: ["Build an AI portfolio for applications."],
                frustrations: ["Fragmented projects and recommender material."],
              },
              {
                name: "The International Career Switcher",
                role: "Working software engineer (3-6 years out of school)",
                goals: ["Show credible AI engineering progression."],
                frustrations: ["Unclear portfolio standards."],
              },
            ],
          },
        },
      },
    });

    const brief = toLaunchLensBrief(d03Like);

    expect(brief.input.audience.length).toBeLessThanOrEqual(240);
    expect(brief.meta.truncated).not.toContain("audience");
    expect(brief.input.audience).not.toContain("…");
  });

  it("clamps every field to the launchlens limit", () => {
    const long = "x".repeat(LAUNCHLENS_FIELD_MAX + 500);
    const session = buildSession({
      query: long,
      agents: {
        ...buildSession().agents,
        synthesis: { id: "synthesis", status: "done", progress: 100, currentStep: "Done", output: { ...fullOutputs().synthesis as SynthesisOutput, execSummary: long } },
      },
    });
    const brief = toLaunchLensBrief(session);
    for (const field of ["idea", "audience", "market", "constraints"] as const) {
      expect(brief.input[field].length).toBeLessThanOrEqual(LAUNCHLENS_FIELD_MAX);
    }
    // tone is a fixed short string, never truncated
    expect(brief.meta.truncated).not.toContain("tone");
    expect(brief.meta.truncated.length).toBeGreaterThan(0);
  });

  it("does not mark truncation when nothing was cut", () => {
    // Use a session whose agent outputs are short enough to fit every field's
    // advisory limit (idea≤500, audience≤240, market≤120, constraints≤320).
    // The shared fullOutputs() fixture's market field (TAM + 2 competitors +
    // gap + opportunity) exceeds the 120-char advisory, so it would be cut.
    const lean = buildSession({
      agents: {
        ...buildSession().agents,
        "market-sizer": {
          id: "market-sizer",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "market-sizer",
            summary: "Sizing",
            marketSize: { tam: 5_000_000_000, sam: 1, som: 1, currency: "USD", growthRate: 18, growthTrend: "accelerating", unit: "revenue", sources: [], confidence: "high" },
            keyTrends: [],
            targetSegments: [],
            citations: [],
          },
        },
        "competitor-analyst": {
          id: "competitor-analyst",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "competitor-analyst",
            summary: "Comp",
            competitors: [{ id: "c1", name: "Acme", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "mid-market", differentiation: "x", citations: [] }],
            competitiveMatrix: [],
            gaps: [],
            citations: [],
          },
        },
        synthesis: {
          id: "synthesis",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "synthesis",
            execSummary: "A focused opportunity in indie SaaS onboarding with clear willingness to pay.",
            opportunityScore: 78,
            riskScore: 42,
            keyInsights: [],
            topThreeOpportunities: [],
            topThreeRisks: [],
            recommendedNextStep: "Validate",
            launchlensBrief: "legacy",
            citations: [],
          },
        },
      },
    });
    const brief = toLaunchLensBrief(lean);
    expect(brief.meta.truncated).toEqual([]);
  });

  it("clamps each field to its advisory limit (idea 500, audience 240, market 120, constraints 320)", () => {
    // A realistic session whose agent outputs overflow every advisory limit.
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea.length).toBeLessThanOrEqual(500);
    expect(brief.input.audience.length).toBeLessThanOrEqual(240);
    expect(brief.input.market.length).toBeLessThanOrEqual(120);
    expect(brief.input.constraints.length).toBeLessThanOrEqual(320);
    expect(brief.input.tone.length).toBeLessThanOrEqual(1200);
  });
});

describe("toLaunchLensBrief — empty / missing outputs", () => {
  it("falls back to neutral copy when no agent produced output", () => {
    const emptyAgents = {} as ResearchSession["agents"];
    (["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as AgentId[]).forEach((id) => {
      emptyAgents[id] = { id, status: "idle", progress: 0, currentStep: "" };
    });
    const brief = toLaunchLensBrief(buildSession({ agents: emptyAgents }));
    // Still produces a valid five-field object...
    expect(brief.input.idea.length).toBeGreaterThanOrEqual(LAUNCHLENS_IDEA_MIN);
    expect(brief.input.audience.length).toBeGreaterThan(0);
    expect(brief.input.market.length).toBeGreaterThan(0);
    expect(brief.input.constraints.length).toBeGreaterThan(0);
    expect(brief.input.tone).toBe("Practical, crisp, and founder-friendly");
    // ...with null scores and no completed agents.
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(brief.meta.completedAgents).toEqual([]);
  });

  it("guarantees idea clears the 12-char server gate even with empty query + summary", () => {
    const emptyAgents = {} as ResearchSession["agents"];
    (["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as AgentId[]).forEach((id) => {
      emptyAgents[id] = { id, status: "idle", progress: 0, currentStep: "" };
    });
    const brief = toLaunchLensBrief(buildSession({ query: "", agents: emptyAgents }));
    expect(brief.input.idea.length).toBeGreaterThanOrEqual(LAUNCHLENS_IDEA_MIN);
    expect(brief.input.idea.length).toBeLessThanOrEqual(LAUNCHLENS_FIELD_MAX);
  });

  it("uses query alone when synthesis has no exec summary", () => {
    const session = buildSession({
      agents: {
        ...buildSession().agents,
        synthesis: { id: "synthesis", status: "done", progress: 100, currentStep: "Done", output: { ...fullOutputs().synthesis as SynthesisOutput, execSummary: "" } },
      },
    });
    const brief = toLaunchLensBrief(session);
    expect(brief.input.idea).toBe("AI onboarding analyst for indie SaaS founders");
  });

  it("does not let degraded synthesis pollute the LaunchLens handoff brief", () => {
    const session = buildSession({
      agents: {
        ...buildSession().agents,
        synthesis: {
          id: "synthesis",
          status: "done",
          progress: 100,
          currentStep: "Done",
          degraded: true,
          degradedReason: "http_error",
          output: {
            ...(fullOutputs().synthesis as SynthesisOutput),
            execSummary: "Generic AI GTM text that does not match the researched idea.",
            opportunityScore: 91,
            riskScore: 12,
          },
        },
      },
    });

    const brief = toLaunchLensBrief(session);

    expect(brief.input.idea).toBe("AI onboarding analyst for indie SaaS founders");
    expect(brief.input.idea).not.toContain("Generic AI GTM text");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(brief.meta.completedAgents).toContain("synthesis");
  });

  it("ignores the legacy free-text launchlensBrief string", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea).not.toContain("legacy free-text brief");
  });
});

describe("serializeBrief", () => {
  it("round-trips through JSON.parse", () => {
    const brief = toLaunchLensBrief(buildSession());
    const s = serializeBrief(brief);
    const parsed = JSON.parse(s);
    expect(parsed.schemaVersion).toBe(brief.schemaVersion);
    expect(parsed.source).toBe(brief.source);
    expect(parsed.input.idea).toBe(brief.input.idea);
    expect(parsed.meta.opportunityScore).toBe(brief.meta.opportunityScore);
  });

  it("produces pretty JSON by default and compact when asked", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(serializeBrief(brief)).toContain("\n  ");
    expect(serializeBrief(brief, false)).not.toContain("\n  ");
  });
});

// ---------------------------------------------------------------------------
// R231: reportUrl + URL helpers (back-link to the live research report page)
// ---------------------------------------------------------------------------

describe("toLaunchLensBrief — reportUrl (R231)", () => {
  it("populates reportUrl with the default research-studio base + session id", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "abc12345" }));
    expect(brief.reportUrl).toBe(
      "https://launchlens-research-studio.vercel.app/research/abc12345",
    );
  });

  it("honors NEXT_PUBLIC_RESEARCH_STUDIO_URL when set", () => {
    const prev = process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = "https://research.example.com/";
    try {
      const brief = toLaunchLensBrief(buildSession({ id: "sess-9" }));
      // trailing slash is stripped before concatenation
      expect(brief.reportUrl).toBe("https://research.example.com/research/sess-9");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
      else process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = prev;
    }
  });

  it("omits reportUrl when sessionId is empty (defensive)", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "" }));
    // buildReportUrl("") returns the base URL alone; we still set the field,
    // but it points at the root, which is harmless. launchlens-ai's source-brief
    // module validates reportUrl ≤ 2048 chars and non-empty, so this is a
    // contractually valid (if useless) value.
    expect(brief.reportUrl).toBe("https://launchlens-research-studio.vercel.app");
  });

  it("preserves reportUrl in serializeBrief", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "xyz" }));
    const parsed = JSON.parse(serializeBrief(brief, false));
    expect(parsed.reportUrl).toBe(brief.reportUrl);
  });
});

describe("URL helpers (R231)", () => {
  it("getLaunchLensAiUrl returns the default when env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    delete process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    try {
      expect(getLaunchLensAiUrl()).toBe("https://launchlens-ai-two.vercel.app");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = prev;
    }
  });

  it("getLaunchLensAiUrl honors env override and strips trailing slash", () => {
    const prev = process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = "https://launchlens-ai.example.com/";
    try {
      expect(getLaunchLensAiUrl()).toBe("https://launchlens-ai.example.com");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
      else process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = prev;
    }
  });

  it("getResearchStudioUrl returns the default when env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    delete process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    try {
      expect(getResearchStudioUrl()).toBe("https://launchlens-research-studio.vercel.app");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = prev;
    }
  });

  it("buildReportUrl combines base + /research/ + sessionId", () => {
    expect(buildReportUrl("abc")).toBe(
      "https://launchlens-research-studio.vercel.app/research/abc",
    );
  });
});

// ---------------------------------------------------------------------------
// R251/R254 cross-repo contract: pins the wire shape launchlens-ai's
// brief-from-json.ts decodes. The symmetric decoder-side test lives in
// launchlens-ai's brief-from-json.test.ts. If either repo drifts on the
// envelope shape, the #brief= handoff silently breaks — these tests catch
// that before it ships.
// ---------------------------------------------------------------------------
describe("toLaunchLensBrief — handoff contract (mirrors launchlens-ai decoder)", () => {
  it("flags tone as default so the importer can preserve user tone", () => {
    // R254: meta.toneDefault must be true because research-studio has no
    // tone/style agent — the tone field is a fixed placeholder, not research.
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.meta.toneDefault).toBe(true);
  });

  it("emits the #brief= hash prefix launchlens-ai expects", () => {
    // launchlens-ai's briefFromHashFragment checks hash.startsWith("#brief=").
    // If this prefix drifts, the hash handoff breaks silently.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const hash = briefHashFor(compact);
    expect(hash.startsWith(BRIEF_HASH_PREFIX)).toBe(true);
  });

  it("round-trips through base64url: encode → decode yields the original JSON", () => {
    // launchlens-ai's decodeBase64UrlUtf8 reverses encodeBase64UrlUtf8. This
    // guards the symmetric codec: UTF-8 bytes → base64url (no padding) → back.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const encoded = encodeBase64UrlUtf8(compact);
    // base64url alphabet only: A-Z a-z 0-9 - _  (no + / =)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    // The launchlens-ai decoder pads + swaps alphabet back; we simulate it
    // here to prove the round-trip is lossless.
    const restored = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(restored, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(compact);
    // And the decoded JSON parses back to the same envelope.
    expect(JSON.parse(decoded)).toMatchObject({
      schemaVersion: LAUNCHLENS_BRIEF_SCHEMA_VERSION,
      source: "launchlens-research-studio",
      meta: { toneDefault: true },
    });
  });

  it("produces a compact JSON small enough for a URL hash fragment", () => {
    // Browsers cap URL length (~2k chars for IE-era, 64k+ in modern ones).
    // The hash must stay well under that. A full 6-agent brief compact-encoded
    // should be a few KB at most.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const hash = briefHashFor(compact);
    expect(hash.length).toBeLessThan(8000);
  });
});

describe("toLaunchLensBrief — Deep evidence boundary poison tests", () => {
  // Each test below forges a deliberate defect in the V2 validation ledger
  // and asserts the Brief mapper cannot be tricked into exporting the
  // poisoned content as if it were evidence-backed.

  function deepWithClaims(
    claims: Array<{
      id: string;
      agentId: "market-sizer" | "pain-detective" | "pricing-scout";
      fieldPath: string;
      text: string;
      valueHash: string;
    }>,
    adjudications: Array<{
      claimId: string;
      claimValueHash: string;
      disposition: "supported" | "partially_supported" | "unsupported";
      synthesisEligible: boolean;
    }>,
    extras: Partial<{
      gapFill: {
        completedAt: string;
        targetedClaimIds: readonly string[];
        sourcesAdded: number;
        targetedClaimCount: number;
      };
    }> = {},
  ): NonNullable<ResearchSession["validation"]> {
    // R2C: a hand-rolled V2 ledger is no longer accepted by the brief
    // mapper -- the canonical `isValidationLedgerV2` predicate must
    // pass. For tests that need a *forged* ledger (to verify the
    // mapper rejects it), this helper intentionally returns an
    // invalid ledger. Tests that need a *valid* ledger should use
    // `buildSupportedLedger` (below).
    return {
      version: 2,
      protocol: { executedPasses: 3 },
      semanticValidation: { status: "completed" },
      claims,
      adjudications,
      ...extras,
    } as unknown as NonNullable<ResearchSession["validation"]>;
  }

  /**
   * R2C: build a V2 ledger via the production pipeline that
   * `isValidationLedgerV2` accepts. The single claim is set up to
   * receive "entailed" Pass 1 + "corroborated" Pass 2 so the
   * deterministic adjudicator marks it `supported` and
   * `synthesisEligible`. This is the canonical way to build a
   * "positive" Deep session for the brief-mapper tests.
   */
  function buildSupportedLedger(): NonNullable<ResearchSession["validation"]> {
    const session = buildSession({ mode: "deep" });
    const initial = initializeDeepValidation(session, { maxClaims: 1, maxClaimsPerAgent: 1 });
    const claim = initial.claims[0]!;
    const adapted = {
      ...claim,
      id: "tam",
      agentId: "market-sizer" as const,
      fieldPath: "/marketSize/tam",
      text: "TAM is $5B.",
    };
    const admitted = {
      id: "src-tam",
      title: "TAM source",
      url: "https://e.example/tam",
      snippet: "TAM is $5B.",
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: "market-sizer" as const,
      origin: "retrieved_evidence" as const,
    };
    const ledgerWithSource = {
      ...initial,
      claims: [{ ...adapted, sourceIds: [admitted.id] }],
      reviewSources: [admitted],
    };
    const indep = {
      id: "indep-tam",
      title: "Independent TAM",
      url: "https://e.example/indep-tam",
      snippet: "Independent corroboration of TAM.",
      accessedAt: NOW,
      confidence: "medium" as const,
      agent: "market-sizer" as const,
      origin: "independent_retrieval" as const,
      claimIds: ["tam"],
    };
    const ledgerWithIndep = {
      ...ledgerWithSource,
      reviewSources: [admitted, indep],
    };
    const pass1 = applyClaimReviewPass(ledgerWithIndep, "claim_source_entailment", [{
      claimId: "tam",
      claimValueHash: adapted.valueHash,
      pass: "claim_source_entailment" as const,
      reviewer: REVIEWER,
      verdict: "entailed" as const,
      confidence: "medium" as const,
      supportingSourceIds: [admitted.id],
      contradictingSourceIds: [],
      rationale: "Source entails the TAM claim.",
    }], NOW);
    const pass2 = applyClaimReviewPass(pass1, "independent_corroboration_conflict", [{
      claimId: "tam",
      claimValueHash: adapted.valueHash,
      pass: "independent_corroboration_conflict" as const,
      reviewer: REVIEWER,
      verdict: "corroborated" as const,
      confidence: "high" as const,
      supportingSourceIds: [indep.id],
      contradictingSourceIds: [],
      rationale: "Independent corroboration of TAM.",
    }], NOW);
    return applyClaimAdjudicationPass(pass2, [{
      claimId: "tam",
      claimValueHash: adapted.valueHash,
      reviewer: REVIEWER,
      disposition: "supported",
      confidence: "high",
      limitations: [],
    }], NOW) as unknown as NonNullable<ResearchSession["validation"]>;
  }

  it("refuses a forged adjudication whose claimValueHash does not match the claim", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepWithClaims(
        [
          {
            id: "tam",
            agentId: "market-sizer",
            fieldPath: "/marketSize/tam",
            text: "TAM is $5B.",
            valueHash: "real-hash-123",
          },
        ],
        [
          {
            claimId: "tam",
            claimValueHash: "forged-hash-999",
            disposition: "supported",
            synthesisEligible: true,
          },
        ],
      ),
    });
    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);
    // The forged adjudication must not surface as a fully-supported claim.
    expect(serialized).not.toContain("$5B");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });

  it("refuses a phantom claim id in adjudications (no matching claim in claims array)", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepWithClaims(
        [
          {
            id: "real_claim",
            agentId: "market-sizer",
            fieldPath: "/marketSize/tam",
            text: "TAM is $5B.",
            valueHash: "h1",
          },
        ],
        [
          {
            claimId: "ghost_claim",
            claimValueHash: "h-ghost",
            disposition: "supported",
            synthesisEligible: true,
          },
        ],
      ),
    });
    const brief = toLaunchLensBrief(session);
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(serializeBrief(brief, false)).not.toContain("$5B");
  });

  it("blocks synthesis execSummary from leaking into the brief idea when not fully supported", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepWithClaims(
        [
          {
            id: "tam",
            agentId: "market-sizer",
            fieldPath: "/marketSize/tam",
            text: "TAM is $5B.",
            valueHash: "h-tam",
          },
        ],
        [
          {
            claimId: "tam",
            claimValueHash: "h-tam",
            disposition: "unsupported",
            synthesisEligible: false,
          },
        ],
      ),
    });
    // Plant a poisoned synthesis output that the mapper must NOT echo.
    session.agents.synthesis = {
      id: "synthesis",
      status: "done",
      progress: 100,
      currentStep: "Done",
      output: {
        agent: "synthesis",
        execSummary: "POISON_TOKEN_EXEC_SUMMARY",
        opportunityScore: 91,
        riskScore: 12,
        keyInsights: [],
        topThreeOpportunities: [],
        topThreeRisks: [],
        recommendedNextStep: "POISON_TOKEN_NEXT_STEP",
        launchlensBrief: "",
        citations: [],
      },
    };
    const brief = toLaunchLensBrief(session);
    const serialized = serializeBrief(brief, false);
    expect(serialized).not.toContain("POISON_TOKEN_EXEC_SUMMARY");
    expect(serialized).not.toContain("POISON_TOKEN_NEXT_STEP");
    expect(serialized).not.toContain("$5B");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });

  it("nulls opportunityScore and riskScore when synthesis is degraded even with claims supported", () => {
    const session = buildSession({
      mode: "deep",
      validation: deepWithClaims(
        [
          {
            id: "tam",
            agentId: "market-sizer",
            fieldPath: "/marketSize/tam",
            text: "TAM is $5B.",
            valueHash: "h-tam",
          },
        ],
        [
          {
            claimId: "tam",
            claimValueHash: "h-tam",
            disposition: "supported",
            synthesisEligible: true,
          },
        ],
      ),
    });
    session.agents.synthesis = {
      id: "synthesis",
      status: "done",
      progress: 100,
      currentStep: "Done",
      degraded: true,
      output: {
        agent: "synthesis",
        execSummary: "degraded",
        opportunityScore: 91,
        riskScore: 12,
        keyInsights: [],
        topThreeOpportunities: [],
        topThreeRisks: [],
        recommendedNextStep: "go",
        launchlensBrief: "",
        citations: [],
      },
    };
    const brief = toLaunchLensBrief(session);
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });

  it("fails closed when gapFill counters do not match the source catalog", () => {
    // R2C: build a real V2 ledger via the production pipeline so the
    // canonical predicate passes, then add forged gapFill metadata.
    const baseLedger = buildSupportedLedger();
    const forged = {
      ...baseLedger,
      gapFill: {
        completedAt: new Date().toISOString(),
        targetedClaimIds: [],
        sourcesAdded: 99, // poisoned: no gap sources in catalog
        targetedClaimCount: 0,
      },
    } as NonNullable<ResearchSession["validation"]>;
    const session = buildSession({ mode: "deep", validation: forged });
    // Full-ledger validation includes gapFill integrity. The forged count
    // invalidates the ledger, so even the otherwise-supported TAM claim
    // must not cross the export boundary.
    const brief = toLaunchLensBrief(session);
    expect(brief.input.market).not.toContain("$5B");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
  });
});
