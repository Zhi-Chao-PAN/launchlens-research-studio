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
      citations: [{ id: "c1", title: "t" }],
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

  it("throws on missing required field", () => {
    expect(() =>
      validateAgentOutput("competitor-analyst", { summary: "ok" })
    ).toThrow(ValidationError);
  });

  it("throws on non-object input", () => {
    expect(() => validateAgentOutput("synthesis", "nope")).toThrow(ValidationError);
    expect(() => validateAgentOutput("synthesis", null)).toThrow(ValidationError);
  });

  it("throws when citations malformed", () => {
    expect(() =>
      validateAgentOutput("pain-detective", {
        summary: "ok",
        painPoints: [],
        citations: [{}],
      })
    ).toThrow(ValidationError);
  });

  it("defaults missing citations to empty array", () => {
    const out = validateAgentOutput("channel-scout", {
      summary: "ok",
      channels: [],
    });
    expect(out.citations).toEqual([]);
  });
});
