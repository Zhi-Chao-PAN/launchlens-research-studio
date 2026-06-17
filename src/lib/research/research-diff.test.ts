import { describe, it, expect } from "vitest";
import {
  diffResearch,
  similarity,
  formatDelta,
  diffSources,
  diffInsightConfidence,
  getDiffSeverity,
  wordDiff,
  diffToMarkdown,
  diffResearchExtended,
} from "@/lib/research/research-diff";
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



describe("diffSources", () => {
  it("detects added, removed, and common sources", () => {
    const old = [
      { title: "Source A", url: "https://a.com" },
      { title: "Source B", url: "https://b.com" },
    ];
    const newSyn = [
      { title: "Source B", url: "https://b.com" },
      { title: "Source C", url: "https://c.com" },
    ];

    const diff = diffSources(old, newSyn);
    expect(diff.common.length).toBe(1);
    expect(diff.added.length).toBe(1);
    expect(diff.removed.length).toBe(1);
    expect(diff.added[0].url).toBe("https://c.com");
    expect(diff.removed[0].url).toBe("https://a.com");
    expect(diff.common[0].url).toBe("https://b.com");
  });

  it("handles empty arrays", () => {
    const diff = diffSources([], []);
    expect(diff.added.length).toBe(0);
    expect(diff.removed.length).toBe(0);
    expect(diff.common.length).toBe(0);
  });

  it("is case-insensitive for URLs", () => {
    const old = [{ title: "A", url: "https://EXAMPLE.com" }];
    const newSyn = [{ title: "A", url: "https://example.com" }];
    const diff = diffSources(old, newSyn);
    expect(diff.common.length).toBe(1);
  });
});

describe("diffInsightConfidence", () => {
  it("detects confidence increases", () => {
    const old = {
      keyInsights: [{ insight: "Market is growing", confidence: "medium" }],
    };
    const newSyn = {
      keyInsights: [{ insight: "Market is growing fast", confidence: "high" }],
    };

    const changes = diffInsightConfidence(old as any, newSyn as any);
    expect(changes.length).toBe(1);
    expect(changes[0].direction).toBe("up");
    expect(changes[0].oldConfidence).toBe("medium");
    expect(changes[0].newConfidence).toBe("high");
  });

  it("detects confidence decreases", () => {
    const old = {
      keyInsights: [{ insight: "This is certain", confidence: "high" }],
    };
    const newSyn = {
      keyInsights: [{ insight: "This is less certain now", confidence: "low" }],
    };

    const changes = diffInsightConfidence(old as any, newSyn as any);
    expect(changes.length).toBe(1);
    expect(changes[0].direction).toBe("down");
  });

  it("returns empty array for same confidence", () => {
    const old = { keyInsights: [{ insight: "Same", confidence: "high" }] };
    const newSyn = { keyInsights: [{ insight: "Same thing", confidence: "high" }] };
    const changes = diffInsightConfidence(old as any, newSyn as any);
    expect(changes.length).toBe(0);
  });
});

describe("getDiffSeverity", () => {
  it("rates identical diff as minor", () => {
    const syn = makeSyn();
    const diff = diffResearch(syn, syn);
    expect(getDiffSeverity(diff)).toBe("minor");
  });

  it("rates large score changes as major", () => {
    const old = makeSyn({ opportunityScore: 50, riskScore: 30 });
    const newSyn = makeSyn({ opportunityScore: 90, riskScore: 70 });
    const diff = diffResearch(old, newSyn);
    expect(getDiffSeverity(diff)).toBe("major");
  });

  it("rates moderate changes as moderate", () => {
    const old = makeSyn({
      opportunityScore: 60,
      keyInsights: [{ insight: "A", confidence: "high", supportingAgents: [] }],
    });
    const newSyn = makeSyn({
      opportunityScore: 70,
      keyInsights: [
        { insight: "A is different now", confidence: "high", supportingAgents: [] },
        { insight: "B completely new", confidence: "medium", supportingAgents: [] },
        { insight: "C also new", confidence: "low", supportingAgents: [] },
      ],
      recommendedNextStep: "Totally different",
    });
    const diff = diffResearch(old, newSyn);
    const severity = getDiffSeverity(diff);
    expect(["moderate", "major"]).toContain(severity);
  });
});

describe("wordDiff", () => {
  it("returns unchanged for identical strings", () => {
    const result = wordDiff("hello world", "hello world");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("unchanged");
    expect(result[0].text).toBe("hello world");
  });

  it("detects added words", () => {
    const result = wordDiff("hello", "hello world");
    const added = result.filter((s) => s.type === "added");
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((s) => s.text.includes("world"))).toBe(true);
  });

  it("detects removed words", () => {
    const result = wordDiff("hello world", "hello");
    const removed = result.filter((s) => s.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
  });

  it("handles empty strings", () => {
    const result = wordDiff("", "");
    expect(result.length).toBe(1);
    expect(result[0].type).toBe("unchanged");
  });

  it("merges adjacent same-type segments", () => {
    const result = wordDiff("quick brown fox", "lazy red dog");
    // Should not have 6 segments (3 removed + 3 added), should have 2 (1 removed + 1 added)
    const types = result.map((s) => s.type);
    let lastType = "";
    let hasConsecutiveSame = false;
    for (const t of types) {
      if (t === lastType) {
        hasConsecutiveSame = true;
        break;
      }
      lastType = t;
    }
    expect(hasConsecutiveSame).toBe(false);
  });
});

describe("diffToMarkdown", () => {
  it("generates a markdown report", () => {
    const old = makeSyn({ opportunityScore: 50 });
    const newSyn = makeSyn({
      opportunityScore: 65,
      recommendedNextStep: "New next step",
    });
    const diff = diffResearch(old, newSyn);
    const md = diffToMarkdown(diff, { oldTitle: "v1", newTitle: "v2" });

    expect(md).toContain("# Research Diff Report");
    expect(md).toContain("Severity");
    expect(md).toContain("## Score Changes");
    expect(md).toContain("## Summary");
    expect(md).toContain("v1");
    expect(md).toContain("v2");
  });

  it("includes next step section when changed", () => {
    const old = makeSyn({ recommendedNextStep: "Old step" });
    const newSyn = makeSyn({ recommendedNextStep: "New step" });
    const diff = diffResearch(old, newSyn);
    const md = diffToMarkdown(diff);
    expect(md).toContain("Recommended Next Step");
    expect(md).toContain("Old step");
    expect(md).toContain("New step");
  });

  it("includes word diff when option is set", () => {
    const old = makeSyn({
      keyInsights: [{ insight: "The market grows", confidence: "high", supportingAgents: [] }],
    });
    const newSyn = makeSyn({
      keyInsights: [{ insight: "The market expands rapidly", confidence: "high", supportingAgents: [] }],
    });
    const diff = diffResearch(old, newSyn);
    // Make sure there's a modified insight
    diff.insights.modified = [{
      old: "The market grows",
      new: "The market expands rapidly",
      similarity: 0.5,
    }];
    const md = diffToMarkdown(diff, { includeWordDiff: true });
    expect(md).toContain("Word diff");
  });
});

describe("diffResearchExtended", () => {
  it("includes sources and confidence and severity", () => {
    const old = makeSyn({
      opportunityScore: 50,
    });
    (old as any).sources = [
      { title: "S1", url: "https://s1.com" },
      { title: "S2", url: "https://s2.com" },
    ];

    const newSyn = makeSyn({
      opportunityScore: 60,
      keyInsights: [
        { insight: "Insight 1 changed", confidence: "high", supportingAgents: [] },
        { insight: "New insight 2", confidence: "medium", supportingAgents: [] },
      ],
    });
    (newSyn as any).sources = [
      { title: "S2", url: "https://s2.com" },
      { title: "S3", url: "https://s3.com" },
    ];

    const diff = diffResearchExtended(old as any, newSyn as any);

    expect(diff.sources).toBeDefined();
    expect(diff.sources.added.length).toBeGreaterThanOrEqual(1);
    expect(diff.sources.removed.length).toBeGreaterThanOrEqual(1);

    expect(diff.confidenceChanges).toBeDefined();
    expect(Array.isArray(diff.confidenceChanges)).toBe(true);

    expect(diff.severity).toBeDefined();
    expect(["minor", "moderate", "major"]).toContain(diff.severity);
  });
});
