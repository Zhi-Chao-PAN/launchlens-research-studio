import { afterEach, describe, expect, it } from "vitest";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { createDeterministicStructuredCompletionProvider } from "@/lib/providers/mock-structured-completion";
import type { StructuredCompletionProvider } from "@/lib/providers/structured-completion";
import type { RetrievalProvider } from "@/lib/providers/retrieval.types";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import type { AgentId, ResearchSession } from "@/lib/schema/research-schema";
import { DeepWorkExecutionError } from "./service";
import { DeepSemanticReviewer, findingsForPass } from "./semantic-reviewer";

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
              source.origin === "independent_retrieval" && source.agent === claim.agentId,
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

  it("keeps shared URLs agent-scoped across focused independent retrievals", async () => {
    let session = await fixtureSession(["market-sizer", "competitor-analyst"]);
    const provider = successfulProvider();
    session = await new DeepSemanticReviewer({ provider, retrieval: liveRetrieval() })
      .runPass(session, "claim_source_entailment");
    const queries: string[] = [];
    const overlappingRetrieval: RetrievalProvider = {
      id: "overlapping-search",
      displayName: "Overlapping search",
      isMock: false,
      async search({ agentId, query }) {
        queries.push(query);
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

    expect(queries).toHaveLength(2);
    expect(new Set(queries).size).toBe(2);
    expect(queries.every((query) => query.length <= 280)).toBe(true);
    if (session.validation?.version !== 2) throw new Error("expected V2 ledger");
    const independent = session.validation.reviewSources.filter(
      (source) => source.origin === "independent_retrieval",
    );
    expect(new Set(independent.map((source) => source.agent))).toEqual(
      new Set(["market-sizer", "competitor-analyst"]),
    );
    expect(new Set(independent.map((source) => source.id)).size).toBe(2);
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
