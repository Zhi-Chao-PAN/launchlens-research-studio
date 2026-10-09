import { describe, it, expect } from "vitest";
import { stepKeyFor, stepDictKey, STEP_PREFIX } from "@/lib/research/steps";

describe("steps.ts — step key resolver", () => {
  it("maps core lifecycle literals", () => {
    expect(stepKeyFor("Waiting to start...")).toBe("waiting");
    expect(stepKeyFor("Streaming response")).toBe("streaming");
    expect(stepKeyFor("Validating output")).toBe("validating");
    expect(stepKeyFor("Complete")).toBe("complete");
    expect(stepKeyFor("Skipped: too many upstream agent failures")).toBe("skipped");
    expect(stepKeyFor("Error")).toBe("error");
  });

  it("maps mock provider steps", () => {
    expect(stepKeyFor("Loading research context")).toBe("loadingContext");
    expect(stepKeyFor("Synthesizing findings")).toBe("synthesizingFindings");
    expect(stepKeyFor("Compiling citations")).toBe("compilingCitations");
  });

  it("maps all six market-sizer plan steps", () => {
    expect(stepKeyFor("Defining market boundaries and scope...")).toBe("market.boundaries");
    expect(stepKeyFor("Gathering TAM data from industry reports...")).toBe("market.tamData");
    expect(stepKeyFor("Calculating SAM and SOM with segmentation...")).toBe("market.samSom");
    expect(stepKeyFor("Analyzing growth trends and market velocity...")).toBe("market.growthTrends");
    expect(stepKeyFor("Cross-referencing data sources for confidence...")).toBe("market.crossReference");
    expect(stepKeyFor("Synthesizing market size estimates...")).toBe("market.estimates");
  });

  it("maps synthesis plan steps", () => {
    expect(stepKeyFor("Collecting outputs from all research agents...")).toBe("synthesis.collecting");
    expect(stepKeyFor("Synthesizing executive summary...")).toBe("synthesis.executiveSummary");
    expect(stepKeyFor("Generating importable launch brief...")).toBe("synthesis.launchBrief");
  });

  it("treats 'Error: <detail>' as the generic error key (so UI still renders localized label)", () => {
    expect(stepKeyFor("Error: socket hang up")).toBe("error");
    expect(stepKeyFor("Error: timeout after 90000ms")).toBe("error");
  });

  it("returns null for unknown free-form strings (caller renders verbatim)", () => {
    expect(stepKeyFor("Some custom provider message")).toBeNull();
    expect(stepKeyFor("")).toBeNull();
    expect(stepKeyFor(null)).toBeNull();
    expect(stepKeyFor(undefined)).toBeNull();
  });

  it("accepts already-prefixed dict keys (e.g. from cached future payloads)", () => {
    expect(stepKeyFor("step.streaming")).toBe("streaming");
    expect(stepDictKey("step.synthesis.scores")).toBe("step.synthesis.scores");
  });

  it("stepDictKey returns 'step.<key>' for known strings and null for unknown", () => {
    expect(stepDictKey("Streaming response")).toBe(STEP_PREFIX + "streaming");
    expect(stepDictKey("random prose")).toBeNull();
  });
});
