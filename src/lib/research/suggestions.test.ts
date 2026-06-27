import { describe, it, expect } from "vitest";
import {
  extractTopics,
  generateSuggestions,
  clusterHistoryByTopic,
  findRelatedRuns,
  scoreSuggestions,
  filterSuggestionsByCategory,
  deduplicateSuggestions,
  findKeywordCooccurrences,
  diversifySuggestions,
  getResearchGaps,
  getSuggestionStats,
} from "./suggestions";

describe("research suggestions", () => {
  const makeRun = (id: string, query: string, keywords: string[], daysAgo = 7) => ({
    id,
    query,
    keywords,
    createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  });

  describe("extractTopics", () => {
    it("extracts topics from keywords", () => {
      const runs = [
        makeRun("1", "AI in healthcare", ["AI", "healthcare", "machine learning"]),
        makeRun("2", "AI ethics", ["AI", "ethics", "regulation"]),
      ];
      const topics = extractTopics(runs);
      expect(topics.length).toBeGreaterThan(0);
      // "AI" should be top since it appears in both
      expect(topics[0].topic).toBe("ai");
      expect(topics[0].score).toBeGreaterThan(0);
    });

    it("returns empty array for empty input", () => {
      expect(extractTopics([])).toEqual([]);
    });

    it("weights recent topics more heavily", () => {
      const runs = [
        makeRun("1", "Old topic", ["blockchain"], 60),
        makeRun("2", "New topic", ["quantum computing"], 1),
      ];
      const topics = extractTopics(runs);
      // Newer topic should have higher score
      const quantum = topics.find((t) => t.topic === "quantum computing");
      const blockchain = topics.find((t) => t.topic === "blockchain");
      expect(quantum?.score).toBeGreaterThan(blockchain?.score || 0);
    });

    it("includes associated keywords for each topic", () => {
      const runs = [
        makeRun("1", "AI research", ["AI", "machine learning", "deep learning"]),
      ];
      const topics = extractTopics(runs);
      const ai = topics.find((t) => t.topic === "ai");
      expect(ai?.keywords.length).toBeGreaterThan(0);
    });
  });

  describe("generateSuggestions", () => {
    it("returns trending suggestions when no history", () => {
      const suggestions = generateSuggestions([], 3);
      expect(suggestions.length).toBe(3);
      expect(suggestions.every((s) => s.category === "trending")).toBe(true);
    });

    it("generates personalized suggestions from history", () => {
      const runs = [
        makeRun("1", "AI in healthcare", ["AI", "healthcare"]),
        makeRun("2", "AI ethics", ["AI", "ethics"]),
        makeRun("3", "Machine learning basics", ["machine learning", "AI"]),
      ];
      const suggestions = generateSuggestions(runs, 4);
      expect(suggestions.length).toBe(4);
      // Should have some personalized (non-trending) suggestions
      const personalized = suggestions.filter((s) => s.category !== "trending");
      expect(personalized.length).toBeGreaterThan(0);
    });

    it("returns the requested count", () => {
      const suggestions = generateSuggestions([], 6);
      expect(suggestions.length).toBe(6);
    });

    it("includes keywords in each suggestion", () => {
      const runs = [
        makeRun("1", "AI test", ["AI", "testing"]),
      ];
      const suggestions = generateSuggestions(runs, 3);
      for (const s of suggestions) {
        expect(Array.isArray(s.keywords)).toBe(true);
        expect(s.keywords.length).toBeGreaterThan(0);
      }
    });

    it("has all required fields", () => {
      const runs = [
        makeRun("1", "Test", ["test"]),
      ];
      const suggestions = generateSuggestions(runs, 2);
      for (const s of suggestions) {
        expect(s.title).toBeDefined();
        expect(s.description).toBeDefined();
        expect(s.keywords).toBeDefined();
        expect(s.reason).toBeDefined();
        expect(s.category).toBeDefined();
      }
    });
  });

  describe("clusterHistoryByTopic", () => {
    it("groups runs into clusters", () => {
      const runs = [
        makeRun("1", "AI healthcare", ["AI", "healthcare"]),
        makeRun("2", "AI ethics", ["AI", "ethics"]),
        makeRun("3", "Climate change report", ["climate", "environment"]),
        makeRun("4", "AI in finance", ["AI", "finance"]),
      ];
      const clusters = clusterHistoryByTopic(runs, 3);
      expect(clusters.length).toBeGreaterThan(0);
      // Total runs across clusters should equal input
      const totalRuns = clusters.reduce((sum, c) => sum + c.runIds.length, 0);
      expect(totalRuns).toBe(4);
    });

    it("respects maxClusters parameter", () => {
      const runs = [
        makeRun("1", "A", ["topic-a"]),
        makeRun("2", "B", ["topic-b"]),
        makeRun("3", "C", ["topic-c"]),
        makeRun("4", "D", ["topic-d"]),
        makeRun("5", "E", ["topic-e"]),
      ];
      const clusters = clusterHistoryByTopic(runs, 2);
      // maxClusters + potentially "Other"
      expect(clusters.length).toBeLessThanOrEqual(3); // 2 + "Other"
    });

    it("sorts clusters by size descending", () => {
      const runs = [
        makeRun("1", "A1", ["AI"]),
        makeRun("2", "A2", ["AI"]),
        makeRun("3", "A3", ["AI"]),
        makeRun("4", "B1", ["blockchain"]),
        makeRun("5", "B2", ["blockchain"]),
      ];
      const clusters = clusterHistoryByTopic(runs, 3);
      expect(clusters[0].size).toBeGreaterThanOrEqual(clusters[1].size);
    });

    it("handles empty input gracefully", () => {
      const clusters = clusterHistoryByTopic([], 3);
      expect(clusters).toEqual([]);
    });
  });
});

describe("findRelatedRuns", () => {
  const mockRuns = [
    { id: "1", query: "AI in healthcare", keywords: ["AI", "healthcare", "ML", "diagnostics"] },
    { id: "2", query: "AI in finance", keywords: ["AI", "finance", "ML", "trading"] },
    { id: "3", query: "Healthcare tech trends", keywords: ["healthcare", "technology", "telemedicine"] },
    { id: "4", query: "Blockchain and crypto", keywords: ["blockchain", "crypto", "bitcoin"] },
    { id: "5", query: "ML in medicine", keywords: ["ML", "medicine", "diagnostics", "AI"] },
  ];

  it("finds runs with keyword overlap", () => {
    const target = mockRuns[0]; // AI in healthcare
    const results = findRelatedRuns(target, mockRuns, 3);
    expect(results.length).toBeGreaterThan(0);
    // Run 5 should be most similar (AI, ML, diagnostics)
    expect(results[0].run.id).toBe("5");
    expect(results[0].similarity).toBeGreaterThan(0.5);
  });

  it("excludes the target run from results", () => {
    const target = mockRuns[0];
    const results = findRelatedRuns(target, mockRuns);
    const ids = results.map((r) => r.run.id);
    expect(ids).not.toContain("1");
  });

  it("returns empty array for target with no keywords", () => {
    const target = { id: "x", keywords: [], query: "test" };
    const results = findRelatedRuns(target, mockRuns);
    expect(results).toEqual([]);
  });

  it("returns empty array when no matches found", () => {
    const target = { id: "x", keywords: ["completely", "unrelated"] };
    const results = findRelatedRuns(target, mockRuns);
    expect(results).toEqual([]);
  });

  it("respects the limit parameter", () => {
    const target = mockRuns[0];
    const results = findRelatedRuns(target, mockRuns, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("is case insensitive", () => {
    const target = { id: "x", keywords: ["ai", "HEALTHCARE"] };
    const results = findRelatedRuns(target, mockRuns, 1);
    expect(results.length).toBeGreaterThan(0);
  });

  it("includes shared keywords in results", () => {
    const target = mockRuns[0];
    const results = findRelatedRuns(target, mockRuns, 1);
    expect(results[0].sharedKeywords.length).toBeGreaterThan(0);
    expect(results[0].sharedKeywords.length).toBeLessThanOrEqual(3);
  });
});


describe("suggestion scoring and filtering (round 133)", () => {
  const makeRun = (id: string, query: string, keywords: string[], daysAgo = 7) => ({
    id, query, keywords,
    createdAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
  });

  it("scoreSuggestions assigns relevance scores", () => {
    const runs = [makeRun("1", "AI research", ["AI", "ML"])];
    const suggestions = generateSuggestions(runs, 5);
    const scored = scoreSuggestions(suggestions, runs);
    expect(scored.length).toBe(5);
    for (const s of scored) {
      expect(typeof s.relevanceScore).toBe("number");
    }
  });

  it("scoreSuggestions sorts by relevance descending", () => {
    const runs = [makeRun("1", "AI research", ["AI", "ML"])];
    const suggestions = generateSuggestions(runs, 8);
    const scored = scoreSuggestions(suggestions, runs);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].relevanceScore).toBeGreaterThanOrEqual(scored[i].relevanceScore);
    }
  });

  it("filterSuggestionsByCategory filters by category", () => {
    const all = generateSuggestions([], 8);
    const trending = filterSuggestionsByCategory(all, ["trending"]);
    expect(trending.every((s) => s.category === "trending")).toBe(true);
  });

  it("deduplicateSuggestions removes duplicate titles", () => {
    const s1 = { title: "AI research", description: "d", keywords: ["AI"], reason: "r", category: "follow-up" as const };
    const s2 = { title: "AI Research", description: "d2", keywords: ["ai"], reason: "r2", category: "related" as const };
    const s3 = { title: "Blockchain future", description: "d3", keywords: ["crypto"], reason: "r3", category: "trending" as const };
    const result = deduplicateSuggestions([s1, s2, s3]);
    expect(result).toHaveLength(2);
  });
});

describe("keyword co-occurrence (round 133)", () => {
  const makeRun = (id: string, keywords: string[]) => ({
    id, query: "q", keywords, createdAt: Date.now(),
  });

  it("finds frequently co-occurring keyword pairs", () => {
    const runs = [
      makeRun("1", ["AI", "healthcare"]),
      makeRun("2", ["AI", "healthcare", "ML"]),
      makeRun("3", ["AI", "finance"]),
    ];
    const pairs = findKeywordCooccurrences(runs, 2);
    expect(pairs.length).toBeGreaterThan(0);
    const aiHealth = pairs.find((p) =>
      (p.keyword1 === "ai" && p.keyword2 === "healthcare") ||
      (p.keyword1 === "healthcare" && p.keyword2 === "ai")
    );
    expect(aiHealth).toBeDefined();
    expect(aiHealth!.cooccurrences).toBe(2);
  });

  it("returns empty for no co-occurrences above threshold", () => {
    const runs = [
      makeRun("1", ["A"]),
      makeRun("2", ["B"]),
      makeRun("3", ["C"]),
    ];
    expect(findKeywordCooccurrences(runs, 2)).toHaveLength(0);
  });

  it("computes lift scores", () => {
    const runs = [
      makeRun("1", ["X", "Y"]),
      makeRun("2", ["X", "Y"]),
      makeRun("3", ["X"]),
    ];
    const pairs = findKeywordCooccurrences(runs, 2);
    expect(pairs[0].lift).toBeGreaterThan(0);
  });
});

describe("diversity and gaps (round 133)", () => {
  it("diversifySuggestions limits per category", () => {
    const suggestions = [
      { title: "A", description: "d", keywords: ["a"], reason: "r", category: "trending" as const },
      { title: "B", description: "d", keywords: ["b"], reason: "r", category: "trending" as const },
      { title: "C", description: "d", keywords: ["c"], reason: "r", category: "trending" as const },
      { title: "D", description: "d", keywords: ["d"], reason: "r", category: "follow-up" as const },
    ];
    const result = diversifySuggestions(suggestions, 2);
    const trending = result.filter((s) => s.category === "trending");
    expect(trending.length).toBeLessThanOrEqual(2);
    expect(result.length).toBe(3);
  });

  it("getResearchGaps identifies missing categories", () => {
    const gaps = getResearchGaps([]);
    // Empty history returns all trending, so follow-up/related/deep-dive should be gaps
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("getSuggestionStats returns stats object", () => {
    const runs = [
      { id: "1", query: "AI test", keywords: ["AI", "ML"], createdAt: Date.now() },
    ];
    const stats = getSuggestionStats(runs);
    expect(stats.totalTopics).toBeGreaterThan(0);
    expect(stats.categories).toBeDefined();
    expect(stats.topKeywords.length).toBeGreaterThan(0);
  });
});

