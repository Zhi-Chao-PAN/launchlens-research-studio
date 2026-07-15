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
    expect(painQueries.every((item) => item.length <= 120)).toBe(true);
    expect(painQueries[0]).toMatch(/Reddit, Indie Hackers, G2/i);
    expect(pricingQueries).toHaveLength(3);
    expect(pricingQueries[0]).toMatch(/Official pricing pages/i);
    expect(pricingQueries[0]).not.toMatch(/^market size TAM SAM SOM/i);
  });

  it("builds production-shaped pricing queries from a complete category anchor", () => {
    const query =
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders, with emphasis on validated willingness to pay.";
    const keywords = [
      "  AI\nmarket   research ",
      "APAC\tSaaS",
      "bilingual founders",
      "willingness to pay",
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

    expect(primaryQueries).toEqual([
      "AI market research software official pricing pages and plans APAC SaaS",
      "AI market research SaaS pricing and packaging benchmarks bilingual founders",
      "AI market research customer reviews and price sensitivity willingness to pay",
    ]);
    expect(rescueQueries).toEqual([
      "AI market research software pricing comparison",
      "AI market research buyer budget benchmarks",
    ]);
    expect([...primaryQueries, ...rescueQueries]).toHaveLength(5);
    expect(
      [...primaryQueries, ...rescueQueries].every((item) => item.length <= 120),
    ).toBe(true);
    expect(
      [...primaryQueries, ...rescueQueries].every((item) =>
        item.startsWith("AI market research "),
      ),
    ).toBe(true);
    expect(primaryQueries.filter((item) => item.includes("APAC SaaS"))).toHaveLength(1);
    expect(primaryQueries.filter((item) => item.includes("bilingual founders"))).toHaveLength(1);
    expect(primaryQueries.filter((item) => item.includes("willingness to pay"))).toHaveLength(1);
    expect(rescueQueries.join(" ")).not.toMatch(/additional publishers|dated primary/i);
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
    expect(queries.every((item) => item.length <= 120)).toBe(true);
    expect(
      queries.every((item) =>
        item.startsWith("AI-powered note-taking app for university students "),
      ),
    ).toBe(true);
    expect(queries.join(" ")).toContain("note-taking app");
    expect(queries.join(" ")).toContain("university students");
    expect(queries.filter((item) => item.includes("education"))).toHaveLength(1);
    expect(queries.filter((item) => item.includes("SaaS"))).toHaveLength(1);
  });

  it("preserves a complete category phrase instead of appending missing tokens", () => {
    const queries = buildDeepRetrievalQueries(
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders, with emphasis on pricing.",
      "pricing-scout",
      ["AI market research"],
    );

    expect(
      queries.every((item) =>
        item.startsWith("AI market research "),
      ),
    ).toBe(true);
    expect(queries.join(" ")).not.toContain("founders market");
  });

  it("does not let qualifier-only keywords replace the product subject", () => {
    const queries = buildDeepRetrievalQueries(
      "Assess the market opportunity for an AI note-taking app for students",
      "pricing-scout",
      ["APAC SaaS", "willingness to pay"],
    );

    expect(
      queries.every((item) => item.startsWith("AI note-taking app for students ")),
    ).toBe(true);
    expect(queries.filter((item) => item.includes("APAC SaaS"))).toHaveLength(1);
    expect(queries.filter((item) => item.includes("willingness to pay"))).toHaveLength(1);
  });

  it("selects the category anchor independently of keyword order", () => {
    const queries = buildDeepRetrievalQueries(
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders",
      "pricing-scout",
      ["willingness to pay", "APAC SaaS", "AI market research", "bilingual founders"],
    );

    expect(queries.every((item) => item.startsWith("AI market research "))).toBe(true);
    expect(queries.join(" ")).not.toMatch(/^willingness to pay|^APAC SaaS/);
  });

  it("does not replace a complete subject with a generic category token", () => {
    const keywordSets = [
      ["software", "APAC"],
      ["product managers"],
      ["research budget"],
      ["软件"],
    ];

    for (const keywords of keywordSets) {
      const queries = buildDeepRetrievalQueries(
        "Assess the market opportunity for an AI note-taking app for students",
        "pricing-scout",
        keywords,
      );
      expect(
        queries.every((item) => item.startsWith("AI note-taking app for students ")),
      ).toBe(true);
    }
  });

  it("selects an explicit Chinese market-research category anchor", () => {
    const queries = buildDeepRetrievalQueries(
      "请评估这个想法的市场机会",
      "pricing-scout",
      ["人工智能市场研究", "亚太软件创始人"],
    );

    expect(queries.every((item) => item.startsWith("人工智能市场研究 "))).toBe(true);
  });

  it("uses normalized substring coverage to avoid repeating Chinese keywords", () => {
    const queries = buildDeepRetrievalQueries(
      "评估面向大学生的人工智能研究平台的市场机会，重点关注定价与采用障碍。",
      "pricing-scout",
      ["人工智能"],
    );

    expect(
      queries.every((item) => item.startsWith("面向大学生的人工智能研究平台 ")),
    ).toBe(true);
    expect(queries.every((item) => !item.startsWith("面向大学生的人工智能研究平台 人工智能 "))).toBe(
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
        item.startsWith("C programming tooling for university programming courses "),
      ),
    ).toBe(true);
    expect(cAndR.filter((item) => item.includes("C++"))).toHaveLength(1);
    expect(cAndR.filter((item) => item.includes("R&D"))).toHaveLength(1);
    expect(
      node.every((item) =>
        item.startsWith("Node developer tooling for university programming courses "),
      ),
    ).toBe(true);
    expect(node.filter((item) => item.includes("Node.js"))).toHaveLength(1);
  });

  it("uses keywords or specialist focus only when the product query is empty", () => {
    const keywordFallback = buildDeepRetrievalQueries(
      "",
      "pricing-scout",
      ["AI", "education", "SaaS"],
    );
    const focusFallback = buildDeepRetrievalQueries("", "pricing-scout");

    expect(keywordFallback.every((item) => item.startsWith("AI education "))).toBe(true);
    expect(focusFallback[0]).toMatch(
      /^pricing pages plans tiers willingness to pay benchmarks /,
    );
  });

  it("builds two bounded diversity-rescue queries without copying an oversized brief", () => {
    const rescueQueries = buildDeepRetrievalRescueQueries(
      "bilingual APAC SaaS evidence workspace ".repeat(30),
      "pricing-scout",
    );

    expect(rescueQueries).toHaveLength(2);
    expect(new Set(rescueQueries).size).toBe(2);
    expect(rescueQueries.every((item) => item.length <= 120)).toBe(true);
    expect(rescueQueries.join(" ")).not.toMatch(/additional publishers|dated primary/i);
    expect(rescueQueries[0]).toMatch(/software pricing comparison/i);
    expect(rescueQueries[1]).toMatch(/buyer budget benchmarks/i);
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
