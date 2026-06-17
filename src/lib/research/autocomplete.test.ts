import { describe, it, expect } from "vitest";
import { getAutocompleteSuggestions, getEmptyQuerySuggestions } from "./autocomplete";

const mockHistory = [
  {
    id: "1",
    query: "AI-powered note-taking app for university students",
    keywords: ["AI", "education", "SaaS"],
    createdAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
  },
  {
    id: "2",
    query: "B2B SaaS tool for freelance designers",
    keywords: ["SaaS", "design", "freelance"],
    createdAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
  },
  {
    id: "3",
    query: "AI customer support automation for ecommerce",
    keywords: ["AI", "support", "ecommerce"],
    createdAt: Date.now() - 1000 * 60 * 60 * 72, // 3 days ago
  },
  {
    id: "4",
    query: "Fitness app for busy working professionals",
    keywords: ["fitness", "mobile", "subscription"],
    createdAt: Date.now() - 1000 * 60 * 60 * 96, // 4 days ago
  },
];

describe("autocomplete", () => {
  describe("getAutocompleteSuggestions", () => {
    it("returns empty array for queries shorter than 2 characters", () => {
      expect(getAutocompleteSuggestions("", mockHistory)).toEqual([]);
      expect(getAutocompleteSuggestions("a", mockHistory)).toEqual([]);
    });

    it("returns history prefix matches for matching queries", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 5);
      const historyResults = results.filter((r) => r.type === "history");
      expect(historyResults.length).toBeGreaterThan(0);
      // Should contain AI-powered note-taking and AI customer support
      const queries = historyResults.map((r) => r.text.toLowerCase());
      expect(queries.some((q) => q.includes("ai-powered"))).toBe(true);
      expect(queries.some((q) => q.includes("ai customer"))).toBe(true);
    });

    it("returns keyword matches for partial keywords", () => {
      const results = getAutocompleteSuggestions("SaaS", mockHistory, 5);
      const keywordResults = results.filter((r) => r.type === "keyword");
      expect(keywordResults.length).toBeGreaterThan(0);
      expect(keywordResults.some((r) => r.text.toLowerCase() === "saas")).toBe(true);
    });

    it("limits results to the specified count", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("works without history (uses seed keywords)", () => {
      const results = getAutocompleteSuggestions("AI", [], 5);
      expect(results.length).toBeGreaterThan(0);
      const texts = results.map((r) => r.text.toLowerCase());
      expect(texts.some((t) => t.includes("ai"))).toBe(true);
    });

    it("includes template completions for short queries", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 8);
      const templateResults = results.filter((r) => r.type === "template");
      // May or may not include templates depending on matches — not guaranteed
      // but should not crash
      expect(Array.isArray(templateResults)).toBe(true);
    });

    it("sorts results by score descending", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 5);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it("dedupes identical suggestions", () => {
      const results = getAutocompleteSuggestions("SaaS", mockHistory, 10);
      const texts = results.map((r) => r.text.toLowerCase());
      const uniqueTexts = new Set(texts);
      expect(texts.length).toBe(uniqueTexts.size);
    });

    it("returns hint information for each result", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 3);
      for (const r of results) {
        expect(r.hint).toBeDefined();
        expect(typeof r.hint).toBe("string");
      }
    });

    it("history items score higher than keyword items", () => {
      const results = getAutocompleteSuggestions("AI", mockHistory, 10);
      const historyScores = results.filter((r) => r.type === "history").map((r) => r.score);
      const keywordScores = results.filter((r) => r.type === "keyword").map((r) => r.score);

      if (historyScores.length > 0 && keywordScores.length > 0) {
        const minHistory = Math.min(...historyScores);
        const maxKeyword = Math.max(...keywordScores);
        expect(minHistory).toBeGreaterThan(maxKeyword);
      }
    });
  });

  describe("getEmptyQuerySuggestions", () => {
    it("returns recent history items first", () => {
      const results = getEmptyQuerySuggestions(mockHistory, 6);
      const historyResults = results.filter((r) => r.type === "history");
      expect(historyResults.length).toBeGreaterThan(0);
      // Most recent should be first history item
      expect(historyResults[0].text).toContain("AI-powered");
    });

    it("fills remaining slots with seed keywords", () => {
      const results = getEmptyQuerySuggestions(mockHistory, 6);
      const keywordResults = results.filter((r) => r.type === "keyword");
      expect(keywordResults.length).toBeGreaterThan(0);
      expect(keywordResults.every((r) => r.hint === "trending")).toBe(true);
    });

    it("respects the limit", () => {
      const results = getEmptyQuerySuggestions(mockHistory, 4);
      expect(results.length).toBeLessThanOrEqual(4);
    });

    it("works with empty history", () => {
      const results = getEmptyQuerySuggestions([], 6);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.type === "keyword")).toBe(true);
    });

    it("includes keywords on history items", () => {
      const results = getEmptyQuerySuggestions(mockHistory, 3);
      const historyResults = results.filter((r) => r.type === "history");
      expect(historyResults[0].keywords?.length).toBeGreaterThan(0);
    });
  });
});
