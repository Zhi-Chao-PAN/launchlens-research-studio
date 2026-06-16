/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { applyQueryVariability } from "./mock-variability";
import { generateMockMarketSizer, generateMockCompetitorAnalyst } from "./mock-provider";

describe("applyQueryVariability", () => {
  it("produces the same shape for the same query", () => {
    const baseA = generateMockMarketSizer("AI-powered tutor for high school", ["AI", "education"]);
    const baseB = generateMockMarketSizer("AI-powered tutor for high school", ["AI", "education"]);
    const a = applyQueryVariability("market-sizer", baseA, "AI-powered tutor for high school", ["AI", "education"]) as any;
    const b = applyQueryVariability("market-sizer", baseB, "AI-powered tutor for high school", ["AI", "education"]) as any;
    expect(a.keyTrends.length).toBe(b.keyTrends.length);
    expect(a.targetSegments.length).toBe(b.targetSegments.length);
    expect(a.citations.length).toBe(b.citations.length);
  });

  it("produces different shapes across many queries", () => {
    const queries = ["AI tutor", "crypto wallet", "supply chain logistics", "fitness coaching app", "B2B email outreach"];
    const sigs = queries.map((q) => {
      const base = generateMockMarketSizer(q, []);
      const out = applyQueryVariability("market-sizer", base, q, []) as any;
      return out.keyTrends.length + ":" + out.targetSegments.length + ":" + out.citations.length;
    });
    expect(new Set(sigs).size).toBeGreaterThanOrEqual(2);
  });

  it("never reduces base list lengths", () => {
    const baseLen = generateMockMarketSizer("q", []).keyTrends.length;
    const extended = applyQueryVariability(
      "market-sizer",
      generateMockMarketSizer("q", []),
      "q",
      [],
    ) as any;
    expect(extended.keyTrends.length).toBeGreaterThanOrEqual(baseLen);
  });

  it("keeps competitor analyst gaps deterministic per query", () => {
    const base = generateMockCompetitorAnalyst("crypto wallet", ["wallet"]);
    const out1 = applyQueryVariability("competitor-analyst", base, "crypto wallet", ["wallet"]) as any;
    const base2 = generateMockCompetitorAnalyst("crypto wallet", ["wallet"]);
    const out2 = applyQueryVariability("competitor-analyst", base2, "crypto wallet", ["wallet"]) as any;
    expect(out1.gaps.map((g: any) => g.gap)).toEqual(out2.gaps.map((g: any) => g.gap));
  });
});
