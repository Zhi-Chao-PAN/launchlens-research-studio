// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import {
  RESEARCH_AGENTS,
  type AgentId,
  type AgentState,
  type ResearchSession,
} from "@/lib/schema/research-schema";
import { createEvidenceLedger } from "./evidence-ledger";
import { buildResearchValidation } from "./validation-ledger";

const NOW = "2026-07-13T12:00:00.000Z";

function completeSession(options: {
  mode?: "standard" | "deep";
  providerId?: string;
  includeSynthesis?: boolean;
} = {}): ResearchSession {
  const providerId = options.providerId ?? "openai";
  const agents = {} as Record<AgentId, AgentState>;
  const specialistOutputs = RESEARCH_AGENTS.map((agentId) =>
    generateMockAgentOutput(agentId, "Evidence-led product research", ["evidence"]),
  );

  RESEARCH_AGENTS.forEach((agentId, index) => {
    agents[agentId] = {
      id: agentId,
      status: "done",
      progress: 100,
      currentStep: "Complete",
      output: specialistOutputs[index],
      resolvedProviderId: providerId,
    };
  });
  agents.synthesis = options.includeSynthesis
    ? {
        id: "synthesis",
        status: "done",
        progress: 100,
        currentStep: "Complete",
        output: generateMockAgentOutput(
          "synthesis",
          "Evidence-led product research",
          ["evidence"],
          specialistOutputs,
        ),
        resolvedProviderId: providerId,
      }
    : {
        id: "synthesis",
        status: "idle",
        progress: 0,
        currentStep: "Waiting",
      };

  return {
    id: "validation-session",
    query: "Evidence-led product research",
    keywords: ["evidence"],
    mode: options.mode ?? "standard",
    providerId,
    providerModel: "test-model",
    createdAt: NOW,
    updatedAt: NOW,
    status: options.includeSynthesis ? "completed" : "running",
    agents,
    citations: [],
    evidence: createEvidenceLedger(NOW),
  };
}

describe("buildResearchValidation", () => {
  it("exposes one deep-module function and records one honest Standard structural pass", async () => {
    const exportedInterface = await import("./validation-ledger");
    expect(Object.keys(exportedInterface)).toEqual(["buildResearchValidation"]);

    const session = completeSession({ providerId: "mock" });
    const ledger = buildResearchValidation(session, NOW);

    expect(ledger).toMatchObject({
      version: 1,
      generatedAt: NOW,
      stage: "pre_synthesis",
      protocol: {
        requestedMode: "standard",
        executedPasses: 1,
        passKind: "structural_evidence_integrity",
        deepMultiPassExecuted: false,
      },
      specialists: {
        expected: 5,
        completedWithOutput: 5,
        failed: 0,
        incomplete: 0,
        status: "complete",
      },
      urlAllowlist: {
        status: "not_run",
        strictAgentCount: 0,
        compatibleAgentCount: 5,
        interpretation: "url_membership_only",
      },
      provenance: {
        status: "mock_outputs_present",
        mockAgents: RESEARCH_AGENTS,
        degradedAgents: [],
      },
      semanticValidation: {
        status: "not_run",
        claimToSourceEntailment: false,
        factualAccuracy: false,
        sourceReliability: false,
      },
    });
    expect(ledger.synthesisSummary).toContain("not factual verification");
    expect(ledger.synthesisSummary).toContain("NOT RUN");
  });

  it("separates strict URL membership, descriptive source diversity, and citation-id coverage", () => {
    const session = completeSession();
    const evidence = session.evidence!;
    const market = evidence.agents["market-sizer"]!;
    market.retrieval = {
      status: "retrieved",
      sourceOrigin: "agent_retrieval",
      providerId: "tavily",
      sourceCount: 2,
      sources: [
        {
          id: "source-1",
          title: "One",
          url: "https://example.com/report",
          snippet: "One",
          accessedAt: NOW,
          confidence: "high",
          agent: "market-sizer",
        },
        {
          id: "source-2",
          title: "Two",
          url: "https://other.example/data",
          snippet: "Two",
          accessedAt: NOW,
          confidence: "medium",
          agent: "market-sizer",
        },
      ],
    };
    market.allowlist = {
      policy: "strict",
      total: 3,
      matched: 2,
      rejected: 1,
      missingUrl: 1,
      retained: 2,
    };
    market.grounding = "grounded";

    const competitor = evidence.agents["competitor-analyst"]!;
    competitor.retrieval = {
      status: "retrieved",
      sourceOrigin: "agent_retrieval",
      providerId: "tavily",
      sourceCount: 1,
      sources: [
        {
          id: "source-3",
          title: "Three",
          url: "https://example.com/competitor",
          snippet: "Three",
          accessedAt: NOW,
          confidence: "medium",
          agent: "competitor-analyst",
        },
      ],
    };
    competitor.allowlist = {
      policy: "strict",
      total: 1,
      matched: 1,
      rejected: 0,
      missingUrl: 0,
      retained: 1,
    };
    competitor.grounding = "grounded";

    const marketOutput = session.agents["market-sizer"].output;
    if (marketOutput?.agent !== "market-sizer") throw new Error("market output missing");
    marketOutput.marketSize.sources.push("missing-citation-id");

    const ledger = buildResearchValidation(session, NOW);
    expect(ledger.urlAllowlist).toMatchObject({
      status: "matched_with_rejections",
      strictAgentCount: 2,
      compatibleAgentCount: 3,
      matched: 3,
      rejected: 1,
      missingUrl: 1,
      groundedAgentCount: 2,
      interpretation: "url_membership_only",
    });
    expect(ledger.sourceDiversity).toEqual({
      status: "multiple_domains",
      uniqueSourceCount: 3,
      uniqueDomainCount: 2,
      interpretation: "descriptive_only",
    });
    expect(ledger.citationCoverage).toMatchObject({
      status: "partial",
      outputsEvaluated: 5,
      outputsWithCitations: 5,
      unresolvedNestedReferences: 1,
      interpretation: "structural_presence_and_id_resolution_only",
    });
  });

  it("produces a final immutable snapshot without claiming Deep's three-pass protocol", () => {
    const session = completeSession({ mode: "deep", includeSynthesis: true });
    session.agents["pricing-scout"] = {
      ...session.agents["pricing-scout"],
      degraded: true,
      degradedReason: "network_error",
    };
    const before = JSON.stringify(session);

    const ledger = buildResearchValidation(session, NOW);

    expect(JSON.stringify(session)).toBe(before);
    expect(ledger.stage).toBe("final");
    expect(ledger.protocol).toEqual({
      requestedMode: "deep",
      executedPasses: 1,
      passKind: "structural_evidence_integrity",
      deepMultiPassExecuted: false,
    });
    expect(ledger.provenance).toMatchObject({
      status: "degraded_outputs_present",
      degradedAgents: ["pricing-scout"],
    });
    expect(ledger.semanticValidation.statement).toMatch(/were not evaluated/i);
  });

  it("handles legacy sessions with no evidence or completed outputs", () => {
    const session = completeSession();
    delete session.evidence;
    for (const agentId of RESEARCH_AGENTS) {
      session.agents[agentId] = {
        id: agentId,
        status: "idle",
        progress: 0,
        currentStep: "Waiting",
      };
    }

    const ledger = buildResearchValidation(session, NOW);
    expect(ledger.specialists.status).toBe("none");
    expect(ledger.urlAllowlist.status).toBe("not_run");
    expect(ledger.sourceDiversity.status).toBe("not_available");
    expect(ledger.citationCoverage.status).toBe("not_available");
  });
});
