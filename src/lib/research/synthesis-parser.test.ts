import { describe, it, expect } from "vitest";
import { parseSynthesis, isStructuredResult } from "@/lib/research/synthesis-parser";

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