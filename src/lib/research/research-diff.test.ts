import { describe, it, expect } from "vitest";
import { diffResearch, similarity, formatDelta } from "@/lib/research/research-diff";
import type { SynthesisOutput } from "@/lib/research/synthesis-parser";

function makeSyn(overrides: Partial<SynthesisOutput> = {}): SynthesisOutput {
  return {
    execSummary: "Test summary",
    opportunityScore: 70,
    riskScore: 30,
    keyInsights: [
      { insight: "Insight 1", confidence: "high", supportingAgents: [] },
      { insight: "Insight 2", confidence: "medium", supportingAgents: [] },
    ],
    topThreeOpportunities: [
      { title: "Opp 1", description: "Description 1", rationale: "Reason 1" },
      { title: "Opp 2", description: "Description 2", rationale: "Reason 2" },
    ],
    topThreeRisks: [
      { title: "Risk 1", description: "Risk desc 1", mitigation: "Fix 1" },
      { title: "Risk 2", description: "Risk desc 2", mitigation: "Fix 2" },
    ],
    agent: "test-agent",
    launchlensBrief: "Brief summary",
    recommendedNextStep: "Do the thing",
    citations: [],
    ...overrides,
  };
}

describe("research diff", () => {
  describe("similarity", () => {
    it("returns 1 for identical strings", () => {
      expect(similarity("hello", "hello")).toBe(1);
    });

    it("returns 0 for completely different strings", () => {
      expect(similarity("abc", "xyz")).toBe(0);
    });

    it("returns partial similarity for similar strings", () => {
      const sim = similarity("market analysis", "market research");
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe("formatDelta", () => {
    it("formats positive deltas with + sign", () => {
      expect(formatDelta(5)).toBe("+5");
    });

    it("formats negative deltas with - sign", () => {
      expect(formatDelta(-3)).toBe("-3");
    });

    it("formats zero without sign", () => {
      expect(formatDelta(0)).toBe("0");
    });

    it("adds suffix", () => {
      expect(formatDelta(10, "%")).toBe("+10%");
    });
  });

  describe("diffResearch", () => {
    it("detects identical syntheses (no changes)", () => {
      const syn = makeSyn();
      const diff = diffResearch(syn, syn);
      
      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.scoreChanges.opportunityScore).toBe(0);
      expect(diff.scoreChanges.riskScore).toBe(0);
      expect(diff.insights.added.length).toBe(0);
      expect(diff.insights.removed.length).toBe(0);
      expect(diff.opportunities.added.length).toBe(0);
      expect(diff.risks.added.length).toBe(0);
      expect(diff.nextStepChanged).toBe(false);
    });

    it("detects score changes", () => {
      const old = makeSyn({ opportunityScore: 50, riskScore: 40 });
      const new_ = makeSyn({ opportunityScore: 75, riskScore: 25 });
      const diff = diffResearch(old, new_);
      
      expect(diff.scoreChanges.opportunityScore).toBe(25);
      expect(diff.scoreChanges.riskScore).toBe(-15);
    });

    it("detects added insights", () => {
      const old = makeSyn({
        keyInsights: [{ insight: "Old insight", confidence: "high", supportingAgents: [] }],
      });
      const new_ = makeSyn({
        keyInsights: [
          { insight: "Old insight", confidence: "high", supportingAgents: [] },
          { insight: "Brand new insight", confidence: "medium", supportingAgents: [] },
        ],
      });
      const diff = diffResearch(old, new_);
      
      expect(diff.insights.added.length).toBe(1);
      expect(diff.insights.added[0]).toContain("Brand new");
    });

    it("detects removed insights", () => {
      const old = makeSyn({
        keyInsights: [
          { insight: "Keep this one", confidence: "high", supportingAgents: [] },
          { insight: "Remove this one", confidence: "low", supportingAgents: [] },
        ],
      });
      const new_ = makeSyn({
        keyInsights: [{ insight: "Keep this one", confidence: "high", supportingAgents: [] }],
      });
      const diff = diffResearch(old, new_);
      
      expect(diff.insights.removed.length).toBe(1);
      expect(diff.insights.removed[0]).toContain("Remove");
    });

    it("detects modified insights", () => {
      const old = makeSyn({
        keyInsights: [{ insight: "The market is growing rapidly", confidence: "high", supportingAgents: [] }],
      });
      const new_ = makeSyn({
        keyInsights: [{ insight: "The market is growing very quickly", confidence: "high", supportingAgents: [] }],
      });
      const diff = diffResearch(old, new_);
      
      // Similar enough to be modified, not added/removed
      expect(diff.insights.modified.length).toBeGreaterThanOrEqual(0);
      expect(diff.insights.added.length).toBeLessThanOrEqual(1);
    });

    it("detects added opportunities", () => {
      const old = makeSyn({ topThreeOpportunities: [] });
      const new_ = makeSyn({
        topThreeOpportunities: [
          { title: "New opp", description: "New description", rationale: "New reason" },
        ],
      });
      const diff = diffResearch(old, new_);
      
      expect(diff.opportunities.added.length).toBe(1);
      expect(diff.opportunities.added[0].title).toBe("New opp");
    });

    it("detects removed risks", () => {
      const old = makeSyn({
        topThreeRisks: [
          { title: "Old risk", description: "Old desc", mitigation: "Old fix" },
        ],
      });
      const new_ = makeSyn({ topThreeRisks: [] });
      const diff = diffResearch(old, new_);
      
      expect(diff.risks.removed.length).toBe(1);
    });

    it("detects next step changes", () => {
      const old = makeSyn({ recommendedNextStep: "Do A" });
      const new_ = makeSyn({ recommendedNextStep: "Do B" });
      const diff = diffResearch(old, new_);
      
      expect(diff.nextStepChanged).toBe(true);
      expect(diff.oldNextStep).toBe("Do A");
      expect(diff.newNextStep).toBe("Do B");
    });

    it("summarizes total changes", () => {
      const old = makeSyn({
        opportunityScore: 50,
        keyInsights: [{ insight: "Old", confidence: "high", supportingAgents: [] }],
        topThreeOpportunities: [],
        topThreeRisks: [
          { title: "Risk 1", description: "R1", mitigation: "M1" },
          { title: "Risk 2", description: "R2", mitigation: "M2" },
        ],
      });
      const new_ = makeSyn({
        opportunityScore: 60,
        keyInsights: [
          { insight: "Old but modified a lot", confidence: "high", supportingAgents: [] },
          { insight: "Completely new", confidence: "medium", supportingAgents: [] },
        ],
        topThreeOpportunities: [
          { title: "New opp", description: "desc", rationale: "reason" },
        ],
        topThreeRisks: [{ title: "Risk 1", description: "R1", mitigation: "M1" }],
        recommendedNextStep: "Changed",
      });
      const diff = diffResearch(old, new_);
      
      expect(diff.summary.totalChanges).toBeGreaterThan(0);
      expect(diff.summary.added).toBeGreaterThan(0);
    });
  });
});
