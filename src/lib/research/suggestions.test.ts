import { describe, it, expect } from "vitest";
import { extractTopics, generateSuggestions, clusterHistoryByTopic } from "./suggestions";
import type { ResearchSuggestion } from "./suggestions";

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
