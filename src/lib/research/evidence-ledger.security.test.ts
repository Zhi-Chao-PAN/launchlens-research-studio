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
    expect(painQueries.every((item) => item.length <= 200)).toBe(true);
    expect(painQueries[0]).toMatch(/Reddit, Indie Hackers, G2/i);
    expect(pricingQueries).toHaveLength(3);
    expect(pricingQueries[0]).toMatch(/Official pricing pages/i);
    expect(pricingQueries[0]).not.toMatch(/^market size TAM SAM SOM/i);
  });

  it("builds short category-first pricing queries from at most two sanitized keywords", () => {
    const query =
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders, with emphasis on validated willingness to pay.";
    const keywords = [
      "  AI\nmarket   research ",
      "APAC\tSaaS",
      "bilingual founders",
    ];

    const primaryQueries = buildDeepRetrievalQueries(
      query,
      "pricing-scout",
      keywords,
    );
    const rescueQueries = buildDeepRetrievalRescueQueries(
      query,
      "pricing-scout",
      keywords,
    );

    expect([...primaryQueries, ...rescueQueries]).toHaveLength(5);
    expect(
      [...primaryQueries, ...rescueQueries].every((item) => item.length <= 200),
    ).toBe(true);
    expect(
      [...primaryQueries, ...rescueQueries].every((item) =>
        item.startsWith(
          "bilingual AI research workspace serving APAC SaaS founders",
        ),
      ),
    ).toBe(true);
    expect([...primaryQueries, ...rescueQueries].join(" ")).toContain("founders market");
    expect([...primaryQueries, ...rescueQueries].join(" ")).not.toContain(
      "founders AI market research",
    );
    expect([...primaryQueries, ...rescueQueries].join(" ")).not.toContain(
      "Evaluate the market opportunity",
    );
    expect([...primaryQueries, ...rescueQueries].join(" ")).not.toContain(
      "validated willingness to pay",
    );
  });

  it("retains product and audience when keywords are broad single terms", () => {
    const queries = buildDeepRetrievalQueries(
      "Assess the market opportunity for an AI-powered note-taking app for university students, including adoption barriers, pricing, and a 90-day launch plan.",
      "pricing-scout",
      ["AI", "education", "SaaS"],
    );

    expect(queries).toHaveLength(3);
    expect(queries.every((item) => item.length <= 200)).toBe(true);
    expect(
      queries.every((item) =>
        item.startsWith(
          "AI-powered note-taking app for university students education SaaS.",
        ),
      ),
    ).toBe(true);
    expect(queries.join(" ")).toContain("note-taking app");
    expect(queries.join(" ")).toContain("university students");
  });

  it("adds only missing tokens when a keyword partially overlaps the query subject", () => {
    const queries = buildDeepRetrievalQueries(
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders, with emphasis on pricing.",
      "pricing-scout",
      ["AI market research"],
    );

    expect(
      queries.every((item) =>
        item.startsWith(
          "bilingual AI research workspace serving APAC SaaS founders market.",
        ),
      ),
    ).toBe(true);
    expect(queries.join(" ")).not.toContain("AI research workspace AI market research");
  });

  it("uses normalized substring coverage to avoid repeating Chinese keywords", () => {
    const queries = buildDeepRetrievalQueries(
      "评估面向大学生的人工智能研究平台的市场机会，重点关注定价与采用障碍。",
      "pricing-scout",
      ["人工智能"],
    );

    expect(
      queries.every((item) => item.startsWith("面向大学生的人工智能研究平台.")),
    ).toBe(true);
    expect(queries.every((item) => !item.startsWith("面向大学生的人工智能研究平台 人工智能."))).toBe(
      true,
    );
  });

  it("preserves semantic punctuation when plain keyword tokens overlap", () => {
    const cAndR = buildDeepRetrievalQueries(
      "Assess C programming tooling for university programming courses, including pricing.",
      "pricing-scout",
      ["C++", "R&D"],
    );
    const node = buildDeepRetrievalQueries(
      "Assess Node developer tooling for university programming courses, including pricing.",
      "pricing-scout",
      ["Node.js"],
    );

    expect(
      cAndR.every((item) =>
        item.startsWith("C programming tooling for university programming courses C++ R&D."),
      ),
    ).toBe(true);
    expect(
      node.every((item) =>
        item.startsWith("Node developer tooling for university programming courses Node.js."),
      ),
    ).toBe(true);
  });

  it("uses keywords or specialist focus only when the product query is empty", () => {
    const keywordFallback = buildDeepRetrievalQueries(
      "",
      "pricing-scout",
      ["AI", "education", "SaaS"],
    );
    const focusFallback = buildDeepRetrievalQueries("", "pricing-scout");

    expect(keywordFallback.every((item) => item.startsWith("AI education."))).toBe(true);
    expect(focusFallback[0]).toMatch(
      /^pricing pages plans tiers willingness to pay benchmarks\./,
    );
  });

  it("builds two bounded diversity-rescue queries without copying an oversized brief", () => {
    const rescueQueries = buildDeepRetrievalRescueQueries(
      "bilingual APAC SaaS evidence workspace ".repeat(30),
      "pricing-scout",
    );

    expect(rescueQueries).toHaveLength(2);
    expect(new Set(rescueQueries).size).toBe(2);
    expect(rescueQueries.every((item) => item.length <= 200)).toBe(true);
    expect(rescueQueries[0]).toMatch(/Independent evidence from additional publishers/i);
    expect(rescueQueries[1]).toMatch(/Dated primary, official, and analyst sources/i);
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
