/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { validateAgentOutput, ValidationError } from "./output-validator";

describe("validateAgentOutput", () => {
  it("accepts a complete market-sizer payload", () => {
    const out = validateAgentOutput("market-sizer", {
      agent: "market-sizer",
      summary: "ok",
      marketSize: { tam: 1, sam: 1, som: 1, currency: "USD", growthRate: 5 },
      keyTrends: [],
      targetSegments: [],
      citations: [{ id: "c1", title: "t", snippet: "s" }],
    });
    expect(out.agent).toBe("market-sizer");
  });

  it("patches a wrong discriminator to the requested agent id", () => {
    const out = validateAgentOutput("pricing-scout", {
      agent: "wrong",
      summary: "ok",
      priceBands: [],
      citations: [],
    });
    expect(out.agent).toBe("pricing-scout");
  });

  it("throws on missing required string field (summary)", () => {
    expect(() =>
      validateAgentOutput("competitor-analyst", { competitors: [] })
    ).toThrow(ValidationError);
  });

  it("throws on missing required object field (marketSize)", () => {
    expect(() =>
      validateAgentOutput("market-sizer", { summary: "ok", keyTrends: [], targetSegments: [] })
    ).toThrow(ValidationError);
  });

  it("defaults missing arrays to empty arrays instead of throwing", () => {
    const out = validateAgentOutput("competitor-analyst", { summary: "ok", competitors: [] }) as any;
    expect(Array.isArray(out.competitiveMatrix)).toBe(true);
    expect(Array.isArray(out.gaps)).toBe(true);
    expect(Array.isArray(out.citations)).toBe(true);
    expect(out.competitiveMatrix).toEqual([]);
  });

  it("throws on non-object input", () => {
    expect(() => validateAgentOutput("synthesis", "nope")).toThrow(ValidationError);
    expect(() => validateAgentOutput("synthesis", null)).toThrow(ValidationError);
  });

  it("throws when citations are malformed (missing title)", () => {
    expect(() =>
      validateAgentOutput("pain-detective", {
        summary: "ok",
        painPoints: [],
        citations: [{ id: "c1" }],
      })
    ).toThrow(ValidationError);
  });

  it("defaults missing citation fields (snippet, accessedAt, confidence) with safe values", () => {
    const out = validateAgentOutput("market-sizer", {
      summary: "ok",
      marketSize: { tam: 1, sam: 1, som: 1, currency: "USD", growthRate: 5 },
      keyTrends: [],
      targetSegments: [],
      citations: [{ id: "c1", title: "t" }],
    }) as any;
    expect(out.citations[0].snippet).toBe("");
    expect(typeof out.citations[0].accessedAt).toBe("string");
    expect(out.citations[0].confidence).toBe("medium");
  });

  it("defaults missing citations to empty array", () => {
    const out = validateAgentOutput("channel-scout", {
      summary: "ok",
      channels: [],
    }) as any;
    expect(out.citations).toEqual([]);
  });

  it("clamps synthesis scores to 0-100", () => {
    const out = validateAgentOutput("synthesis", {
      execSummary: "ok",
      keyInsights: [],
      topThreeOpportunities: [],
      topThreeRisks: [],
      recommendedNextStep: "x",
      launchlensBrief: "y",
      opportunityScore: 150,
      riskScore: -20,
    }) as any;
    expect(out.opportunityScore).toBe(100);
    expect(out.riskScore).toBe(0);
  });

  it("accepts synthesis with execSummary (not summary)", () => {
    expect(() =>
      validateAgentOutput("synthesis", {
        execSummary: "ok",
        keyInsights: [],
        topThreeOpportunities: [],
        topThreeRisks: [],
        recommendedNextStep: "go",
        launchlensBrief: "brief",
        opportunityScore: 72,
        riskScore: 58,
        citations: [],
      })
    ).not.toThrow();
  });
});
