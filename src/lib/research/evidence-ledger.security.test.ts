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
  shouldRestrictDeepVocDomains,
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

  it("keeps Chinese local-business Deep queries on-topic and in-language", () => {
    const query =
      "一个创业想法：在暑假七八月，在深圳地铁口摆摊卖早餐，目标用户是通勤上班族。请验证市场需求、合规约束、单位经济性、竞争格局和获客渠道。";
    const keywords = ["深圳", "地铁早餐", "通勤上班族", "摆摊合规", "单位经济性"];

    const painQueries = buildDeepRetrievalQueries(query, "pain-detective", keywords);
    const pricingQueries = buildDeepRetrievalQueries(query, "pricing-scout", keywords);
    const channelQueries = buildDeepRetrievalQueries(query, "channel-scout", keywords);
    const specialistIds = [
      "market-sizer",
      "competitor-analyst",
      "pain-detective",
      "pricing-scout",
      "channel-scout",
    ] as const;
    const allQueries = specialistIds.flatMap((agentId) => [
      ...buildDeepRetrievalQueries(query, agentId, keywords),
      ...buildDeepRetrievalRescueQueries(query, agentId, keywords),
    ]);

    expect(allQueries).toHaveLength(25);
    expect(
      allQueries.every((item) => item.startsWith("在深圳地铁口摆摊卖早餐 ")),
    ).toBe(true);
    expect(painQueries[0]).toContain("消费者评价");
    expect(pricingQueries[0]).toContain("竞品官方价格");
    expect(channelQueries[0]).toContain("获客渠道");
    expect(allQueries.join(" ")).not.toMatch(
      /SaaS|software|B2B|cross-border|Indie Hackers/iu,
    );
    expect(shouldRestrictDeepVocDomains(query, keywords)).toBe(false);
    expect(
      shouldRestrictDeepVocDomains(
        "Evaluate an AI research workspace for SaaS founders",
        ["product reviews"],
      ),
    ).toBe(true);
    expect(
      shouldRestrictDeepVocDomains(
        "Open a breakfast stall outside a London station for commuters",
        ["local food", "unit economics"],
      ),
    ).toBe(false);
  });

  it("scores and combines location-prefixed subjects instead of taking the first clause", () => {
    const keywords = ["深圳", "地铁早餐", "通勤上班族", "摆摊合规", "单位经济性"];
    const chineseVariants = [
      "一个创业想法：在深圳，在地铁口摆摊卖早餐，目标用户是通勤上班族。",
      "我有一个创业想法，在2026年第三季度，在深圳，在地铁口摆摊卖早餐，目标用户是通勤上班族。",
    ];

    for (const query of chineseVariants) {
      const primary = buildDeepRetrievalQueries(query, "pain-detective", keywords);
      const rescue = buildDeepRetrievalRescueQueries(query, "pain-detective", keywords);
      expect([...primary, ...rescue].every((item) =>
        item.startsWith("在深圳地铁口摆摊卖早餐 "),
      )).toBe(true);
    }

    const englishQuery =
      "A startup idea: In 2026, in Shenzhen, sell breakfast outside a subway platform for commuters.";
    const englishQueries = buildDeepRetrievalQueries(
      englishQuery,
      "pain-detective",
      ["Shenzhen", "station breakfast", "commuters"],
    );
    expect(
      englishQueries.every((item) => item.startsWith("in Shenzhen sell breakfast ")),
    ).toBe(true);
    expect(englishQueries.join(" ")).not.toMatch(/SaaS|cross-border|Indie Hackers/iu);
    expect(shouldRestrictDeepVocDomains(englishQuery)).toBe(false);

    const nounPhraseQueries = buildDeepRetrievalQueries(
      "A business idea: In Shenzhen, a breakfast stall for commuters.",
      "market-sizer",
      ["Shenzhen"],
    );
    expect(
      nounPhraseQueries.every((item) =>
        item.startsWith("In Shenzhen a breakfast stall for commuters "),
      ),
      nounPhraseQueries.join("\n"),
    ).toBe(true);

    const dimensionQueries = buildDeepRetrievalQueries(
      "一个创业想法：在深圳地铁口摆摊卖早餐。单位经济性至关重要。",
      "pricing-scout",
      ["单位经济性"],
    );
    expect(
      dimensionQueries.every((item) =>
        item.startsWith("在深圳地铁口摆摊卖早餐 "),
      ),
      dimensionQueries.join("\n"),
    ).toBe(true);

    const englishDimensionQueries = buildDeepRetrievalQueries(
      "A business idea: In Shenzhen, a breakfast stall for commuters. Unit economics is critical.",
      "pricing-scout",
      ["unit economics"],
    );
    expect(
      englishDimensionQueries.every((item) =>
        item.startsWith("In Shenzhen a breakfast stall for commuters "),
      ),
      englishDimensionQueries.join("\n"),
    ).toBe(true);

    const compoundDimensionFixtures = [
      {
        query: "一个创业想法：在深圳地铁口摆摊卖早餐。单位经济性和合规约束都至关重要。",
        keywords: ["单位经济性和合规约束"],
        anchor: "在深圳地铁口摆摊卖早餐 ",
      },
      {
        query: "A business idea: sell breakfast outside a Shenzhen station. Unit economics and compliance are both critical.",
        keywords: ["unit economics and compliance"],
        anchor: "sell breakfast outside a Shenzhen station ",
      },
    ];
    for (const fixture of compoundDimensionFixtures) {
      const queries = buildDeepRetrievalQueries(
        fixture.query,
        "pricing-scout",
        fixture.keywords,
      );
      expect(
        queries.every((item) => item.startsWith(fixture.anchor)),
        queries.join("\n"),
      ).toBe(true);
    }

    const postposedLocationQuery =
      "A business idea: a breakfast stall for commuters, in Shenzhen.";
    const postposedLocationQueries = [
      ...buildDeepRetrievalQueries(
        postposedLocationQuery,
        "market-sizer",
        ["Shenzhen"],
      ),
      ...buildDeepRetrievalRescueQueries(
        postposedLocationQuery,
        "market-sizer",
        ["Shenzhen"],
      ),
    ];
    expect(
      postposedLocationQueries.every((item) =>
        item.startsWith("in Shenzhen a breakfast stall for commuters "),
      ),
      postposedLocationQueries.join("\n"),
    ).toBe(true);

    const aiPreambleQueries = buildDeepRetrievalQueries(
      "An AI business idea: In Shenzhen, open a tutoring center for local families.",
      "market-sizer",
      ["AI"],
    );
    expect(
      aiPreambleQueries.every((item) =>
        item.startsWith("In Shenzhen open a tutoring center for local families "),
      ),
      aiPreambleQueries.join("\n"),
    ).toBe(true);

    const shortKeywordQueries = buildDeepRetrievalQueries(
      "早餐店，面向通勤族。",
      "market-sizer",
      ["早餐店"],
    );
    expect(shortKeywordQueries.every((item) => item.startsWith("早餐店 "))).toBe(true);
    expect(shortKeywordQueries.join("\n")).not.toContain("在早餐店面向通勤族");
  });

  it("requires explicit SaaS evidence before using bespoke software intents or VOC domains", () => {
    const physicalAiService =
      "Open an AI-assisted physical tutoring center near a subway platform for local families.";
    const consumerApp =
      "Evaluate a consumer meal-planning app for busy parents, including pricing and acquisition.";

    expect(shouldRestrictDeepVocDomains(physicalAiService)).toBe(false);
    expect(shouldRestrictDeepVocDomains(consumerApp)).toBe(false);
    expect(
      buildDeepRetrievalQueries(consumerApp, "channel-scout").join(" "),
    ).not.toMatch(/B2B SaaS|cross-border|founder communities/iu);
    expect(
      shouldRestrictDeepVocDomains(
        "Evaluate a bilingual AI research workspace for APAC SaaS founders.",
      ),
    ).toBe(true);
    expect(
      shouldRestrictDeepVocDomains(
        "Evaluate a Software-as-a-Service research workspace for founders.",
      ),
    ).toBe(true);
  });

  it("preserves per-query qualifiers when a long subject consumes the anchor budget", () => {
    const queries = buildDeepRetrievalQueries(
      `Assess the market opportunity for ${"a premium commuter breakfast concept with rapid service ".repeat(4)}`,
      "pricing-scout",
      ["London", "rail commuters", "unit economics"],
    );

    expect(queries.every((item) => item.length <= 120)).toBe(true);
    expect(queries[0]).toContain("London");
    expect(queries[1]).toContain("rail commuters");
    expect(queries[2]).toContain("unit economics");
  });

  it("keeps Japanese and Korean general-business intents in the query language", () => {
    const japanese = buildDeepRetrievalQueries(
      "東京駅前で通勤客向けの朝食店を開く。価格と需要を検証する。",
      "pricing-scout",
    );
    const korean = buildDeepRetrievalQueries(
      "서울 지하철역 앞에서 직장인을 위한 아침 식당을 열다. 가격과 수요를 검증한다.",
      "pricing-scout",
    );

    expect(japanese.join(" ")).toContain("競合の公式価格");
    expect(
      japanese.every((item) =>
        item.startsWith("東京駅前で通勤客向けの朝食店を開く "),
      ),
      japanese.join("\n"),
    ).toBe(true);
    expect(korean.join(" ")).toContain("경쟁사 공식 가격");
    expect([...japanese, ...korean].join(" ")).not.toMatch(/SaaS|software official/iu);

    const kanjiOnlyJapanese = buildDeepRetrievalQueries(
      "東京駅前朝食店価格調査",
      "pricing-scout",
    );
    expect(kanjiOnlyJapanese.join(" ")).toContain("競合の公式価格");
    expect(kanjiOnlyJapanese.join(" ")).not.toContain("竞品官方价格");
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
