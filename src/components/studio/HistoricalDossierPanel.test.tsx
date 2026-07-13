// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import type { ResearchDossier } from "@/lib/research/storage";
import type {
  AgentEvidenceLedgerEntry,
  AgentId,
  AgentOutput,
  EvidenceLedger,
  SynthesisOutput,
  ValidationLedger,
} from "@/lib/schema/research-schema";
import {
  HistoricalDossierPanel,
  resolveHistoricalSynthesis,
} from "./HistoricalDossierPanel";

const AGENT_ORDER: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

vi.mock("@/components/report/ReportView", () => ({
  ReportView: ({
    activeAgent,
    outputs,
    onSwitchTab,
  }: {
    activeAgent: AgentId;
    outputs: Record<AgentId, AgentOutput | null>;
    onSwitchTab?: (agentId: AgentId) => void;
  }) => (
    <div data-report-view>
      <div>
        {AGENT_ORDER.map((agentId) => (
          <button
            key={agentId}
            type="button"
            aria-pressed={activeAgent === agentId}
            onClick={() => onSwitchTab?.(agentId)}
          >
            {agentId}
          </button>
        ))}
      </div>
      <div data-testid="active-output">{outputs[activeAgent]?.agent ?? "missing"}</div>
    </div>
  ),
}));

afterEach(cleanup);

const NOW = "2026-07-13T00:00:00.000Z";

function marketEvidence(): AgentEvidenceLedgerEntry {
  return {
    agentId: "market-sizer",
    retrieval: {
      status: "retrieved",
      sourceOrigin: "agent_retrieval",
      providerId: "tavily",
      sourceCount: 1,
      sources: [
        {
          id: "source-1",
          title: "Primary market source",
          url: "https://example.com/market",
          snippet: "Primary evidence",
          accessedAt: NOW,
          retrievedAt: NOW,
          confidence: "high",
          agent: "market-sizer",
        },
      ],
    },
    allowlist: {
      policy: "strict",
      total: 1,
      matched: 1,
      rejected: 0,
      missingUrl: 0,
      retained: 1,
    },
    grounding: "grounded",
    updatedAt: NOW,
  };
}

function evidenceLedger(entry: AgentEvidenceLedgerEntry): EvidenceLedger {
  return { version: 1, agents: { "market-sizer": entry } };
}

function validationLedger(): ValidationLedger {
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
      status: "matched",
      strictAgentCount: 1,
      compatibleAgentCount: 5,
      matched: 1,
      rejected: 0,
      missingUrl: 0,
      groundedAgentCount: 1,
      interpretation: "url_membership_only",
    },
    sourceDiversity: {
      status: "single_domain",
      uniqueSourceCount: 1,
      uniqueDomainCount: 1,
      interpretation: "descriptive_only",
    },
    citationCoverage: {
      status: "complete",
      outputsEvaluated: 6,
      outputsWithCitations: 6,
      topLevelCitations: 6,
      citationsWithHttpUrl: 6,
      nestedReferences: 1,
      resolvedNestedReferences: 1,
      unresolvedNestedReferences: 0,
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
      statement: "Semantic verification was not run.",
    },
    synthesisSummary: "Structural validation complete; semantic validation not run.",
  };
}

function createDossier(): ResearchDossier {
  const evidence = marketEvidence();
  const agents = {} as ResearchDossier["agents"];

  for (const agentId of AGENT_ORDER) {
    agents[agentId] = {
      output: generateMockAgentOutput(agentId, "Historical dossier", ["history"]),
      resolvedProviderId: "openai",
      degraded: false,
    };
  }

  agents["market-sizer"] = {
    ...agents["market-sizer"],
    evidence,
    resolvedProviderId: "mock",
    degraded: true,
    degradedReason: "network_error",
  };

  return {
    version: 1,
    agents,
    evidence: evidenceLedger(evidence),
    validation: validationLedger(),
    degraded: true,
  };
}

describe("resolveHistoricalSynthesis", () => {
  it("prefers the dossier synthesis and falls back to the legacy result contract", () => {
    const dossier = createDossier();
    const dossierOutput = dossier.agents.synthesis.output as SynthesisOutput;
    dossierOutput.execSummary = "Synthesis from the persisted dossier";
    const legacyResult = JSON.stringify({
      ...dossierOutput,
      execSummary: "Synthesis from the legacy result",
    });

    expect(resolveHistoricalSynthesis(dossier, legacyResult)?.execSummary).toBe(
      "Synthesis from the persisted dossier",
    );
    expect(resolveHistoricalSynthesis(undefined, legacyResult)?.execSummary).toBe(
      "Synthesis from the legacy result",
    );
  });

  it("drops unsafe legacy dossier links and canonicalizes public citations", () => {
    const dossier = createDossier();
    const output = dossier.agents.synthesis.output as SynthesisOutput;
    output.citations = [
      { ...output.citations[0], id: "private", url: "http://127.0.0.1/admin" },
      { ...output.citations[0], id: "credentials", url: "https://user:pass@example.com/private" },
      { ...output.citations[0], id: "public", url: "https://Example.com/report/?utm_source=test#section" },
    ];

    expect(resolveHistoricalSynthesis(dossier, "")?.citations).toEqual([
      expect.objectContaining({ url: "https://example.com/report" }),
    ]);
  });
});

describe("HistoricalDossierPanel", () => {
  it("exposes six agent outputs, provenance, and the persisted evidence protocol", () => {
    render(
      <HistoricalDossierPanel
        dossier={createDossier()}
        mode="standard"
        status="completed"
        fallbackProvider="openai"
      />,
    );

    expect(screen.getByRole("heading", { name: "Five specialists, one synthesis reviewer" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.getByTestId("active-output").textContent).toBe("synthesis");
    expect(screen.getByText(/1 source collected/)).toBeTruthy();
    expect(screen.getByText(/Semantic claim verification was not run/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "market-sizer" }));

    expect(screen.getByTestId("active-output").textContent).toBe("market-sizer");
    expect(screen.getByText(/LLM · Mock provider/)).toBeTruthy();
    expect(screen.getByText(/demo · network_error/)).toBeTruthy();
    expect(screen.getByText(/Evidence · tavily/)).toBeTruthy();
  });

  it("supports arrow, Home, and End keyboard switching", () => {
    render(<HistoricalDossierPanel dossier={createDossier()} />);
    const marketButton = screen.getByRole("button", { name: "market-sizer" });
    fireEvent.click(marketButton);
    marketButton.focus();

    fireEvent.keyDown(marketButton, { key: "ArrowRight" });
    const competitorButton = screen.getByRole("button", { name: "competitor-analyst" });
    expect(screen.getByTestId("active-output").textContent).toBe("competitor-analyst");
    expect(document.activeElement).toBe(competitorButton);

    fireEvent.keyDown(competitorButton, { key: "End" });
    const synthesisButton = screen.getByRole("button", { name: "synthesis" });
    expect(screen.getByTestId("active-output").textContent).toBe("synthesis");
    expect(document.activeElement).toBe(synthesisButton);

    fireEvent.keyDown(synthesisButton, { key: "Home" });
    expect(screen.getByTestId("active-output").textContent).toBe("market-sizer");
    expect(document.activeElement).toBe(marketButton);
  });

  it("does not invent a six-agent archive for a legacy run without a dossier", () => {
    const { container } = render(<HistoricalDossierPanel dossier={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("keeps a cancelled historical dossier visibly cancelled", () => {
    render(<HistoricalDossierPanel dossier={createDossier()} status="cancelled" />);

    expect(screen.getAllByText("Cancelled").length).toBeGreaterThanOrEqual(2);
  });
});
