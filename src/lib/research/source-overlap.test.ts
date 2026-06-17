import { describe, expect, it } from "vitest";
import { computeSourceOverlap } from "./source-overlap";

describe("source-overlap", () => {
  describe("computeSourceOverlap", () => {
    it("computes full overlap for identical sources", () => {
      const sources = [
        { title: "A", url: "https://example.com/article" },
        { title: "B", url: "https://test.com/page" },
      ];
      const result = computeSourceOverlap(sources, sources);
      expect(result.totalA).toBe(2);
      expect(result.totalB).toBe(2);
      expect(result.shared).toBe(2);
      expect(result.onlyA).toBe(0);
      expect(result.onlyB).toBe(0);
      expect(result.jaccardSimilarity).toBeCloseTo(1);
    });

    it("computes zero overlap for disjoint sources", () => {
      const a = [{ title: "A", url: "https://example.com/article" }];
      const b = [{ title: "B", url: "https://other.com/page" }];
      const result = computeSourceOverlap(a, b);
      expect(result.shared).toBe(0);
      expect(result.onlyA).toBe(1);
      expect(result.onlyB).toBe(1);
      expect(result.jaccardSimilarity).toBe(0);
    });

    it("handles partial overlap", () => {
      const a = [
        { title: "A", url: "https://example.com/a" },
        { title: "B", url: "https://example.com/b" },
        { title: "C", url: "https://example.com/c" },
      ];
      const b = [
        { title: "B", url: "https://example.com/b" },
        { title: "D", url: "https://example.com/d" },
      ];
      const result = computeSourceOverlap(a, b);
      expect(result.shared).toBe(1);
      expect(result.onlyA).toBe(2);
      expect(result.onlyB).toBe(1);
      expect(result.jaccardSimilarity).toBeCloseTo(0.25); // 1 / 4
    });

    it("normalizes URLs (ignores trailing slashes, www prefix, case)", () => {
      const a = [{ url: "https://www.Example.com/Article/" }];
      const b = [{ url: "https://example.com/Article" }];
      const result = computeSourceOverlap(a, b);
      expect(result.shared).toBe(1);
    });

    it("computes domain overlap", () => {
      const a = [
        { url: "https://wikipedia.org/page1" },
        { url: "https://wikipedia.org/page2" },
        { url: "https://nytimes.com/article" },
      ];
      const b = [
        { url: "https://wikipedia.org/page3" },
        { url: "https://bbc.com/news" },
      ];
      const result = computeSourceOverlap(a, b);
      expect(result.sharedDomains).toContain("wikipedia.org");
      expect(result.domainsOnlyA).toContain("nytimes.com");
      expect(result.domainsOnlyB).toContain("bbc.com");
    });

    it("handles empty inputs", () => {
      const result = computeSourceOverlap([], []);
      expect(result.totalA).toBe(0);
      expect(result.totalB).toBe(0);
      expect(result.shared).toBe(0);
      expect(result.jaccardSimilarity).toBe(0);
    });

    it("handles undefined/null inputs gracefully", () => {
      // @ts-expect-error testing undefined input
      const result = computeSourceOverlap(undefined, null);
      expect(result.totalA).toBe(0);
      expect(result.totalB).toBe(0);
      expect(result.shared).toBe(0);
    });
  });
});