import { describe, expect, it } from "vitest";
import type { ResearchRun } from "@/lib/research/storage";
import {
  ALL_SHARE_SECTIONS,
  buildPublicShareProjection,
  createShareManifest,
} from "@/lib/research/share-manifest";

function completedRun(): ResearchRun {
  return {
    id: "private-run-id",
    query: "Should we launch an APAC research product?",
    keywords: ["APAC", "research"],
    result: JSON.stringify({
      agent: "synthesis",
      execSummary: "A focused entry is attractive [1].",
      opportunityScore: 81,
      riskScore: 36,
      keyInsights: [
        {
          insight: "Bilingual workflows are underserved.",
          supportingAgents: ["pain-detective"],
          confidence: "high",
        },
      ],
      topThreeOpportunities: [
        { title: "Bilingual wedge", description: "Lead with APAC workflows.", rationale: "Demand is visible." },
      ],
      topThreeRisks: [
        { title: "Trust", description: "Weak evidence erodes trust.", mitigation: "Keep citations visible." },
      ],
      recommendedNextStep: "Interview ten founders.",
      launchlensBrief: "Private launch brief",
      citations: [
        { title: "Market report", url: "https://example.com/report?utm_source=test", snippet: "Evidence." },
      ],
    }),
    sources: [{ title: "Private source", url: "https://private.example/source" }],
    provider: "private-provider",
    model: "private-model",
    createdAt: 1_700_000_000_000,
    durationMs: 123_000,
    status: "completed",
    dossier: {
      version: 1,
      agents: {} as ResearchRun["dossier"] extends infer D
        ? D extends { agents: infer A }
          ? A
          : never
        : never,
      degraded: false,
    },
  };
}

describe("share manifest", () => {
  it("defaults to every public section and canonicalizes duplicates", () => {
    expect(createShareManifest(undefined).sections).toEqual(ALL_SHARE_SECTIONS);
    expect(createShareManifest(["risks", "summary", "risks"]).sections).toEqual([
      "summary",
      "risks",
    ]);
  });

  it("rejects empty, unknown, and non-array section selections", () => {
    expect(() => createShareManifest([])).toThrow(/at least one/i);
    expect(() => createShareManifest(["summary", "privateRawOutput"])).toThrow(/invalid/i);
    expect(() => createShareManifest("summary")).toThrow(/array/i);
  });

  it("projects only selected allowlisted fields", () => {
    const report = buildPublicShareProjection(
      completedRun(),
      createShareManifest(["summary", "risks"]),
    );

    expect(report.sections).toEqual({
      summary: "A focused entry is attractive [1].",
      risks: [
        { title: "Trust", description: "Weak evidence erodes trust.", mitigation: "Keep citations visible." },
      ],
    });
    expect(report).not.toHaveProperty("id");
    expect(report).not.toHaveProperty("result");
    expect(report).not.toHaveProperty("provider");
    expect(report).not.toHaveProperty("model");
    expect(report).not.toHaveProperty("dossier");
    expect(report).not.toHaveProperty("keywords");
    expect(JSON.stringify(report)).not.toContain("Private launch brief");
    expect(JSON.stringify(report)).not.toContain("private-provider");
  });

  it("sanitizes public source URLs while preserving selected report data", () => {
    const report = buildPublicShareProjection(
      completedRun(),
      createShareManifest(["scores", "insights", "opportunities", "nextStep", "sources"]),
    );

    expect(report.sections.scores).toEqual({ opportunityScore: 81, riskScore: 36 });
    expect(report.sections.insights).toHaveLength(1);
    expect(report.sections.opportunities).toHaveLength(1);
    expect(report.sections.nextStep).toBe("Interview ten founders.");
    expect(report.sections.sources).toEqual([
      { title: "Market report", url: "https://example.com/report", snippet: "Evidence." },
    ]);
  });
});
