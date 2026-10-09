import { describe, it, expect } from "vitest";
import {
  generateMockAgentOutput,
  generateMockMarketSizer,
  generateMockCompetitorAnalyst,
  generateMockPainDetective,
  generateMockPricingScout,
  generateMockChannelScout,
} from "@/lib/providers/mock-provider";

describe("mock provider — synthesis is data-driven", () => {
  function buildUpstream(query: string, keywords: string[]) {
    return [
      generateMockMarketSizer(query, keywords),
      generateMockCompetitorAnalyst(query, keywords),
      generateMockPainDetective(query, keywords),
      generateMockPricingScout(query, keywords),
      generateMockChannelScout(query, keywords),
    ];
  }

  it("launchlensBrief contains the query", () => {
    const synth = generateMockAgentOutput("synthesis", "AI-powered cat toys", ["cats", "pet-tech"], buildUpstream("AI-powered cat toys", ["cats", "pet-tech"]));
    expect(synth.launchlensBrief).toContain("AI-powered cat toys");
    expect(synth.execSummary).toContain("AI-powered cat toys");
  });

  it("different queries produce different exec summaries", () => {
    const a = generateMockAgentOutput("synthesis", "B2B SaaS for dentists", ["dental", "b2b"], buildUpstream("B2B SaaS for dentists", ["dental", "b2b"]));
    const b = generateMockAgentOutput("synthesis", "mobile game for cat lovers", ["cats", "mobile"], buildUpstream("mobile game for cat lovers", ["cats", "mobile"]));
    expect(a.execSummary).not.toBe(b.execSummary);
    expect(a.launchlensBrief).not.toBe(b.launchlensBrief);
  });

  it("scores are within 0-100 range", () => {
    const synth = generateMockAgentOutput("synthesis", "some idea", [], buildUpstream("some idea", []));
    expect(synth.opportunityScore).toBeGreaterThanOrEqual(10);
    expect(synth.opportunityScore).toBeLessThanOrEqual(95);
    expect(synth.riskScore).toBeGreaterThanOrEqual(10);
    expect(synth.riskScore).toBeLessThanOrEqual(95);
  });

  it("citations are deduplicated across agents", () => {
    const synth = generateMockAgentOutput("synthesis", "x", ["y"], buildUpstream("x", ["y"]));
    const ids = synth.citations.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("synthesis always returns 3 opportunities and 3 risks", () => {
    const synth = generateMockAgentOutput("synthesis", "edge case", [], buildUpstream("edge case", []));
    expect(synth.topThreeOpportunities).toHaveLength(3);
    expect(synth.topThreeRisks).toHaveLength(3);
    expect(synth.keyInsights.length).toBeGreaterThanOrEqual(3);
  });

  it("scores change with growth rate", () => {
    // Build an upstream with extremely high growth
    const high = buildUpstream("fast growing idea", ["ai"]);
    (high[0] as any).marketSize.growthRate = 80;
    const highSynth = generateMockAgentOutput("synthesis", "fast growing idea", ["ai"], high);

    const low = buildUpstream("slow idea", ["traditional"]);
    (low[0] as any).marketSize.growthRate = 2;
    (low[0] as any).keyTrends = [{ trend: "decline", impact: "negative", evidence: "x" }];
    const lowSynth = generateMockAgentOutput("synthesis", "slow idea", ["traditional"], low);

    expect(highSynth.opportunityScore).toBeGreaterThan(lowSynth.opportunityScore);
  });

  it("works with missing upstream agents (partial results)", () => {
    // Only pass market sizer output
    const partial = [generateMockMarketSizer("partial query", ["x"])];
    const synth = generateMockAgentOutput("synthesis", "partial query", ["x"], partial);
    expect(synth.agent).toBe("synthesis");
    expect(synth.execSummary.length).toBeGreaterThan(20);
    expect(synth.launchlensBrief.length).toBeGreaterThan(20);
  });
});
