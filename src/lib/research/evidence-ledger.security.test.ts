// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentOutput } from "@/lib/schema/research-schema";
import type { RetrievedSource } from "@/lib/providers/retrieval.types";
import {
  allowlistAgentOutput,
  buildDeepRetrievalQueries,
  buildDeepRetrievalRescueQueries,
  buildFocusedRetrievalQuery,
  canonicalizeRetrievedSources,
} from "./evidence-ledger";

function source(url: string, id: string): RetrievedSource {
  return {
    id,
    title: `Source ${id}`,
    url,
    snippet: "retrieved evidence",
    accessedAt: "2026-07-13T00:00:00.000Z",
    retrievedAt: "2026-07-13T00:00:00.000Z",
    confidence: "medium",
    agent: "market-sizer",
  };
}

describe("evidence ledger security boundaries", () => {
  it("keeps long research briefs concise while preserving specialist intent", () => {
    const query = buildFocusedRetrievalQuery("product context ".repeat(100), "pricing-scout");

    expect(query.length).toBeLessThanOrEqual(280);
    expect(query).toMatch(/^pricing pages plans tiers willingness to pay benchmarks\./);
    expect(query).toContain("Product context:");
  });

  it("fans Deep retrieval into three bounded, specialist-specific intents", () => {
    const query = "AI-native evidence-backed APAC market research workspace for SaaS founders ".repeat(8);
    const painQueries = buildDeepRetrievalQueries(query, "pain-detective");
    const pricingQueries = buildDeepRetrievalQueries(query, "pricing-scout");

    expect(painQueries).toHaveLength(3);
    expect(new Set(painQueries).size).toBe(3);
    expect(painQueries.every((item) => item.length <= 280)).toBe(true);
    expect(painQueries[0]).toMatch(/Reddit, Indie Hackers, G2/i);
    expect(pricingQueries).toHaveLength(3);
    expect(pricingQueries[0]).toMatch(/^Official pricing pages/i);
    expect(pricingQueries[0]).not.toMatch(/^market size TAM SAM SOM/i);
  });

  it("builds two bounded diversity-rescue queries without copying an oversized brief", () => {
    const rescueQueries = buildDeepRetrievalRescueQueries(
      "bilingual APAC SaaS evidence workspace ".repeat(30),
      "pricing-scout",
    );

    expect(rescueQueries).toHaveLength(2);
    expect(new Set(rescueQueries).size).toBe(2);
    expect(rescueQueries.every((item) => item.length <= 280)).toBe(true);
    expect(rescueQueries[0]).toMatch(/^Independent evidence from additional publishers/i);
    expect(rescueQueries[1]).toMatch(/^Dated primary, official, and analyst sources/i);
  });

  it("persists only canonical public retrieval URLs", () => {
    const result = canonicalizeRetrievedSources(
      [
        source("https://EXAMPLE.com/report/?utm_source=tavily&b=2&a=1#section", "one"),
        source("http://169.254.169.254/latest/meta-data", "metadata"),
        source("https://user:secret@example.com/report", "credentials"),
        { ...source("https://empty.example/report", "empty"), snippet: "" },
      ],
      "market-sizer",
    );

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://example.com/report?a=1&b=2");
  });

  it("drops nested references when a duplicate citation id has conflicting URLs", () => {
    const first = source("https://one.example.com/report", "source-one");
    const second = source("https://two.example.com/report", "source-two");
    const output = {
      agent: "market-sizer",
      summary: "summary",
      marketSize: {
        tam: 100,
        sam: 50,
        som: 10,
        currency: "USD",
        growthRate: 10,
        growthTrend: "stable",
        unit: "revenue",
        sources: ["duplicate"],
        confidence: "high",
      },
      keyTrends: [],
      targetSegments: [],
      citations: [
        { ...first, id: "duplicate" },
        { ...second, id: "duplicate" },
      ],
    } as AgentOutput;

    const result = allowlistAgentOutput(output, [first, second], "strict");
    expect(result.output.citations).toEqual([]);
    expect(result.output.agent).toBe("market-sizer");
    if (result.output.agent !== "market-sizer") throw new Error("unexpected agent");
    expect(result.output.marketSize.sources).toEqual([]);
    expect(result.stats.rejected).toBe(2);
  });

  it("requires strict competitor links to be both safe and retrieved", () => {
    const allowed = source("https://example.com/product/?utm_source=search", "allowed");
    const output = {
      agent: "competitor-analyst",
      summary: "summary",
      competitors: [
        { id: "a", name: "Allowed", url: "https://example.com/product", citations: [] },
        { id: "b", name: "Unmatched", url: "https://other.example.com", citations: [] },
        { id: "c", name: "Local", url: "http://127.0.0.1/admin", citations: [] },
      ],
      competitiveMatrix: [],
      gaps: [],
      citations: [],
    } as unknown as AgentOutput;

    const result = allowlistAgentOutput(output, [allowed], "strict");
    if (result.output.agent !== "competitor-analyst") throw new Error("unexpected agent");
    expect(result.output.competitors.map((competitor) => competitor.url)).toEqual([
      "https://example.com/product",
      undefined,
      undefined,
    ]);
  });

  it("removes unsafe and non-allowlisted community hub links in strict mode", () => {
    const allowed = source("https://community.example.com/hub", "allowed-hub");
    const output = {
      agent: "channel-scout",
      summary: "summary",
      channels: [],
      communityHubs: [
        { name: "Allowed", platform: "Web", size: "10k", focus: "AI", url: allowed.url },
        { name: "Unmatched", platform: "Web", size: "1k", focus: "AI", url: "https://other.example.com/hub" },
        { name: "Local", platform: "Web", size: "1", focus: "AI", url: "http://localhost/admin" },
      ],
      contentTopics: [],
      recommendedChannels: [],
      citations: [],
    } as unknown as AgentOutput;

    const result = allowlistAgentOutput(output, [allowed], "strict");
    if (result.output.agent !== "channel-scout") throw new Error("unexpected agent");
    expect(result.output.communityHubs.map((hub) => hub.url)).toEqual([
      "https://community.example.com/hub",
      undefined,
      undefined,
    ]);
  });
});
