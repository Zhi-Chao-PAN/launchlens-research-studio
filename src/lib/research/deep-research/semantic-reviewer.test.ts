import { afterEach, describe, expect, it } from "vitest";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { createDeterministicStructuredCompletionProvider } from "@/lib/providers/mock-structured-completion";
import {
  StructuredCompletionError,
  type StructuredCompletionRequest,
  type StructuredCompletionProvider,
} from "@/lib/providers/structured-completion";
import type { RetrievalProvider } from "@/lib/providers/retrieval.types";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import type {
  AgentId,
  ClaimReviewSource,
  ResearchClaim,
  ResearchSession,
  ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { DeepWorkExecutionError } from "./service";
import {
  DeepSemanticReviewer,
  assertAllClaimsHaveAtLeastOneSource,
  buildClaimEvidenceSlices,
  findingsForPass,
  uniqueSourcesFromSlices,
} from "./semantic-reviewer";
import { initializeDeepValidation } from "@/lib/research/deep-validation";

const sessions: string[] = [];

async function fixtureSession(
  agentIds: readonly AgentId[] = ["market-sizer"],
): Promise<ResearchSession> {
  const session = createResearchSession("AI finance operations platform", ["finance", "AI"], undefined, {
    mode: "deep",
  });
  sessions.push(session.id);
  const citations = [];
  for (const agentId of agentIds) {
    if (agentId === "synthesis") continue;
    const output = await mockResearchProvider.generate(agentId, {
      query: session.query,
      keywords: session.keywords,
    });
    session.agents[agentId] = {
      ...session.agents[agentId],
      status: "done",
      progress: 100,
      currentStep: "Complete",
      output,
      resolvedProviderId: "openai",
      degraded: false,
    };
    citations.push(...output.citations);
  }
  session.citations = citations;
  return session;
}

function liveScriptedProvider(
  respond: (request: Readonly<{ schemaName: string; systemPrompt: string; userPrompt: string }>) => unknown,
): StructuredCompletionProvider {
  const scripted = createDeterministicStructuredCompletionProvider({
    id: "review-provider",
    model: "review-model",
    respond,
  });
  return { ...scripted, isMock: false };
}

function parsePayload(userPrompt: string): Record<string, unknown> {
  const start = userPrompt.indexOf("\n") + 1;
  const end = userPrompt.lastIndexOf("\n</untrusted_research_data>");
  return JSON.parse(userPrompt.slice(start, end)) as Record<string, unknown>;
}

function successfulProvider(numericConfidence = false): StructuredCompletionProvider {
  return liveScriptedProvider(({ schemaName, userPrompt }) => {
    const payload = parsePayload(userPrompt);
    const claims = payload.claims as Array<{
      id: string;
      agentId: AgentId;
      valueHash: string;
      sourceIds: string[];
    }>;
    const sources = (payload.sources ?? payload.sourceCatalog ?? []) as Array<{
      id: string;
      agent?: AgentId;
      origin?: string;
      claimIds?: string[];
    }>;
    if (schemaName === "deep_claim_source_entailment") {
      return {
        findings: claims.map((claim) => ({
          claimId: claim.id,
          claimValueHash: claim.valueHash,
          reviewer: { reviewerId: "forged", providerId: "forged", promptVersion: "forged" },
          verdict: claim.sourceIds.length > 0 ? "entailed" : "insufficient_evidence",
          confidence: numericConfidence ? 0.9 : "medium",
          supportingSourceIds: claim.sourceIds.slice(0, 1),
          contradictingSourceIds: ["invented-source"],
          rationale: "The supplied source excerpt supports the bounded statement.",
        })),
      };
    }
    if (schemaName === "deep_independent_corroboration_conflict") {
      return {
        findings: claims.map((claim) => {
          const independent = sources.find(
            (source) =>
              source.origin === "independent_retrieval" &&
              source.agent === claim.agentId &&
              source.claimIds?.includes(claim.id),
          )?.id;
          return {
            claimId: claim.id,
            claimValueHash: claim.valueHash,
            verdict: independent ? "corroborated" : "insufficient_evidence",
            confidence: numericConfidence ? 90 : "medium",
            supportingSourceIds: independent ? [independent, "invented-source"] : [],
            contradictingSourceIds: [],
            rationale: "Fresh retrieval independently corroborates the bounded statement.",
          };
        }),
      };
    }
    const findings = payload.findings as Array<{
      claimId: string;
      claimValueHash: string;
      supportingSourceIds: string[];
    }>;
    const latest = new Map(findings.map((finding) => [finding.claimId, finding]));
    return {
      adjudications: claims.map((claim) => {
        const support = latest.get(claim.id)?.supportingSourceIds ?? [];
        return {
          claimId: claim.id,
          claimValueHash: claim.valueHash,
          disposition: support.length > 0 ? "supported" : "insufficient_evidence",
          confidence: numericConfidence ? 0.9 : "medium",
          supportingSourceIds: [...support, "invented-source"],
          contradictingSourceIds: [],
          limitations: [],
        };
      }),
    };
  });
}

function liveRetrieval(empty = false): RetrievalProvider {
  return {
    id: "search",
    displayName: "Independent search",
    isMock: false,
    async search({ agentId }) {
      if (empty) return [];
      const now = new Date().toISOString();
      return [
        {
          id: `independent-${agentId}-1`,
          title: "Independent benchmark",
          url: `https://evidence.example/${agentId}/1`,
          snippet: "An independent benchmark reports a materially similar range.",
          accessedAt: now,
          retrievedAt: now,
          confidence: "medium",
          agent: agentId ?? "market-sizer",
        },
        {
          id: `independent-${agentId}-2`,
          title: "Independent industry analysis",
          url: `https://evidence.example/${agentId}/2`,
          snippet: "A second independent analysis provides corroborating category evidence.",
          accessedAt: now,
          retrievedAt: now,
          confidence: "medium",
          agent: agentId ?? "market-sizer",
        },
      ];
    },
  };
}

afterEach(() => {
  for (const id of sessions.splice(0)) deleteSession(id);
});

describe("DeepSemanticReviewer", () => {
  it("executes three ordered, complete claim-evidence passes with strict allowlists", async () => {
    let session = await fixtureSession();
    const reviewer = new DeepSemanticReviewer({
      provider: successfulProvider(),
      retrieval: liveRetrieval(),
    });

    session = await reviewer.runPass(session, "claim_source_entailment");
    session = await reviewer.runPass(session, "independent_corroboration_conflict");
    session = await reviewer.runPass(session, "adjudication");

    expect(session.validation).toMatchObject({
      version: 2,
      protocol: { executedPasses: 3, deepMultiPassExecuted: true },
      semanticValidation: {
        status: "completed",
        progress: 100,
        factualAccuracy: "not_established",
        reviewerDiversityCount: 3,
      },
    });
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    expect(session.validation.adjudications).toHaveLength(session.validation.claims.length);
    expect(JSON.stringify(session.validation)).not.toContain("invented-source");
    expect(findingsForPass(session.validation, "claim_source_entailment")[0].reviewer)
      .toMatchObject({
        reviewerId: "deep-entailment-reviewer",
        providerId: "review-provider",
        model: "review-model",
      });
  });

  it("rejects a resumed ledger whose claim-to-source binding is non-canonical", async () => {
    const session = await fixtureSession();
    const ledger = initializeDeepValidation(session, { maxClaims: 6, maxClaimsPerAgent: 6 });
    const claim = ledger.claims[0];
    if (!claim) throw new Error("fixture requires a claim");
    claim.sourceIds = ["missing-source-binding"];
    session.validation = ledger;
    const reviewer = new DeepSemanticReviewer({
      provider: successfulProvider(),
      retrieval: liveRetrieval(),
    });

    await expect(reviewer.runPass(session, "claim_source_entailment"))
      .rejects.toMatchObject({
        code: "validation_protocol_out_of_order",
        retryable: false,
      });
  });

  it("normalizes numeric reviewer confidence without weakening claim binding", async () => {
    let session = await fixtureSession();
    const reviewer = new DeepSemanticReviewer({
      provider: successfulProvider(true),
      retrieval: liveRetrieval(),
    });

    session = await reviewer.runPass(session, "claim_source_entailment");
    session = await reviewer.runPass(session, "independent_corroboration_conflict");
    session = await reviewer.runPass(session, "adjudication");

    expect(session.validation?.version).toBe(2);
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    const ledger = session.validation;
    expect(ledger.findings.every((finding) => finding.confidence === "high")).toBe(true);
    expect(ledger.adjudications.every((item) => item.confidence === "high")).toBe(true);
    expect(ledger.claims.every((claim) =>
      ledger.findings.some((finding) =>
        finding.claimId === claim.id && finding.claimValueHash === claim.valueHash
      )
    )).toBe(true);
  });

  it("adjudicates all claims through bounded claim-scoped batches", async () => {
    let session = await fixtureSession([
      "market-sizer",
      "competitor-analyst",
      "pain-detective",
      "pricing-scout",
      "channel-scout",
    ]);
    const base = successfulProvider();
    const adjudicationPayloads: Record<string, unknown>[] = [];
    let activeAdjudicationCalls = 0;
    let maxActiveAdjudicationCalls = 0;
    const provider: StructuredCompletionProvider = {
      ...base,
      async complete<T>(request: StructuredCompletionRequest<T>) {
        if (request.schemaName === "deep_adjudication") {
          adjudicationPayloads.push(parsePayload(request.userPrompt));
          activeAdjudicationCalls += 1;
          maxActiveAdjudicationCalls = Math.max(
            maxActiveAdjudicationCalls,
            activeAdjudicationCalls,
          );
          try {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return await base.complete<T>(request);
          } finally {
            activeAdjudicationCalls -= 1;
          }
        }
        return base.complete<T>(request);
      },
    };
    const reviewer = new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() });

    session = await reviewer.runPass(session, "claim_source_entailment");
    session = await reviewer.runPass(session, "independent_corroboration_conflict");
    const claims = session.validation?.version === 2 ? session.validation.claims : [];
    session = await reviewer.runPass(session, "adjudication");

    expect(claims).toHaveLength(25);
    expect(adjudicationPayloads).toHaveLength(4);
    expect(adjudicationPayloads.map((payload) =>
      (payload.claims as ResearchClaim[]).length
    )).toEqual([7, 7, 7, 4]);
    expect(maxActiveAdjudicationCalls).toBe(3);
    expect(activeAdjudicationCalls).toBe(0);
    expect(adjudicationPayloads.every((payload) => {
      const batchClaims = payload.claims as ResearchClaim[];
      const batchClaimIds = new Set(batchClaims.map((claim) => claim.id));
      const findings = payload.findings as Array<{ claimId: string }>;
      const sourceCatalog = payload.sourceCatalog as Array<{ claimIds?: string[] }>;
      return findings.length === batchClaims.length * 2 &&
        findings.every((finding) => batchClaimIds.has(finding.claimId)) &&
        sourceCatalog.every((source) =>
          source.claimIds?.every((claimId) => batchClaimIds.has(claimId)) ?? true
        );
    })).toBe(true);
    expect(new Set(adjudicationPayloads.flatMap((payload) =>
      (payload.claims as ResearchClaim[]).map((claim) => claim.id)
    ))).toEqual(new Set(claims.map((claim) => claim.id)));
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    expect(session.validation.adjudications).toHaveLength(claims.length);
  });

  it("lets the durable stage retry a failed adjudication wave without inner retries", async () => {
    let session = await fixtureSession([
      "market-sizer",
      "competitor-analyst",
      "pain-detective",
      "pricing-scout",
      "channel-scout",
    ]);
    const base = successfulProvider();
    let adjudicationCalls = 0;
    let activeAdjudicationCalls = 0;
    const provider: StructuredCompletionProvider = {
      ...base,
      async complete<T>(request: StructuredCompletionRequest<T>) {
        if (request.schemaName === "deep_adjudication") {
          adjudicationCalls += 1;
          const callIndex = adjudicationCalls;
          activeAdjudicationCalls += 1;
          try {
            await new Promise((resolve) => setTimeout(resolve, callIndex === 1 ? 5 : 20));
            if (callIndex === 1) {
              throw new StructuredCompletionError({
                code: "timeout",
                providerId: "review-provider",
                message: "Timed out in the bounded batch.",
                retryable: true,
              });
            }
            return await base.complete<T>(request);
          } finally {
            activeAdjudicationCalls -= 1;
          }
        }
        return base.complete<T>(request);
      },
    };
    const reviewer = new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() });
    session = await reviewer.runPass(session, "claim_source_entailment");
    session = await reviewer.runPass(session, "independent_corroboration_conflict");

    await expect(reviewer.runPass(session, "adjudication")).rejects.toMatchObject({
      code: "semantic_reviewer_timeout",
      retryable: true,
    });
    expect(adjudicationCalls).toBe(3);
    expect(activeAdjudicationCalls).toBe(0);
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    expect(session.validation.protocol.completedPassKinds).not.toContain("adjudication");
    expect(session.validation.adjudications).toHaveLength(0);
  });

  it("rejects a structurally valid cross-batch adjudication response", async () => {
    let session = await fixtureSession([
      "market-sizer",
      "competitor-analyst",
      "pain-detective",
      "pricing-scout",
      "channel-scout",
    ]);
    const setupReviewer = new DeepSemanticReviewer({
      provider: successfulProvider(),
      retrieval: liveRetrieval(),
    });
    session = await setupReviewer.runPass(session, "claim_source_entailment");
    session = await setupReviewer.runPass(session, "independent_corroboration_conflict");
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    const allClaims = session.validation.claims;
    const corruptProvider = liveScriptedProvider(({ userPrompt }) => {
      const payload = parsePayload(userPrompt);
      const batchClaims = payload.claims as ResearchClaim[];
      const foreignClaim = allClaims.find(
        (claim) => !batchClaims.some((batchClaim) => batchClaim.id === claim.id),
      );
      if (!foreignClaim) throw new Error("fixture requires a foreign claim");
      return {
        adjudications: batchClaims.map((claim, index) => ({
          claimId: index === 0 ? foreignClaim.id : claim.id,
          claimValueHash: index === 0 ? foreignClaim.valueHash : claim.valueHash,
          disposition: "insufficient_evidence",
          confidence: "low",
          supportingSourceIds: [],
          contradictingSourceIds: [],
          limitations: [],
        })),
      };
    });
    const reviewer = new DeepSemanticReviewer({
      provider: corruptProvider,
      retrieval: liveRetrieval(),
    });

    await expect(reviewer.runPass(session, "adjudication")).rejects.toMatchObject({
      code: "semantic_reviewer_validation_failed",
      retryable: true,
    });
    expect(session.validation.protocol.completedPassKinds).not.toContain("adjudication");
    expect(session.validation.adjudications).toHaveLength(0);
  });

  it("retains two bounded reviewer attempts for non-adjudication passes", async () => {
    const session = await fixtureSession();
    const base = successfulProvider();
    let calls = 0;
    const provider: StructuredCompletionProvider = {
      ...base,
      async complete<T>(request: StructuredCompletionRequest<T>) {
        if (request.schemaName === "deep_claim_source_entailment") {
          calls += 1;
          if (calls === 1) {
            throw new StructuredCompletionError({
              code: "timeout",
              providerId: "review-provider",
              message: "Transient pass-one timeout.",
              retryable: true,
            });
          }
        }
        return base.complete<T>(request);
      },
    };
    const reviewer = new DeepSemanticReviewer({
      provider,
      retrieval: liveRetrieval(),
      sleep: async () => undefined,
    });

    const reviewed = await reviewer.runPass(session, "claim_source_entailment");
    expect(calls).toBe(2);
    if (reviewed.validation?.version !== 2) throw new Error("expected V2 ledger");
    expect(reviewed.validation.protocol.completedPassKinds)
      .toContain("claim_source_entailment");
  });

  it("rejects incomplete reviewer coverage so the durable stage can retry", async () => {
    const session = await fixtureSession();
    const provider = liveScriptedProvider(({ userPrompt }) => {
      const payload = parsePayload(userPrompt);
      const claim = (payload.claims as Array<{ id: string; valueHash: string }>)[0];
      return {
        findings: [{
          claimId: claim.id,
          claimValueHash: claim.valueHash,
          verdict: "insufficient_evidence",
          confidence: "low",
          supportingSourceIds: [],
          contradictingSourceIds: [],
          rationale: "Only one claim was returned.",
        }],
      };
    });
    const reviewer = new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() });

    await expect(reviewer.runPass(session, "claim_source_entailment")).rejects.toMatchObject({
      code: "semantic_review_incomplete",
      retryable: true,
    });
  });

  it("fails closed when fresh corroboration retrieval is insufficient", async () => {
    let session = await fixtureSession();
    const provider = successfulProvider();
    session = await new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() })
      .runPass(session, "claim_source_entailment");
    const reviewer = new DeepSemanticReviewer({ provider, retrieval: liveRetrieval(true) });

    await expect(reviewer.runPass(session, "independent_corroboration_conflict"))
      .rejects.toMatchObject({
        code: "independent_retrieval_insufficient",
        retryable: true,
      });
  });

  it("fails closed when one agent has six sources but another reviewed agent has none", async () => {
    let session = await fixtureSession(["market-sizer", "competitor-analyst"]);
    const provider = successfulProvider();
    session = await new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() })
      .runPass(session, "claim_source_entailment");
    const skewedRetrieval: RetrievalProvider = {
      ...liveRetrieval(),
      async search({ agentId }) {
        if (agentId !== "market-sizer") return [];
        const now = new Date().toISOString();
        return Array.from({ length: 6 }, (_, index) => ({
          id: `market-only-${index + 1}`,
          title: `Market-only source ${index + 1}`,
          url: `https://evidence.example/market-only/${index + 1}`,
          snippet: "This evidence covers only the market sizing research dimension.",
          accessedAt: now,
          retrievedAt: now,
          confidence: "medium" as const,
          agent: "market-sizer" as const,
        }));
      },
    };
    const reviewer = new DeepSemanticReviewer({ provider, retrieval: skewedRetrieval });

    await expect(reviewer.runPass(session, "independent_corroboration_conflict"))
      .rejects.toMatchObject({
        code: "independent_retrieval_insufficient",
        retryable: true,
      });
  });

  it("grounds independent market retrieval in the topic before the claim text", async () => {
    let session = await fixtureSession(["market-sizer"]);
    session.query =
      "一个创业想法：在暑假七八月，在深圳地铁口摆摊卖早餐，目标用户是通勤上班族。请验证市场需求、合规约束、单位经济性、竞争格局和获客渠道。";
    session.keywords = ["深圳", "地铁早餐", "通勤上班族", "摆摊合规", "单位经济性"];
    const provider = successfulProvider();
    session = await new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() })
      .runPass(session, "claim_source_entailment");
    const queries: string[] = [];
    const retrieval: RetrievalProvider = {
      id: "topic-first-search",
      displayName: "Topic-first independent search",
      isMock: false,
      async search({ agentId, query }) {
        queries.push(query);
        const now = new Date().toISOString();
        return [{
          id: "topic-first-" + queries.length,
          title: "Independent market benchmark",
          url: "https://evidence.example/topic-first/" + queries.length,
          snippet: "An independent market benchmark covers the same product context.",
          accessedAt: now,
          retrievedAt: now,
          confidence: "medium",
          agent: agentId ?? "market-sizer",
        }];
      },
    };

    const reviewed = await new DeepSemanticReviewer({ provider, retrieval })
      .runPass(session, "independent_corroboration_conflict");

    if (session.validation?.version !== 2 || reviewed.validation?.version !== 2) {
      throw new Error("expected V2 ledger");
    }
    expect(queries).toHaveLength(session.validation.claims.length);
    expect(queries[0]).not.toMatch(/^Dated market-report evidence/);
    expect(
      queries.every((query) =>
        query.startsWith("在深圳地铁口摆摊卖早餐 ") &&
        query.indexOf("在深圳地铁口摆摊卖早餐") < query.indexOf("Claim to check:"),
      ),
    ).toBe(true);
    expect(
      queries.map((query) => query.split("Claim to check:")[0]).join(" "),
    ).not.toMatch(/SaaS|software|B2B|cross-border|Indie Hackers/iu);
    expect(
      reviewed.validation.reviewSources.filter(
        (source) => source.origin === "independent_retrieval" && source.agent === "market-sizer",
      ),
    ).toHaveLength(session.validation.claims.length);
  });

  it("keeps shared URLs agent-scoped across focused independent retrievals", async () => {
    let session = await fixtureSession(["market-sizer", "competitor-analyst"]);
    const provider = successfulProvider();
    session = await new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() })
      .runPass(session, "claim_source_entailment");
    const queries: string[] = [];
    const retrievalOptions: Array<{ searchDepth?: string; minScore?: number }> = [];
    const overlappingRetrieval: RetrievalProvider = {
      id: "overlapping-search",
      displayName: "Overlapping search",
      isMock: false,
      async search({ agentId, query, searchDepth, minScore }) {
        queries.push(query);
        retrievalOptions.push({ searchDepth, minScore });
        const now = new Date().toISOString();
        return [{
          id: "shared-result",
          title: "Shared independent benchmark",
          url: "https://evidence.example/shared-benchmark",
          snippet: "The same benchmark contains independently retrieved evidence for both dimensions.",
          accessedAt: now,
          retrievedAt: now,
          confidence: "medium",
          agent: agentId ?? "market-sizer",
        }];
      },
    };

    session = await new DeepSemanticReviewer({ provider, retrieval: overlappingRetrieval })
      .runPass(session, "independent_corroboration_conflict");

    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    expect(queries).toHaveLength(session.validation.claims.length);
    expect(new Set(queries).size).toBe(queries.length);
    expect(queries.every((query) => query.length <= 280)).toBe(true);
    expect(queries.every((query) => !query.startsWith("Independent evidence"))).toBe(true);
    expect(retrievalOptions.every((opts) => opts.searchDepth === "advanced")).toBe(true);
    expect(retrievalOptions.every((opts) => opts.minScore === 0.35)).toBe(true);
    const independent = session.validation.reviewSources.filter(
      (source) => source.origin === "independent_retrieval",
    );
    expect(new Set(independent.map((source) => source.agent))).toEqual(
      new Set(["market-sizer", "competitor-analyst"]),
    );
    expect(new Set(independent.map((source) => source.id)).size).toBe(
      session.validation.claims.length,
    );
    expect(
      session.validation.claims.every((claim) =>
        independent.some((source) => source.claimIds?.includes(claim.id)),
      ),
    ).toBe(true);
  });

  it("never treats an explicit mock reviewer as Deep capability", async () => {
    const session = await fixtureSession();
    const mock = createDeterministicStructuredCompletionProvider({ respond: () => ({}) });
    const reviewer = new DeepSemanticReviewer({ provider: mock, retrieval: liveRetrieval() });
    await expect(reviewer.runPass(session, "claim_source_entailment"))
      .rejects.toBeInstanceOf(DeepWorkExecutionError);
    await expect(reviewer.runPass(session, "claim_source_entailment"))
      .rejects.toMatchObject({ code: "mock_reviewer_forbidden", retryable: false });
  });
});

describe("buildClaimEvidenceSlices", () => {
  const baseAgentId: Exclude<AgentId, "synthesis"> = "market-sizer";

  function makeClaim(overrides: Partial<ResearchClaim>): ResearchClaim {
    return {
      id: overrides.id ?? "claim_test",
      agentId: overrides.agentId ?? baseAgentId,
      fieldPath: overrides.fieldPath ?? "/marketSize/tam",
      text: overrides.text ?? "TAM equals $5B",
      kind: overrides.kind ?? "market_metric",
      criticality: overrides.criticality ?? "decision_critical",
      sourceIds: overrides.sourceIds ?? [],
      valueHash: overrides.valueHash ?? "hash_test",
    };
  }

  function makeSource(overrides: Partial<ClaimReviewSource>): ClaimReviewSource {
    const now = new Date().toISOString();
    const source: ClaimReviewSource = {
      id: overrides.id ?? "src_test",
      title: overrides.title ?? "Test source",
      url: overrides.url,
      snippet: overrides.snippet ?? "Test snippet",
      accessedAt: overrides.accessedAt ?? now,
      confidence: overrides.confidence ?? "medium",
      agent: overrides.agent ?? baseAgentId,
      origin: overrides.origin ?? "agent_citation",
      claimIds: overrides.claimIds,
    };
    return source;
  }

  function makeLedger(
    claims: ResearchClaim[],
    reviewSources: ClaimReviewSource[],
  ): ValidationLedgerV2 {
    const session = createResearchSession("AI finance operations platform", ["finance"], undefined, { mode: "deep" });
    const ledger = initializeDeepValidation(session, { maxClaims: claims.length, maxClaimsPerAgent: claims.length });
    return { ...ledger, claims, reviewSources };
  }

  it("guarantees every claim retains its own sourceIds in the prompt context", () => {
    // 30 claims each citing a unique source; nothing in the first 80 global entries
    // is allowed for any of them. The legacy global slice would starve every claim.
    const claims: ResearchClaim[] = [];
    const sources: ClaimReviewSource[] = [];
    for (let i = 0; i < 30; i += 1) {
      const id = `claim_${i}`;
      const sourceId = `own_${i}`;
      claims.push(makeClaim({ id, valueHash: `hash_${i}`, sourceIds: [sourceId] }));
      sources.push(makeSource({ id: sourceId, title: `Own source ${i}`, agent: baseAgentId }));
    }
    // Add 80 extra shared sources that no claim owns.
    for (let i = 0; i < 80; i += 1) {
      sources.push(makeSource({ id: `shared_${i}`, title: `Shared ${i}`, agent: baseAgentId }));
    }
    const ledger = makeLedger(claims, sources);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });

    for (const claim of claims) {
      const slice = slices.find((entry) => entry.claim.id === claim.id);
      expect(slice, `slice for ${claim.id} should exist`).toBeDefined();
      expect(slice?.sources.map((s) => s.id)).toContain(claim.sourceIds[0]);
    }
    // Total sources handed to the model never exceed the cap.
    const total = slices.reduce((acc, slice) => acc + slice.sources.length, 0);
    expect(total).toBeLessThanOrEqual(80);
    // Source ids are unique across the whole prompt payload.
    const seen = new Set<string>();
    for (const slice of slices) for (const source of slice.sources) {
      expect(seen.has(source.id), `duplicate source id ${source.id}`).toBe(false);
      seen.add(source.id);
    }
  });

  it("preserves independent_retrieval sources for Pass 2 even when own sources are abundant", () => {
    const claimA = makeClaim({ id: "claim_a", valueHash: "h_a", sourceIds: ["own_a"] });
    const claimB = makeClaim({ id: "claim_b", valueHash: "h_b", sourceIds: ["own_b"] });
    const ownA = makeSource({ id: "own_a", title: "Own A", agent: baseAgentId });
    const ownB = makeSource({ id: "own_b", title: "Own B", agent: baseAgentId });
    const independentA = makeSource({
      id: "indep_a",
      title: "Independent A",
      origin: "independent_retrieval",
      agent: baseAgentId,
      claimIds: ["claim_a"],
    });
    const independentB = makeSource({
      id: "indep_b",
      title: "Independent B",
      origin: "independent_retrieval",
      agent: baseAgentId,
      claimIds: ["claim_b"],
    });
    const ledger = makeLedger([claimA, claimB], [ownA, ownB, independentA, independentB]);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "independent_corroboration_conflict",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });

    const a = slices.find((entry) => entry.claim.id === "claim_a");
    const b = slices.find((entry) => entry.claim.id === "claim_b");
    expect(a?.sources.map((s) => s.id)).toContain("indep_a");
    expect(b?.sources.map((s) => s.id)).toContain("indep_b");
  });

  it("never lets a late claim starve when 100+ sources overflow the cap", () => {
    const firstClaim = makeClaim({ id: "claim_first", valueHash: "h1", sourceIds: ["src_0", "src_1", "src_2"] });
    const lastClaim = makeClaim({ id: "claim_last", valueHash: "h2", sourceIds: ["src_99", "src_100", "src_101"] });
    const sources: ClaimReviewSource[] = [];
    for (let i = 0; i < 120; i += 1) {
      sources.push(makeSource({ id: `src_${i}`, title: `Source ${i}`, agent: baseAgentId }));
    }
    const ledger = makeLedger([firstClaim, lastClaim], sources);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });

    const firstSlice = slices.find((entry) => entry.claim.id === "claim_first");
    const lastSlice = slices.find((entry) => entry.claim.id === "claim_last");
    expect(firstSlice?.sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(["src_0", "src_1", "src_2"]),
    );
    // The 100+ indexed sources belong to the late claim; the cap must not strip them.
    expect(lastSlice?.sources.map((s) => s.id)).toEqual(
      expect.arrayContaining(["src_99", "src_100", "src_101"]),
    );
  });

  it("rejects an empty claim context with a fail-closed error", () => {
    // A claim whose own sourceIds reference nothing and no independent source
    // is bound to it; the ledger also has zero sources overall, so the prompt
    // would be empty.
    const claim = makeClaim({ id: "claim_empty", valueHash: "h_empty", sourceIds: ["ghost"] });
    const ledger = makeLedger([claim], []);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });
    expect(slices[0]?.sources).toHaveLength(0);
    expect(() =>
      assertAllClaimsHaveAtLeastOneSource(slices, "claim_source_entailment"),
    ).toThrow(DeepWorkExecutionError);
    expect(() =>
      assertAllClaimsHaveAtLeastOneSource(slices, "claim_source_entailment"),
    ).toThrowError(/zero sources in the prompt context/);
  });

  /**
   * R2B (per-claim cap on the reserved set): a single claim with an
   * excessive number of `sourceIds` must NOT be allowed to exhaust the
   * global `maxTotalSources` budget before other claims get any sources.
   * The pre-R2B code reserved ALL of `claim.sourceIds` regardless of
   * the global cap, which would blow past 80 and starve sibling claims.
   */
  it("caps a single claim's reserved sources at maxSourcesPerClaim, not the full sourceIds", () => {
    const heavy = makeClaim({
      id: "heavy",
      valueHash: "h_h",
      // 50 of its own sources — must be capped, not all reserved.
      sourceIds: Array.from({ length: 50 }, (_, i) => `own_${i}`),
    });
    const light = makeClaim({ id: "light", valueHash: "h_l", sourceIds: ["own_light"] });
    const sources: ClaimReviewSource[] = [];
    for (let i = 0; i < 50; i += 1) {
      sources.push(makeSource({ id: `own_${i}`, title: `Heavy source ${i}`, agent: baseAgentId }));
    }
    sources.push(makeSource({ id: "own_light", title: "Light source", agent: baseAgentId }));
    const ledger = makeLedger([heavy, light], sources);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
      maxSourcesPerClaim: 6,
    });

    const heavySlice = slices.find((entry) => entry.claim.id === "heavy");
    const lightSlice = slices.find((entry) => entry.claim.id === "light");
    // Heavy claim: capped at 6, not 50.
    expect(heavySlice?.sources.length).toBe(6);
    // Light claim: still got its own source — not starved.
    expect(lightSlice?.sources.map((s) => s.id)).toContain("own_light");
    // Global total stays inside the cap.
    const total = slices.reduce((acc, slice) => acc + slice.sources.length, 0);
    expect(total).toBeLessThanOrEqual(80);
  });

  /**
   * R2B (hard global cap): the union of reserved + filler must NEVER
   * exceed `maxTotalSources` even when the ledger contains >80 sources.
   * The pre-R2B code reserved every claim.sourceIds entry, then ran
   * the filler until `reserved.size >= maxTotalSources`. The filler
   * break was the only global guard; a heavy reserved set bypassed it.
   */
  it("fails closed when the required floor itself exceeds maxTotalSources", () => {
    // 100 claims each with 1 own source + a giant pool of filler.
    const claims: ResearchClaim[] = [];
    const sources: ClaimReviewSource[] = [];
    for (let i = 0; i < 100; i += 1) {
      const claimId = `claim_${i}`;
      const sourceId = `own_${i}`;
      claims.push(makeClaim({ id: claimId, valueHash: `h_${i}`, sourceIds: [sourceId] }));
      sources.push(makeSource({ id: sourceId, title: `Own ${i}`, agent: baseAgentId }));
    }
    for (let i = 0; i < 400; i += 1) {
      sources.push(makeSource({ id: `filler_${i}`, title: `Filler ${i}`, agent: baseAgentId }));
    }
    const ledger = makeLedger(claims, sources);

    expect(() => buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
      maxSourcesPerClaim: 4,
    })).toThrowError(/cannot admit the required per-claim evidence floor/);
  });

  it("allocates a complete minimum round before fair filler and de-duplicates the catalog", () => {
    const claims: ResearchClaim[] = [];
    const sources: ClaimReviewSource[] = [];
    for (let i = 0; i < 25; i += 1) {
      const ownIds = Array.from({ length: 6 }, (_, sourceIndex) => `own_${i}_${sourceIndex}`);
      claims.push(makeClaim({ id: `claim_${i}`, valueHash: `h_${i}`, sourceIds: ownIds }));
      ownIds.forEach((id) => sources.push(makeSource({ id, agent: baseAgentId })));
    }
    const ledger = makeLedger(claims, sources);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "claim_source_entailment",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
      maxSourcesPerClaim: 6,
    });

    expect(slices).toHaveLength(25);
    expect(slices.every((slice) => slice.sources.length >= 1)).toBe(true);
    expect(slices.at(-1)?.sources[0]?.id).toBe("own_24_0");
    expect(uniqueSourcesFromSlices(slices)).toHaveLength(80);
    expect(Math.max(...slices.map((slice) => slice.sources.length)) - Math.min(...slices.map((slice) => slice.sources.length))).toBeLessThanOrEqual(1);

    const shared = makeSource({ id: "shared", agent: baseAgentId });
    const sharedLedger = makeLedger(
      [
        makeClaim({ id: "shared_a", valueHash: "h_a", sourceIds: ["shared"] }),
        makeClaim({ id: "shared_b", valueHash: "h_b", sourceIds: ["shared"] }),
      ],
      [shared],
    );
    const sharedSlices = buildClaimEvidenceSlices(sharedLedger, {
      pass: "claim_source_entailment",
      maxTotalSources: 1,
      minSourcesPerClaim: 1,
    });
    expect(sharedSlices.every((slice) => slice.sources[0]?.id === "shared")).toBe(true);
    expect(uniqueSourcesFromSlices(sharedSlices)).toEqual([shared]);
  });

  /**
   * R2B (minSourcesPerClaim floor): a claim that has zero of its own
   * `sourceIds` AND no independent source bound to it would otherwise
   * land in the prompt with 0 sources, which fails the readiness
   * check. The pre-R2B code only enforced the floor indirectly via
   * filler. We now explicitly look up an independent source whose
   * `claimIds` includes the claim so the floor is met before filler.
   */
  it("satisfies minSourcesPerClaim from independent sources when own sourceIds is empty", () => {
    const claim = makeClaim({ id: "claim_orphan", valueHash: "h_o", sourceIds: [] });
    const indep = makeSource({
      id: "indep_for_orphan",
      title: "Independent evidence for the orphan",
      origin: "independent_retrieval",
      agent: baseAgentId,
      claimIds: ["claim_orphan"],
    });
    const ledger = makeLedger([claim], [indep]);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "independent_corroboration_conflict",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });

    const slice = slices.find((entry) => entry.claim.id === "claim_orphan");
    // The min-1 floor was satisfied by the independent source whose
    // claimIds binding includes this claim.
    expect(slice?.sources.map((s) => s.id)).toContain("indep_for_orphan");
  });

  it("floor pass does not use an unrelated independent source", () => {
    // The R2B floor pass must require `source.claimIds` to include the
    // claim under review — otherwise a claim with empty `sourceIds`
    // could be satisfied by any leftover independent source, breaking
    // the Phase 2A claim/source binding. We assert this by giving the
    // ledger TWO claims: a target whose `sourceIds` is empty AND a
    // sibling claim that owns a bound independent source. The floor
    // pass must NOT lift the sibling's source into the target's slice.
    const target = makeClaim({ id: "claim_target", valueHash: "h_t", sourceIds: [] });
    const sibling = makeClaim({ id: "claim_sibling", valueHash: "h_s", sourceIds: [] });
    const siblingBound = makeSource({
      id: "indep_for_sibling",
      title: "Bound to sibling claim only",
      origin: "independent_retrieval",
      agent: baseAgentId,
      claimIds: ["claim_sibling"],
    });
    const ledger = makeLedger([target, sibling], [siblingBound]);

    const slices = buildClaimEvidenceSlices(ledger, {
      pass: "independent_corroboration_conflict",
      maxTotalSources: 80,
      minSourcesPerClaim: 1,
    });

    const targetSlice = slices.find((entry) => entry.claim.id === "claim_target");
    const siblingSlice = slices.find((entry) => entry.claim.id === "claim_sibling");
    // The sibling's bound source belongs to the sibling's slice, not
    // the target's, even though the target has no own sources.
    expect(siblingSlice?.sources.map((s) => s.id)).toContain("indep_for_sibling");
    expect(targetSlice?.sources.map((s) => s.id)).not.toContain("indep_for_sibling");
  });
});
