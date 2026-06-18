/// <reference types="vitest/globals" />
﻿import { describe, it, expect } from "vitest";
import {
  generateAgentMarkdown,
  getAgentTitle,
  countMarkdown,
  extractMarkdownTitle,
  stripMarkdown,
  extractCitations,
  citationsToCsv,
  truncateMarkdown,
  agentOutputsEqual,
  isValidAgentOutput,
} from "@/lib/export/agent-markdown";
import type { MarketSizerOutput, SynthesisOutput } from "@/lib/schema/research-schema";

const market: MarketSizerOutput = {
  agent: "market-sizer",
  summary: "The market for AI tools is large and growing.",
  marketSize: { tam: 10_000_000_000, sam: 2_000_000_000, som: 200_000_000, currency: "USD", growthRate: 25, growthTrend: "accelerating", confidence: "high", unit: "revenue", sources: ["c1"] },
  keyTrends: [
    { trend: "AI adoption rising", impact: "positive", evidence: "Gartner 2024" },
    { trend: "Data privacy concerns", impact: "negative", evidence: "Multiple breaches" },
  ],
  targetSegments: [
    { name: "SMB SaaS", size: 500_000_000, description: "Fast-moving" },
  ],
  citations: [
    { id: "c1", title: "Gartner Report", url: "https://gartner.example/r", snippet: "adoption growing", confidence: "high", accessedAt: "2026-01-01T00:00:00Z", agent: "market-sizer" },
  ],
};

const synth: SynthesisOutput = {
  agent: "synthesis",
  execSummary: "Strong opportunity with medium risk.",
  opportunityScore: 78,
  riskScore: 35,
  topThreeOpportunities: [
    { title: "Niche tools", description: "d", rationale: "r" },
    { title: "Enterprise", description: "d", rationale: "r" },
    { title: "Education", description: "d", rationale: "r" },
  ],
  topThreeRisks: [
    { title: "Competition", description: "d", mitigation: "m" },
    { title: "Regulation", description: "d", mitigation: "m" },
    { title: "Adoption", description: "d", mitigation: "m" },
  ],
  keyInsights: [
    { insight: "Good moat", supportingAgents: ["market-sizer"], confidence: "high" },
  ],
  recommendedNextStep: "Launch MVP",
  launchlensBrief: "# LaunchLens Brief\n\nStrong opportunity with medium risk. Next: Launch MVP.",
  citations: [],
};

describe("agent-markdown", () => {
  it("getAgentTitle returns canonical names", () => {
    expect(getAgentTitle("market-sizer")).toBe("Market Sizer");
    expect(getAgentTitle("synthesis")).toBe("Synthesis");
  });

  it("generateAgentMarkdown emits headings and citations", () => {
    const md = generateAgentMarkdown("market-sizer", market);
    expect(md.startsWith("#")).toBe(true);
    expect(md).toContain("Market Sizer");
    expect(md).toContain("1. [Gartner Report]");
  });

  it("generateAgentMarkdown for synthesis renders scores and insights", () => {
    const md = generateAgentMarkdown("synthesis", synth);
    expect(md).toContain("Opportunity Score");
    expect(md).toContain("78/100");
    expect(md).toContain("Niche tools");
  });
});

describe("agent-markdown pure helpers (round 164)", () => {
  it("countMarkdown counts headings, citations, tables, words", () => {
    const md = generateAgentMarkdown("market-sizer", market);
    const c = countMarkdown(md);
    expect(c.headings).toBeGreaterThanOrEqual(4);
    expect(c.citations).toBe(1);
    expect(c.tables).toBe(1);
    expect(c.chars).toBe(md.length);
    expect(c.words).toBeGreaterThan(20);
  });

  it("extractMarkdownTitle strips emoji/whitespace", () => {
    const md = generateAgentMarkdown("market-sizer", market);
    expect(extractMarkdownTitle(md)).toBe("Market Sizer");
    expect(extractMarkdownTitle("## sub")).toBe("sub");
    expect(extractMarkdownTitle("no heading")).toBeNull();
  });

  it("stripMarkdown removes syntax", () => {
    const md = generateAgentMarkdown("synthesis", synth);
    const plain = stripMarkdown(md);
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("###");
    expect(plain).toContain("Opportunity Score");
  });

  it("extractCitations parses numbered markdown links", () => {
    const md = generateAgentMarkdown("market-sizer", market);
    const cites = extractCitations(md);
    expect(cites.length).toBe(1);
    expect(cites[0].title).toBe("Gartner Report");
    expect(cites[0].url).toContain("gartner");
  });

  it("citationsToCsv produces header and quoted titles", () => {
    const csv = citationsToCsv([{ title: 'A "great" report', url: "https://x" }]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("title,url");
    expect(row).toContain("https://x");
  });

  it("truncateMarkdown preserves word boundaries", () => {
    expect(truncateMarkdown("hello world foo", 7)).toBe("hello...");
    expect(truncateMarkdown("short", 100)).toBe("short");
  });

  it("agentOutputsEqual compares by agent + json", () => {
    expect(agentOutputsEqual(market, { ...market })).toBe(true);
    expect(agentOutputsEqual(market, { ...market, summary: "other" })).toBe(false);
    expect(agentOutputsEqual(market, synth)).toBe(false);
  });

  it("isValidAgentOutput guards agent/summary", () => {
    expect(isValidAgentOutput(null)).toBe(false);
    expect(isValidAgentOutput({})).toBe(false);
    expect(isValidAgentOutput(market)).toBe(true);
    expect(isValidAgentOutput({ agent: "synthesis" })).toBe(false);
  });
});

