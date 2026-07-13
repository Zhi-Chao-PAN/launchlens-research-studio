import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESEARCH_MODE,
  getResearchModeConfig,
  isResearchModeId,
  normalizeResearchMode,
  RESEARCH_MODE_CONFIGS,
} from "./research-modes";

describe("research mode contract", () => {
  it("recognizes only the two public mode ids", () => {
    expect(isResearchModeId("standard")).toBe(true);
    expect(isResearchModeId("deep")).toBe(true);
    expect(isResearchModeId("fast")).toBe(false);
    expect(isResearchModeId(null)).toBe(false);
  });

  it("defaults legacy and invalid values to Standard", () => {
    expect(DEFAULT_RESEARCH_MODE).toBe("standard");
    expect(normalizeResearchMode(undefined)).toBe("standard");
    expect(normalizeResearchMode("unknown")).toBe("standard");
    expect(normalizeResearchMode("deep")).toBe("deep");
  });

  it("keeps Deep Research an honest async-only preview", () => {
    const deep = getResearchModeConfig("deep");
    expect(deep.availability).toBe("preview");
    expect(deep.requiresAsyncExecution).toBe(true);
    expect(deep.retrieval).toBe("required");
    expect(deep.validationPasses).toBeGreaterThan(1);
    expect(deep.maxSynchronousDurationSec).toBe(300);
    expect(deep.capabilityNotice).toMatch(/async/i);
    expect(deep.capabilityNotice).toMatch(/300/);
  });

  it("keeps Standard available on the existing request-bound path", () => {
    expect(RESEARCH_MODE_CONFIGS.standard).toMatchObject({
      availability: "available",
      requiresAsyncExecution: false,
      retrieval: "optional",
      validationPasses: 1,
    });
  });
});
