import { describe, it, expect } from "vitest";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";

describe("mock provider — query-aware personalization", () => {
  it("includes a query-derived snippet in market-sizer summary", () => {
    const out = generateMockAgentOutput("market-sizer", "AI note-taking for medical students", ["AI", "students"]);
    const outStr = JSON.stringify(out);
    // The query is reflected in the summary prefix
    expect(outStr).toContain("AI note-taking for medical students");
  });

  it("includes the keyword list when keywords are provided", () => {
    const out = generateMockAgentOutput("competitor-analyst", "Some query", ["alpha", "beta", "gamma"]);
    const outStr = JSON.stringify(out);
    expect(outStr).toContain("alpha, beta, gamma");
  });

  it("handles queries with special characters", () => {
    const out = generateMockAgentOutput("market-sizer", "Tool for SaaS founders — AI-powered!", ["SaaS", "AI"]);
    const outStr = JSON.stringify(out);
    expect(outStr).toContain("Tool for SaaS founders");
  });

  it("handles empty keyword arrays gracefully", () => {
    const out = generateMockAgentOutput("market-sizer", "Just a query", []);
    expect(out).toBeDefined();
    expect(out.agent).toBe("market-sizer");
    expect(typeof out.summary).toBe("string");
    // Should not contain "Focus areas: " when no keywords
    expect(out.summary).not.toContain("Focus areas:");
  });

  it("handles empty query gracefully", () => {
    const out = generateMockAgentOutput("market-sizer", "", ["ai"]);
    expect(out).toBeDefined();
    expect(out.summary).toContain("this market");
  });

  it("truncates very long queries", () => {
    const longQuery = "x".repeat(500);
    const out = generateMockAgentOutput("market-sizer", longQuery, []);
    const outStr = JSON.stringify(out);
    // The snippet should be truncated with …
    expect(outStr).toContain("…");
    // But the full 500-char query should NOT be in the output verbatim
    expect(outStr).not.toContain("x".repeat(100));
  });

  it("is deterministic: same query yields same output", () => {
    const a = generateMockAgentOutput("market-sizer", "Determinism test", ["k1"]);
    const b = generateMockAgentOutput("market-sizer", "Determinism test", ["k1"]);
    expect(a.summary).toBe(b.summary);
  });

  it("different queries yield different prefixes", () => {
    const a = generateMockAgentOutput("market-sizer", "Mobile app for cats", []);
    const b = generateMockAgentOutput("market-sizer", "Enterprise B2B SaaS", []);
    // Summaries should differ (different query, different seed)
    expect(a.summary).not.toBe(b.summary);
  });

  it("synthesis also personalizes", () => {
    const out = generateMockAgentOutput("synthesis", "My unique product", ["unique", "keyword"]);
    const outStr = JSON.stringify(out);
    expect(outStr).toContain("My unique product");
  });
});
