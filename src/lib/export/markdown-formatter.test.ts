import { describe, it, expect } from "vitest";
import { generateMarkdownReport, generateBriefOnly } from "@/lib/export/markdown-formatter";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

const mockOutputs: Record<AgentId, AgentOutput> = {
  "market-sizer": {
    agent: "market-sizer",
    summary: "Test market summary",
    marketSize: {
      tam: 85_600_000_000,
      sam: 12_400_000_000,
      som: 180_000_000,
      currency: "USD",
      growthRate: 26.5,
      growthTrend: "accelerating",
      unit: "revenue",
      sources: ["cite-market-1"],
      confidence: "high",
    },
    keyTrends: [
      { trend: "AI growth", impact: "positive", evidence: "Widespread adoption" },
    ],
    targetSegments: [
      { name: "SMBs", size: 1_000_000_000, description: "Small businesses" },
    ],
    citations: [
      {
        id: "cite-market-1",
        title: "Test Report",
        url: "https://example.com",
        snippet: "Test snippet",
        accessedAt: "2026-06-16T00:00:00.000Z",
        confidence: "high",
        agent: "market-sizer",
      },
    ],
  },
  "competitor-analyst": {
    agent: "competitor-analyst",
    summary: "Comp summary",
    competitors: [
      {
        id: "c1",
        name: "Acme",
        tagline: "We do things",
        strengths: ["Fast"],
        weaknesses: ["Expensive"],
        pricing: { min: 10, max: 100, model: "monthly", currency: "USD" },
        positioning: "mid-market",
        differentiation: "Best UX",
        citations: [],
      },
    ],
    competitiveMatrix: [],
    gaps: [{ gap: "Mobile", opportunity: "Build mobile app", difficulty: "medium" }],
    citations: [],
  },
  "pain-detective": {
    agent: "pain-detective",
    summary: "Pain summary",
    painPoints: [
      {
        id: "p1",
        pain: "Hard to use",
        frequency: "common",
        severity: "critical",
        quotes: [{ text: "I hate this", source: "User A" }],
        userSegments: ["students"],
        citations: [],
      },
    ],
    unmetNeeds: [],
    userPersonas: [
      { name: "Sam", role: "PM", goals: ["Save time"], frustrations: ["Slow tools"] },
    ],
    citations: [],
  },
  "pricing-scout": {
    agent: "pricing-scout",
    summary: "Pricing summary",
    priceBands: [
      { name: "Budget", min: 0, max: 50, typical: 25, currency: "USD" },
    ],
    competitorPricing: [],
    monetizationModels: [
      { model: "Subscription", prevalence: 80, examples: ["Acme"] },
    ],
    willingnessToPay: [
      { segment: "SMB", estimate: 50, confidence: "medium" },
    ],
    recommendations: [
      { tier: "Pro", price: 49, rationale: "Market avg" },
    ],
    citations: [],
  },
  "channel-scout": {
    agent: "channel-scout",
    summary: "Channel summary",
    channels: [
      {
        name: "Twitter",
        category: "social",
        reach: "broad",
        cost: "low",
        effectiveness: "high",
        audience: "Tech pros",
        keyPlatforms: ["twitter.com"],
        notes: "Best channel",
      },
    ],
    communityHubs: [
      { name: "r/startups", platform: "Reddit", size: "1M", focus: "Startups" },
    ],
    contentTopics: [
      { topic: "AI tools", searchVolume: "high", competition: "high" },
    ],
    recommendedChannels: [
      { channel: "Twitter", priority: "high", why: "Best reach" },
    ],
    citations: [],
  },
  synthesis: {
    agent: "synthesis",
    execSummary: "Synthesized summary",
    opportunityScore: 75,
    riskScore: 40,
    keyInsights: [
      {
        insight: "AI is hot",
        supportingAgents: ["market-sizer", "competitor-analyst"],
        confidence: "high",
      },
    ],
    topThreeOpportunities: [
      { title: "Mobile", description: "Build mobile", rationale: "Gap" },
    ],
    topThreeRisks: [
      { title: "Competition", description: "Many players", mitigation: "Differentiate" },
    ],
    recommendedNextStep: "Build MVP",
    launchlensBrief: "## Brief\n\nTest brief content",
    citations: [],
  },
};

const emptyOutputs: Record<AgentId, AgentOutput | null> = {
  "market-sizer": null,
  "competitor-analyst": null,
  "pain-detective": null,
  "pricing-scout": null,
  "channel-scout": null,
  synthesis: null,
};

describe("generateMarkdownReport", () => {
  it("includes the title, session id, and query", () => {
    const md = generateMarkdownReport({
      sessionId: "test-session-123",
      query: "AI tool for X",
      keywords: ["ai", "x"],
      outputs: mockOutputs,
    });
    expect(md).toContain("# Market Research Report");
    expect(md).toContain("test-session-123");
    expect(md).toContain("AI tool for X");
    expect(md).toContain("`ai`");
    expect(md).toContain("`x`");
  });

  it("includes all completed agent sections", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
    });
    expect(md).toContain("## Market Sizer");
    expect(md).toContain("## Competitor Analyst");
    expect(md).toContain("## Pain Detective");
    expect(md).toContain("## Pricing Scout");
    expect(md).toContain("## Channel Scout");
    expect(md).toContain("## Synthesis");
  });

  it("skips null outputs", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: emptyOutputs,
    });
    expect(md).not.toContain("## Market Sizer");
    expect(md).not.toContain("## Synthesis");
  });

  it("includes TAM/SAM/SOM with formatted values", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
    });
    expect(md).toContain("TAM");
    expect(md).toContain("$85.60B");
    expect(md).toContain("$180.0M");
  });

  it("includes confidence badges in citations", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
    });
    expect(md).toContain("🟢 High");
  });

  it("includes table of contents when requested", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
      includeTableOfContents: true,
    });
    expect(md).toContain("## Table of Contents");
  });

  it("omits table of contents when disabled", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
      includeTableOfContents: false,
    });
    expect(md).not.toContain("## Table of Contents");
  });

  it("includes synthesis scores", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
    });
    expect(md).toContain("Opportunity Score:** 75");
    expect(md).toContain("Risk Score:** 40");
  });

  it("includes personal notes section when personalNotes is provided", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
      personalNotes: {
        personalNote: "This is my personal note about the research.",
        tags: ["important", "follow-up"],
        rating: 4,
        isStarred: true,
      },
    });
    expect(md).toContain("## Personal Notes");
    expect(md).toContain("This is my personal note about the research.");
    expect(md).toContain("`important`");
    expect(md).toContain("`follow-up`");
    expect(md).toContain("★★★★☆ (4/5)");
    expect(md).toContain("⭐ Yes");
  });

  it("shows empty state when personalNote is empty", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
      personalNotes: {
        personalNote: "",
        tags: [],
        rating: 0,
        isStarred: false,
      },
    });
    expect(md).toContain("## Personal Notes");
    expect(md).toContain("_No personal notes yet._");
    expect(md).not.toContain("**Tags:**");
    expect(md).not.toContain("**Rating:**");
    expect(md).not.toContain("**Starred:**");
  });

  it("omits personal notes section when personalNotes is not provided", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
    });
    expect(md).not.toContain("## Personal Notes");
  });

  it("places personal notes after TOC and before agent sections", () => {
    const md = generateMarkdownReport({
      sessionId: "x",
      query: "Q",
      keywords: [],
      outputs: mockOutputs,
      includeTableOfContents: true,
      personalNotes: {
        personalNote: "My note",
        tags: ["tag1"],
        rating: 3,
        isStarred: false,
      },
    });
    const tocIdx = md.indexOf("## Table of Contents");
    const notesIdx = md.indexOf("## Personal Notes");
    const firstAgentIdx = md.indexOf("## Market Sizer");
    expect(tocIdx).toBeGreaterThan(-1);
    expect(notesIdx).toBeGreaterThan(tocIdx);
    expect(firstAgentIdx).toBeGreaterThan(notesIdx);
  });
});

describe("generateBriefOnly", () => {
  it("returns empty string when synthesis is missing", () => {
    expect(generateBriefOnly(emptyOutputs)).toBe("");
  });

  it("returns importable brief when synthesis exists", () => {
    const brief = generateBriefOnly(mockOutputs);
    expect(brief).toContain("# LaunchLens Import Brief");
    expect(brief).toContain("Opportunity Score: 75");
    expect(brief).toContain("Build MVP");
    // P1-3: raw launchlensBrief must not appear in markdown exports
    expect(brief).not.toContain("Test brief content");
  });

  it("includes top opportunities and risks", () => {
    const brief = generateBriefOnly(mockOutputs);
    expect(brief).toContain("Mobile");
    expect(brief).toContain("Competition");
    expect(brief).toContain("Differentiate");
  });
});
