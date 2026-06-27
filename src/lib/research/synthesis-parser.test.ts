import { describe, it, expect } from "vitest";
import {
  parseSynthesis,
  isStructuredResult,
  validateSynthesis,
  interpretScores,
  getSectionStats,
  summarizeSynthesis,
  countCitations,
  getConfidenceDistribution,
} from "@/lib/research/synthesis-parser";
import type { SynthesisOutput } from "@/lib/research/synthesis-parser";

const sampleSynthesis = {
  agent: "synthesizer",
  execSummary: "Great opportunity",
  opportunityScore: 75,
  riskScore: 30,
  keyInsights: [
    { insight: "Big insight", supportingAgents: ["market"], confidence: "high" as const },
  ],
  topThreeOpportunities: [
    { title: "Opp 1", description: "desc", rationale: "because" },
  ],
  topThreeRisks: [
    { title: "Risk 1", description: "bad", mitigation: "do better" },
  ],
  recommendedNextStep: "Go for it",
  launchlensBrief: "Brief summary",
  citations: [
    { title: "Source", url: "https://example.com" },
  ],
};

describe("parseSynthesis", () => {
  it("parses valid synthesis JSON", () => {
    const result = parseSynthesis(JSON.stringify(sampleSynthesis));
    expect(result).not.toBeNull();
    expect(result?.execSummary).toBe("Great opportunity");
    expect(result?.opportunityScore).toBe(75);
    expect(result?.keyInsights.length).toBe(1);
    expect(result?.topThreeOpportunities.length).toBe(1);
  });

  it("returns null for empty string", () => {
    expect(parseSynthesis("")).toBeNull();
    expect(parseSynthesis("  ")).toBeNull();
  });

  it("returns null for non-JSON text", () => {
    expect(parseSynthesis("hello world")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSynthesis("{ invalid json")).toBeNull();
  });

  it("returns null for JSON without execSummary", () => {
    expect(parseSynthesis(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("strips markdown code fences", () => {
    const wrapped = "```json\n" + JSON.stringify(sampleSynthesis) + "\n```";
    const result = parseSynthesis(wrapped);
    expect(result).not.toBeNull();
    expect(result?.execSummary).toBe("Great opportunity");
  });
});

describe("isStructuredResult", () => {
  it("returns true for valid synthesis JSON", () => {
    expect(isStructuredResult(JSON.stringify(sampleSynthesis))).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(isStructuredResult("hello world")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isStructuredResult("")).toBe(false);
  });
});


const validSyn: SynthesisOutput = {
  agent: "test",
  execSummary: "This is a thorough executive summary with enough detail.",
  opportunityScore: 70,
  riskScore: 30,
  keyInsights: [
    { insight: "First key insight", confidence: "high", supportingAgents: ["a"] },
    { insight: "Second key insight", confidence: "medium", supportingAgents: ["b"] },
    { insight: "Third key insight", confidence: "low", supportingAgents: ["c"] },
  ],
  topThreeOpportunities: [
    { title: "Opp A", description: "Description A", rationale: "Reason A" },
    { title: "Opp B", description: "Description B", rationale: "Reason B" },
    { title: "Opp C", description: "Description C", rationale: "Reason C" },
  ],
  topThreeRisks: [
    { title: "Risk A", description: "Risk description", mitigation: "Mitigation A" },
  ],
  recommendedNextStep: "Take action now.",
  launchlensBrief: "Brief summary.",
  citations: [
    { title: "Src1", url: "https://example.com/1" },
    { title: "Src2", url: "https://example.com/2" },
  ],
};

describe("validation (round 135)", () => {
  it("marks complete synthesis as valid", () => {
    const v = validateSynthesis(validSyn);
    expect(v.valid).toBe(true);
    expect(v.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(v.completenessScore).toBe(100);
    expect(v.missingFields).toHaveLength(0);
  });

  it("detects missing required fields", () => {
    const v = validateSynthesis({});
    expect(v.valid).toBe(false);
    expect(v.missingFields.length).toBeGreaterThan(0);
  });

  it("flags out-of-range scores", () => {
    const v = validateSynthesis({
      ...validSyn,
      opportunityScore: 150,
      riskScore: -5,
    });
    expect(v.issues.some((i) => i.field === "opportunityScore")).toBe(true);
  });

  it("flags invalid confidence levels", () => {
    const bad = {
      ...validSyn,
      keyInsights: [{ insight: "x", confidence: "bad-val" as any, supportingAgents: [] }],
    };
    const v = validateSynthesis(bad);
    expect(v.issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("computes partial completeness score", () => {
    const partial = { execSummary: "hello", keyInsights: [], opportunityScore: 50, riskScore: 50 };
    const v = validateSynthesis(partial);
    expect(v.completenessScore).toBeLessThan(100);
    expect(v.completenessScore).toBeGreaterThan(0);
  });
});

describe("score interpretation (round 135)", () => {
  it("interprets strong buy", () => {
    const i = interpretScores(90, 20);
    expect(i.verdict).toBe("strong-buy");
    expect(i.netScore).toBe(70);
  });

  it("interprets high risk", () => {
    const i = interpretScores(20, 90);
    expect(i.verdict).toBe("high-risk");
    expect(i.netScore).toBe(-70);
  });

  it("interprets neutral", () => {
    const i = interpretScores(50, 50);
    expect(i.verdict).toBe("neutral");
  });

  it("labels scores correctly", () => {
    expect(interpretScores(80, 10).opportunityLabel).toBe("Very High");
    expect(interpretScores(60, 10).opportunityLabel).toBe("High");
    expect(interpretScores(30, 10).opportunityLabel).toBe("Moderate");
    expect(interpretScores(10, 10).opportunityLabel).toBe("Low");
  });
});

describe("section stats (round 135)", () => {
  it("computes word and char counts per section", () => {
    const stats = getSectionStats(validSyn);
    expect(stats).toHaveLength(6);
    const summary = stats.find((s) => s.name === "execSummary");
    expect(summary?.populated).toBe(true);
    expect(summary?.wordCount).toBeGreaterThan(0);
    expect(summary?.charCount).toBeGreaterThan(0);
  });

  it("marks empty sections as not populated", () => {
    const empty: SynthesisOutput = {
      ...validSyn,
      execSummary: "",
      launchlensBrief: "",
    };
    const stats = getSectionStats(empty);
    expect(stats.find((s) => s.name === "execSummary")?.populated).toBe(false);
    expect(stats.find((s) => s.name === "brief")?.populated).toBe(false);
  });
});

describe("synthesis summary (round 135)", () => {
  it("summarizeSynthesis returns headline and top items", () => {
    const s = summarizeSynthesis(validSyn);
    expect(s.headline.length).toBeGreaterThan(0);
    expect(s.topInsight).toContain("First key insight");
    expect(s.topOpportunity).toBe("Opp A");
    expect(s.topRisk).toBe("Risk A");
    expect(s.nextStep).toBe("Take action now.");
    expect(s.verdict.length).toBeGreaterThan(0);
  });

  it("countCitations counts citations", () => {
    expect(countCitations(validSyn)).toBe(2);
    expect(countCitations({ ...validSyn, citations: [] })).toBe(0);
  });

  it("getConfidenceDistribution counts each level", () => {
    const dist = getConfidenceDistribution(validSyn);
    expect(dist.high).toBe(1);
    expect(dist.medium).toBe(1);
    expect(dist.low).toBe(1);
  });
});

