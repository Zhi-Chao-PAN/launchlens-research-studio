import { describe, it, expect } from "vitest";
import { computeSourceCitationMap } from "./synthesis-parser";
import type { SynthesisOutput } from "./synthesis-parser";

describe("computeSourceCitationMap", () => {
  const makeSynthesis = (overrides: Partial<SynthesisOutput> = {}): SynthesisOutput => ({
    agent: "test",
    execSummary: "This is a summary with [1] and [2] citations.",
    opportunityScore: 75,
    riskScore: 40,
    keyInsights: [
      { insight: "First insight from [1] source.", supportingAgents: [], confidence: "high" },
      { insight: "Second insight cites [3] and [1].", supportingAgents: [], confidence: "medium" },
    ],
    topThreeOpportunities: [
      { title: "Opp 1", description: "Desc with [2]", rationale: "Rationale with [1]" },
      { title: "Opp 2", description: "No cites here", rationale: "Still none" },
      { title: "Opp 3", description: "[3] is cited here", rationale: "And [2] too" },
    ],
    topThreeRisks: [
      { title: "Risk 1", description: "Risk from [1]", mitigation: "Mitigate with [2]" },
      { title: "Risk 2", description: "No cite", mitigation: "Also none" },
      { title: "Risk 3", description: "[4] risk", mitigation: "[4] mitigation" },
    ],
    recommendedNextStep: "Next step references [1] and [3].",
    launchlensBrief: "",
    citations: [],
    ...overrides,
  });

  it("maps source indices to sections that cite them", () => {
    const result = computeSourceCitationMap(makeSynthesis());

    // Source 0 ([1]) should be in Executive Summary, Key Insights, Opportunities, Risks, Next Step
    expect(result.get(0)).toContain("Executive Summary");
    expect(result.get(0)).toContain("Key Insights");
    expect(result.get(0)).toContain("Opportunities");
    expect(result.get(0)).toContain("Risks");
    expect(result.get(0)).toContain("Next Step");

    // Source 1 ([2]) should be in Executive Summary, Opportunities, Risks
    expect(result.get(1)).toContain("Executive Summary");
    expect(result.get(1)).toContain("Opportunities");
    expect(result.get(1)).toContain("Risks");

    // Source 2 ([3]) should be in Key Insights, Opportunities, Next Step
    expect(result.get(2)).toContain("Key Insights");
    expect(result.get(2)).toContain("Opportunities");
    expect(result.get(2)).toContain("Next Step");

    // Source 3 ([4]) should be only in Risks
    expect(result.get(3)).toEqual(["Risks"]);
  });

  it("returns empty map when no citations exist", () => {
    const synth = makeSynthesis({
      execSummary: "No citations here",
      keyInsights: [{ insight: "No cites", supportingAgents: [], confidence: "high" }],
      topThreeOpportunities: [{ title: "O", description: "d", rationale: "r" }],
      topThreeRisks: [{ title: "R", description: "d", mitigation: "m" }],
      recommendedNextStep: "nothing",
    });
    const result = computeSourceCitationMap(synth);
    expect(result.size).toBe(0);
  });

  it("handles empty synthesis gracefully", () => {
    const synth = makeSynthesis({
      execSummary: "",
      keyInsights: [],
      topThreeOpportunities: [],
      topThreeRisks: [],
      recommendedNextStep: "",
    });
    const result = computeSourceCitationMap(synth);
    expect(result.size).toBe(0);
  });

  it("does not duplicate section names even when cited multiple times in same section", () => {
    const synth = makeSynthesis({
      execSummary: "[1] [1] [1] lots of [1]",
    });
    const result = computeSourceCitationMap(synth);
    const sections = result.get(0);
    expect(sections?.filter((s) => s === "Executive Summary").length).toBe(1);
  });
});
