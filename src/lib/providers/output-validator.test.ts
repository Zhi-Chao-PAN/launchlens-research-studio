/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { validateAgentOutput, ValidationError } from "./output-validator";

/** Minimal valid citation with the R203-required snippet field. */
const cite = (id = "c1") => ({ id, title: "t", snippet: "evidence excerpt" });

/** A valid SynthesisOutput payload matching the actual schema (R209). The
 *  old validator required a phantom `summary` field, so these helpers use
 *  the real fields: execSummary, scores, insights, opportunities, risks,
 *  recommendedNextStep, launchlensBrief. */
const validSynthesis = () => ({
  agent: "synthesis",
  execSummary: "Executive summary text.",
  opportunityScore: 72,
  riskScore: 58,
  keyInsights: [{ insight: "i", supportingAgents: ["market-sizer"], confidence: "medium" as const }],
  topThreeOpportunities: [{ title: "o", description: "d", rationale: "r" }],
  topThreeRisks: [{ title: "rk", description: "d", mitigation: "m" }],
  recommendedNextStep: "Build an MVP.",
  launchlensBrief: "Importable brief.",
  citations: [cite()],
});

describe("validateAgentOutput", () => {
  it("accepts a complete market-sizer payload", () => {
    const out = validateAgentOutput("market-sizer", {
      agent: "market-sizer",
      summary: "ok",
      marketSize: { tam: 1, sam: 1, som: 1, currency: "USD", growthRate: 5 },
      keyTrends: [],
      targetSegments: [],
      citations: [cite()],
    });
    expect(out.agent).toBe("market-sizer");
  });

  it("patches a wrong discriminator to the requested agent id", () => {
    const out = validateAgentOutput("pricing-scout", {
      agent: "wrong",
      summary: "ok",
      priceBands: [],
      citations: [cite()],
    });
    expect(out.agent).toBe("pricing-scout");
  });

  it("throws on missing required field", () => {
    expect(() =>
      validateAgentOutput("competitor-analyst", { summary: "ok", citations: [cite()] })
    ).toThrow(ValidationError);
  });

  it("throws on non-object input", () => {
    expect(() => validateAgentOutput("synthesis", "nope")).toThrow(ValidationError);
    expect(() => validateAgentOutput("synthesis", null)).toThrow(ValidationError);
  });

  it("throws when citations malformed (missing snippet — R203)", () => {
    expect(() =>
      validateAgentOutput("pain-detective", {
        summary: "ok",
        painPoints: [],
        citations: [{}],
      })
    ).toThrow(ValidationError);
  });

  it("R203: throws when citations array is empty (uncited claims rejected)", () => {
    expect(() =>
      validateAgentOutput("channel-scout", {
        summary: "ok",
        channels: [],
        citations: [],
      })
    ).toThrow(ValidationError);
  });

  it("R203: rejects out-of-range opportunityScore", () => {
    expect(() =>
      validateAgentOutput("synthesis", {
        ...validSynthesis(),
        opportunityScore: 150,
      })
    ).toThrow(ValidationError);
  });

  it("R203: rejects negative marketSize.tam", () => {
    expect(() =>
      validateAgentOutput("market-sizer", {
        summary: "ok",
        marketSize: { tam: -100, sam: 1, som: 1 },
        keyTrends: [],
        targetSegments: [],
        citations: [cite()],
      })
    ).toThrow(ValidationError);
  });

  it("R203: accepts in-range scores", () => {
    const out = validateAgentOutput("synthesis", validSynthesis());
    expect(out.agent).toBe("synthesis");
  });

  it("R209: rejects synthesis output missing execSummary (the real required field, not the old phantom summary)", () => {
    const { execSummary, ...rest } = validSynthesis();
    void execSummary;
    expect(() => validateAgentOutput("synthesis", rest)).toThrow(ValidationError);
  });

  it("R203: defaults missing citations to empty array but still rejects (uncited)", () => {
    // Missing citations → treated as [] → rejected by the at-least-one rule.
    expect(() =>
      validateAgentOutput("channel-scout", {
        summary: "ok",
        channels: [],
      })
    ).toThrow(ValidationError);
  });
});
