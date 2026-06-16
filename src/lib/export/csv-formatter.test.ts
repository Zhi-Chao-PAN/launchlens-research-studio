import { describe, it, expect } from "vitest";
import {
  generateCompetitorsCSV,
  generatePainPointsCSV,
  generatePricingCSV,
  generateChannelsCSV,
  generateMarketCSV,
  generateCSVBundle,
} from "@/lib/export/csv-formatter";
import type {
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
  AgentOutput,
  AgentId,
} from "@/lib/schema/research-schema";

const market: MarketSizerOutput = {
  agent: "market-sizer",
  summary: "s",
  marketSize: { tam: 1e9, sam: 1e8, som: 1e6, currency: "USD", growthRate: 10, growthTrend: "stable", unit: "revenue", sources: [], confidence: "high" },
  keyTrends: [],
  targetSegments: [],
  citations: [],
};

const comp: CompetitorAnalystOutput = {
  agent: "competitor-analyst",
  summary: "s",
  competitors: [
    { id: "c1", name: "Acme, Inc", tagline: "Best tool", strengths: ["Fast", "Cheap"], weaknesses: ["Limited"], pricing: { min: 10, max: 100, model: "monthly", currency: "USD" }, positioning: "mid-market", differentiation: "UX", citations: [] },
  ],
  competitiveMatrix: [],
  gaps: [],
  citations: [],
};

const pain: PainDetectiveOutput = {
  agent: "pain-detective",
  summary: "s",
  painPoints: [
    { id: "p1", pain: "Hard to use", frequency: "common", severity: "critical", quotes: [{ text: "Hate it", source: "User" }], userSegments: ["devs", "designers"], citations: [] },
  ],
  unmetNeeds: [],
  userPersonas: [],
  citations: [],
};

const pricing: PricingScoutOutput = {
  agent: "pricing-scout",
  summary: "s",
  priceBands: [{ name: "Budget", min: 0, max: 50, typical: 25, currency: "USD" }],
  competitorPricing: [],
  monetizationModels: [],
  willingnessToPay: [],
  recommendations: [],
  citations: [],
};

const channel: ChannelScoutOutput = {
  agent: "channel-scout",
  summary: "s",
  channels: [{ name: "Twitter", category: "social", reach: "broad", cost: "low", effectiveness: "high", audience: "Tech", keyPlatforms: ["twitter.com"], notes: "Good" }],
  communityHubs: [],
  contentTopics: [],
  recommendedChannels: [],
  citations: [],
};

describe("generateMarketCSV", () => {
  it("includes TAM/SAM/SOM/Growth", () => {
    const csv = generateMarketCSV(market);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("metric");
    expect(csv).toContain("TAM");
    expect(csv).toContain("SAM");
    expect(csv).toContain("SOM_3yr");
    expect(csv).toContain("Growth_Rate");
  });
});

describe("generateCompetitorsCSV", () => {
  it("quotes values with commas", () => {
    const csv = generateCompetitorsCSV(comp);
    expect(csv).toContain('"Acme, Inc"');
    expect(csv).toContain("Acme, Inc");
  });

  it("includes headers", () => {
    const csv = generateCompetitorsCSV(comp);
    const headers = csv.split("\n")[0];
    expect(headers).toContain("name");
    expect(headers).toContain("min_price");
    expect(headers).toContain("positioning");
  });

  it("handles empty competitors list", () => {
    const empty: CompetitorAnalystOutput = { ...comp, competitors: [] };
    const csv = generateCompetitorsCSV(empty);
    const lines = csv.split("\n");
    expect(lines.length).toBe(1); // just header
  });
});

describe("generatePainPointsCSV", () => {
  it("joins segments with semicolons", () => {
    const csv = generatePainPointsCSV(pain);
    expect(csv).toContain("devs; designers");
  });

  it("includes quote text", () => {
    const csv = generatePainPointsCSV(pain);
    expect(csv).toContain("Hate it");
  });
});

describe("generatePricingCSV", () => {
  it("includes all bands", () => {
    const csv = generatePricingCSV(pricing);
    expect(csv).toContain("Budget");
    expect(csv).toContain("band");
  });
});

describe("generateChannelsCSV", () => {
  it("includes all channel metadata", () => {
    const csv = generateChannelsCSV(channel);
    expect(csv).toContain("Twitter");
    expect(csv).toContain("social");
    expect(csv).toContain("broad");
  });
});

describe("generateCSVBundle", () => {
  it("returns object keyed by file name", () => {
    const outputs: Record<AgentId, AgentOutput | null> = {
      "market-sizer": market,
      "competitor-analyst": comp,
      "pain-detective": pain,
      "pricing-scout": pricing,
      "channel-scout": channel,
      synthesis: null,
    };
    const bundle = generateCSVBundle({ outputs });
    expect(bundle["market-size.csv"]).toBeDefined();
    expect(bundle["competitors.csv"]).toBeDefined();
    expect(bundle["pain-points.csv"]).toBeDefined();
    expect(bundle["pricing.csv"]).toBeDefined();
    expect(bundle["channels.csv"]).toBeDefined();
    expect(Object.keys(bundle).length).toBe(5);
  });

  it("omits CSVs for missing outputs", () => {
    const outputs: Record<AgentId, AgentOutput | null> = {
      "market-sizer": null,
      "competitor-analyst": null,
      "pain-detective": null,
      "pricing-scout": null,
      "channel-scout": null,
      synthesis: null,
    };
    const bundle = generateCSVBundle({ outputs });
    expect(Object.keys(bundle).length).toBe(0);
  });
});
