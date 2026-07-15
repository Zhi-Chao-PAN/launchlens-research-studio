// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import type {
  AgentEvidenceLedgerEntry,
  AgentId,
  EvidenceLedger,
  EvidenceSource,
  ValidationLedger,
} from "@/lib/schema/research-schema";
import type {
  DeepCapabilityRequirementId,
  DeepResearchCapability,
} from "@/lib/research/deep-research/capability";
import type { DeepRunProgress } from "@/lib/research/deep-research/model";
import { ResearchProtocolPanel } from "./ResearchProtocolPanel";

const NOW = "2026-07-13T00:00:00.000Z";
const DEEP_REQUIREMENTS: DeepCapabilityRequirementId[] = [
  "explicit_opt_in",
  "durable_state",
  "generation_provider",
  "retrieval_provider",
  "semantic_reviewer",
  "worker_wake",
  "independent_recovery",
];

function deepCapability(
  availability: DeepResearchCapability["availability"],
  blocker?: DeepCapabilityRequirementId,
): DeepResearchCapability {
  return {
    mode: "deep",
    id: "deep",
    label: "Deep Research",
    description: "Evidence-first research",
    depthLabel: "Multi-pass evidence audit",
    availability,
    checkedAt: NOW,
    requirements: DEEP_REQUIREMENTS.map((id) => ({
      id,
      ready: id !== blocker,
      label: id,
      detail: `${id} status`,
    })),
    blockers: blocker ? [blocker] : [],
    capabilityNotice: "Runtime capability",
    expectedDurationSec: { min: 600, max: 1200 },
    expectedDurationLabel: "10-20 min target",
    validationPasses: 3,
    retrieval: "required",
    requiresAsyncExecution: true,
    maxSynchronousDurationSec: 300,
    lastRecoveryAt: NOW,
    lastRecoveryAgeMs: 0,
  };
}

function source(id: string, url: string, agent: AgentId): EvidenceSource {
  return {
    id,
    title: id,
    url,
    snippet: "Retrieved excerpt",
    accessedAt: NOW,
    retrievedAt: NOW,
    confidence: "medium",
    agent,
  };
}

function evidenceEntry(
  agentId: AgentId,
  sources: EvidenceSource[],
  matched: number,
  rejected: number,
): AgentEvidenceLedgerEntry {
  return {
    agentId,
    retrieval: {
      status: "retrieved",
      sourceOrigin: agentId === "synthesis" ? "specialist_union" : "agent_retrieval",
      providerId: "tavily",
      sourceCount: sources.length,
      sources,
    },
    allowlist: {
      policy: "strict",
      total: matched + rejected,
      matched,
      rejected,
      missingUrl: 0,
      retained: matched,
    },
    grounding: "grounded",
    updatedAt: NOW,
  };
}

function notConfiguredEvidence(): EvidenceLedger {
  return {
    version: 1,
    agents: {
      "market-sizer": {
        agentId: "market-sizer",
        retrieval: {
          status: "not_configured",
          sourceOrigin: "none",
          sourceCount: 0,
          sources: [],
        },
        allowlist: {
          policy: "compatible",
          total: 2,
          matched: 0,
          rejected: 0,
          missingUrl: 0,
          retained: 2,
        },
        grounding: "ungrounded",
        updatedAt: NOW,
      },
    },
  };
}

function structuralValidation(): ValidationLedger {
  return {
    version: 1,
    generatedAt: NOW,
    stage: "final",
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
      status: "matched_with_rejections",
      strictAgentCount: 2,
      compatibleAgentCount: 4,
      matched: 3,
      rejected: 1,
      missingUrl: 0,
      groundedAgentCount: 2,
      interpretation: "url_membership_only",
    },
    sourceDiversity: {
      status: "multiple_domains",
      uniqueSourceCount: 2,
      uniqueDomainCount: 2,
      interpretation: "descriptive_only",
    },
    citationCoverage: {
      status: "partial",
      outputsEvaluated: 6,
      outputsWithCitations: 5,
      topLevelCitations: 4,
      citationsWithHttpUrl: 3,
      nestedReferences: 3,
      resolvedNestedReferences: 2,
      unresolvedNestedReferences: 1,
      interpretation: "structural_presence_and_id_resolution_only",
    },
    provenance: {
      status: "mock_and_degraded_outputs_present",
      mockAgents: ["market-sizer"],
      degradedAgents: ["market-sizer"],
      interpretation: "execution_provenance_only",
    },
    semanticValidation: {
      status: "not_run",
      claimToSourceEntailment: false,
      factualAccuracy: false,
      sourceReliability: false,
      statement: "Semantic checks were not run.",
    },
    synthesisSummary: "Structural checks only.",
  };
}

describe("ResearchProtocolPanel", () => {
  it("deduplicates retrieved sources and reports strict URL grounding without claiming factual verification", () => {
    const evidence: EvidenceLedger = {
      version: 1,
      agents: {
        "market-sizer": evidenceEntry(
          "market-sizer",
          [
            source("source-a", "https://Example.com/report/?utm_source=test#section", "market-sizer"),
            source("source-b", "https://beta.example/pricing", "market-sizer"),
          ],
          2,
          1,
        ),
        "competitor-analyst": evidenceEntry(
          "competitor-analyst",
          [source("legacy-duplicate-id", "https://example.com/report", "competitor-analyst")],
          1,
          0,
        ),
      },
    };

    render(<ResearchProtocolPanel mode="standard" evidence={evidence} />);

    expect(screen.getByText("2 sources collected")).toBeTruthy();
    expect(screen.getByText(/URL allowlist active/)).toBeTruthy();
    expect(screen.getByText(/URL matching checks membership only/)).toBeTruthy();
    expect(screen.getByText(/3 citation URLs matched/)).toBeTruthy();
    expect(screen.getByText(/1 citation rejected/)).toBeTruthy();
    expect(screen.getByText(/2\/6 outputs URL-grounded/)).toBeTruthy();
    expect(screen.getByText(/Claim-to-source verification remains pending/)).toBeTruthy();
  });

  it("lets a not-configured evidence ledger override legacy reported citations", () => {
    const output = generateMockAgentOutput("market-sizer", "AI research product", ["research"]);

    render(
      <ResearchProtocolPanel
        mode="standard"
        evidence={notConfiguredEvidence()}
        outputs={{ "market-sizer": output }}
      />,
    );

    expect(screen.getByText("Retrieval not configured")).toBeTruthy();
    expect(screen.queryByText(`${output.citations.length} reported citations`)).toBeNull();
    expect(screen.getByText("Claim-to-source verification remains pending")).toBeTruthy();
  });

  it("falls back to reported citations for snapshots without an evidence ledger", () => {
    const generated = generateMockAgentOutput("market-sizer", "AI research product", ["research"]);
    const output = { ...generated, citations: generated.citations.slice(0, 2) };

    render(<ResearchProtocolPanel mode="standard" outputs={{ "market-sizer": output }} />);

    expect(screen.getByText("2 reported citations")).toBeTruthy();
    expect(screen.getByText("Citation URL verification not yet active")).toBeTruthy();
  });

  it("renders persisted structural validation while keeping semantic validation explicitly pending", () => {
    render(<ResearchProtocolPanel mode="standard" validation={structuralValidation()} />);

    expect(screen.getByText("1 validation pass")).toBeTruthy();
    expect(screen.getByText(/2\/3 citation references resolved/)).toBeTruthy();
    expect(screen.getByText(/2 sources across 2 domains/)).toBeTruthy();
    expect(screen.getByText(/1 section using demo fallback/)).toBeTruthy();
    expect(screen.getByText(/Semantic claim verification was not run/)).toBeTruthy();
  });

  it("fails closed when a persisted ledger has only a valid outer shell", () => {
    render(
      <ResearchProtocolPanel
        mode="standard"
        evidence={{ version: 1, agents: { "market-sizer": {} } } as any}
        validation={{ version: 1, generatedAt: "2026", stage: "final" } as any}
      />,
    );

    expect(screen.getByRole("heading", { name: "Research protocol" })).toBeTruthy();
    expect(screen.getByText("1 validation pass")).toBeTruthy();
  });

  it("renders cancellation as a terminal execution outcome", () => {
    render(<ResearchProtocolPanel mode="standard" status="cancelled" />);

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Ready")).toBeNull();
  });

  it("shows the live production gate when Deep Research is ready", () => {
    render(
      <ResearchProtocolPanel
        mode="deep"
        runtimeCapability={deepCapability("available")}
      />,
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("7/7 controls ready")).toBeTruthy();
    expect(screen.getByText(/Durable 10–20 minute execution is ready/)).toBeTruthy();
    expect(screen.queryByText("Preview only")).toBeNull();
  });

  it("names the first unmet Deep production control without starting the mode", () => {
    render(
      <ResearchProtocolPanel
        mode="deep"
        runtimeCapability={deepCapability("preview", "independent_recovery")}
      />,
    );

    expect(screen.getByText("Preview only")).toBeTruthy();
    expect(screen.getByText(/6\/7 controls ready/)).toBeTruthy();
    expect(screen.getAllByText(/Next blocker: independent recovery/)).toHaveLength(2);
  });

  it("renders the durable eleven-unit work graph from observer progress", () => {
    const deepRun: DeepRunProgress = {
      revision: 12,
      lifecycle: "active",
      currentWorkIndex: 5,
      totalWork: 11,
      currentWork: {
        id: "review:claim-source-entailment",
        kind: "semantic_pass_1",
        status: "running",
        attempts: 2,
        maxAttempts: 3,
      },
      nextWakeAt: 2_000,
      totalAttempts: 7,
    };

    render(
      <ResearchProtocolPanel
        mode="deep"
        runtimeCapability={deepCapability("available")}
        deepRun={deepRun}
        status="running"
      />,
    );

    expect(screen.getByText(/5\/11 work units committed/)).toBeTruthy();
    expect(screen.getByText(/Review 1 · claim-source entailment/)).toBeTruthy();
    expect(screen.getByText(/attempt 2\/3/)).toBeTruthy();
    const graph = screen.getByRole("progressbar", { name: /5\/11 work units committed/ });
    expect(graph.getAttribute("aria-valuenow")).toBe("5");
    expect(graph.querySelectorAll("span")).toHaveLength(11);
  });
});
