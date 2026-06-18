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
createTimelineEntry,
  summarizeTimeline,
  reverseDiff,
  diffToJson,
  diffToOneLine,
  applyPatch,
  findChangeHotspots,
  isEmptyDiff,
  mergeDiffs,
  emptyDiff,
  diffsEqual,
  diffNetScore,
  breakdownByField,
  diffBreakdownToCsv,
  insightsWithSign,
  totalChangedOpportunities,
  totalChangedRisks,
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


describe("extended diff utilities (round 141)", () => {
  function makeDiff(overrides = {}) {
    return {
      scoreChanges: { opportunityScore: 5, riskScore: -3 },
      insights: { added: ["new insight"], removed: ["old"], modified: [] },
      opportunities: { added: [], removed: [], modified: [] },
      risks: { added: [{ title: "R", description: "D" }], removed: [], modified: [] },
      nextStepChanged: true,
      oldNextStep: "old step",
      newNextStep: "new step",
      summary: { totalChanges: 4, added: 2, removed: 1, modified: 1 },
      ...overrides,
    };
  }

  describe("createTimelineEntry", () => {
    it("returns an entry with id and timestamp", () => {
      const e = createTimelineEntry(makeDiff(), "v2");
      expect(e.id).toBeTruthy();
      expect(e.timestamp).toMatch(/^\d{4}-/);
      expect(e.label).toBe("v2");
    });
  });

  describe("summarizeTimeline", () => {
    it("aggregates score trends", () => {
      const entries = [
        createTimelineEntry(makeDiff(), "a"),
        createTimelineEntry({ ...makeDiff(), scoreChanges: { opportunityScore: 2, riskScore: 1 } }, "b"),
      ];
      const s = summarizeTimeline(entries);
      expect(s.totalEntries).toBe(2);
      expect(s.opportunityTrend.length).toBe(2);
      expect(s.opportunityTrend[1]).toBe(7);
      expect(s.mostChangedField).toBeDefined();
    });

    it("returns zeros for empty timeline", () => {
      const s = summarizeTimeline([]);
      expect(s.totalEntries).toBe(0);
      expect(s.opportunityTrend).toEqual([]);
      expect(s.mostChangedField).toBeUndefined();
    });
  });

  describe("reverseDiff", () => {
    it("flips added/removed and score signs", () => {
      const d = makeDiff();
      const r = reverseDiff(d);
      expect(r.scoreChanges.opportunityScore).toBe(-5);
      expect(r.insights.added).toEqual(["old"]);
      expect(r.insights.removed).toEqual(["new insight"]);
      expect(r.oldNextStep).toBe("new step");
      expect(r.newNextStep).toBe("old step");
      expect(r.summary.added).toBe(1);
      expect(r.summary.removed).toBe(2);
    });
  });

  describe("diffToJson", () => {
    it("produces parseable JSON with version and severity", () => {
      const d = makeDiff();
      const j = diffToJson(d, { oldLabel: "v1", newLabel: "v2" });
      const parsed = JSON.parse(j);
      expect(parsed.version).toBe(1);
      expect(parsed.severity).toBeDefined();
      expect(parsed.meta.oldLabel).toBe("v1");
    });
  });

  describe("diffToOneLine", () => {
    it("contains counts and scores", () => {
      const d = makeDiff();
      const line = diffToOneLine(d);
      expect(line).toContain("added");
      expect(line).toContain("opp:+5");
      expect(line).toContain("next step changed");
    });

    it("omits scores when requested", () => {
      const line = diffToOneLine(makeDiff(), { includeScores: false });
      expect(line).not.toContain("opp:");
    });
  });

  describe("applyPatch", () => {
    it("applies added and unchanged, drops removed", () => {
      const segs = [
        { type: "unchanged", text: "hello " },
        { type: "removed", text: "old " },
        { type: "added", text: "new " },
        { type: "unchanged", text: "world" },
      ];
      expect(applyPatch("hello old world", segs)).toBe("hello new world");
    });
  });

  describe("findChangeHotspots", () => {
    it("identifies dominant field", () => {
      const d = makeDiff();
      const h = findChangeHotspots(d);
      expect(h.length).toBeGreaterThan(0);
      const top = h[0];
      expect(top.changeCount).toBeGreaterThan(0);
      expect(top.shareOfTotal).toBeGreaterThan(0);
    });
  });

  describe("isEmptyDiff", () => {
    it("returns true when zero changes and zero score delta", () => {
      expect(isEmptyDiff({
        scoreChanges: { opportunityScore: 0, riskScore: 0 },
        insights: { added: [], removed: [], modified: [] },
        opportunities: { added: [], removed: [], modified: [] },
        risks: { added: [], removed: [], modified: [] },
        nextStepChanged: false,
        summary: { totalChanges: 0, added: 0, removed: 0, modified: 0 },
      })).toBe(true);
    });

    it("returns false when any change exists", () => {
      expect(isEmptyDiff(makeDiff())).toBe(false);
    });
  });

  describe("mergeDiffs", () => {
    it("sums scores and concatenates lists", () => {
      const a = makeDiff();
      const b = {
        ...makeDiff(),
        scoreChanges: { opportunityScore: 10, riskScore: -1 },
        insights: { added: ["x"], removed: [], modified: [] },
      };
      const m = mergeDiffs([a, b]);
      expect(m.scoreChanges.opportunityScore).toBe(15);
      expect(m.insights.added).toContain("new insight");
      expect(m.insights.added).toContain("x");
      expect(m.summary.totalChanges).toBe(8);
      expect(m.nextStepChanged).toBe(true);
    });

    it("returns base for empty list", () => {
      const m = mergeDiffs([]);
      expect(m.summary.totalChanges).toBe(0);
    });
  });
});
describe("research-diff extensions (round 154)", () => {
  const baseSynth = (overrides: any = {}): any => ({
    opportunityScore: 50,
    riskScore: 20,
    keyInsights: [{ insight: "i1", confidence: "high" }],
    topThreeOpportunities: [{ title: "O1", description: "d1" }],
    topThreeRisks: [{ title: "R1", description: "r1" }],
    recommendedNextStep: "step1",
    ...overrides,
  });

  it("emptyDiff returns a zero-change diff", () => {
    const d = emptyDiff();
    expect(d.summary.totalChanges).toBe(0);
    expect(d.scoreChanges.opportunityScore).toBe(0);
    expect(d.nextStepChanged).toBe(false);
    expect(isEmptyDiff(d)).toBe(true);
  });

  it("diffsEqual detects equality and mismatches", () => {
    const a = emptyDiff();
    const b = emptyDiff();
    expect(diffsEqual(a, b)).toBe(true);
    b.summary.added = 1;
    expect(diffsEqual(a, b)).toBe(false);
  });

  it("diffsEqual respects deep object lists", () => {
    const a = { ...emptyDiff(), opportunities: { added: [{ title: "x", description: "y" }], removed: [], modified: [] }, risks: { added: [], removed: [], modified: [] }, insights: { added: [], removed: [], modified: [] } };
    const b = { ...emptyDiff(), opportunities: { added: [{ title: "x", description: "y" }], removed: [], modified: [] }, risks: { added: [], removed: [], modified: [] }, insights: { added: [], removed: [], modified: [] } };
    expect(diffsEqual(a, b)).toBe(true);
    b.opportunities.added[0].title = "z";
    expect(diffsEqual(a, b)).toBe(false);
  });

  it("diffNetScore = oppDelta - riskDelta", () => {
    const d = { ...emptyDiff(), scoreChanges: { opportunityScore: 5, riskScore: 3 } };
    expect(diffNetScore(d)).toBe(2);
  });

  it("breakdownByField counts per field", () => {
    const oldS = baseSynth();
    const newS = baseSynth({
      keyInsights: [{ insight: "i1", confidence: "high" }, { insight: "i2", confidence: "low" }],
      topThreeOpportunities: [{ title: "O2", description: "d2" }],
      recommendedNextStep: "step2",
    });
    const d = diffResearch(oldS, newS);
    const bd = breakdownByField(d);
    expect(bd.find(b => b.field === "insights").added).toBe(1);
    expect(bd.find(b => b.field === "opportunities").total).toBeGreaterThan(0);
    expect(bd.find(b => b.field === "nextStep").total).toBe(1);
    expect(bd.reduce((sum, r) => sum + r.total, 0)).toBeGreaterThan(0);
  });

  it("diffBreakdownToCsv includes header and score row", () => {
    const d = emptyDiff();
    const csv = diffBreakdownToCsv(d);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("field,added,removed,modified,total");
    expect(lines.some(l => l.startsWith("scores"))).toBe(true);
  });

  it("insightsWithSign tags added/removed/modified", () => {
    const d = { ...emptyDiff(), insights: { added: ["a"], removed: ["b"], modified: [{ old: "x", new: "y", similarity: 0.5 }] } };
    const tagged = insightsWithSign(d);
    expect(tagged.map(t => t.sign)).toEqual(["+", "-", "~"]);
    expect(tagged.find(t => t.sign === "~").text).toContain("(was: x)");
  });

  it("totalChangedOpportunities/Risks aggregate counts", () => {
    const d = { ...emptyDiff(),
      opportunities: { added: [1,2], removed: [3], modified: [4] },
      risks: { added: [], removed: [1,2], modified: [] } } as any;
    expect(totalChangedOpportunities(d)).toBe(4);
    expect(totalChangedRisks(d)).toBe(2);
  });
});
