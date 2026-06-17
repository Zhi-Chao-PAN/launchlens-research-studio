import { describe, expect, it } from "vitest";
import {
  computeSourceOverlap,
  deduplicateSources,
  findDuplicateSources,
  getDomainFrequency,
  getTopDomains,
  computeSourceDiversity,
  summarizeOverlap,
  mergeSources,
} from "./source-overlap";

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


describe("source deduplication (round 132)", () => {
  it("deduplicateSources removes duplicate URLs", () => {
    const sources = [
      { title: "A", url: "https://example.com/a" },
      { title: "A2", url: "https://example.com/a" },
      { title: "B", url: "https://example.com/b" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(2);
  });

  it("deduplicateSources keeps titled version when available", () => {
    const sources = [
      { url: "https://example.com/a" },
      { title: "Named", url: "https://example.com/a" },
    ];
    const result = deduplicateSources(sources);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Named");
  });

  it("deduplicateSources normalizes URLs", () => {
    const sources = [
      { url: "https://www.Example.com/A/" },
      { url: "https://example.com/a" },
    ];
    expect(deduplicateSources(sources)).toHaveLength(1);
  });

  it("deduplicateSources handles empty/undefined", () => {
    expect(deduplicateSources([])).toHaveLength(0);
    // @ts-expect-error testing undefined
    expect(deduplicateSources(undefined)).toHaveLength(0);
  });

  it("findDuplicateSources groups duplicates by count", () => {
    const sources = [
      { url: "https://example.com/a" },
      { url: "https://example.com/a" },
      { url: "https://example.com/a" },
      { url: "https://example.com/b" },
      { url: "https://example.com/b" },
      { url: "https://example.com/c" },
    ];
    const dups = findDuplicateSources(sources);
    expect(dups).toHaveLength(2);
    expect(dups[0].count).toBe(3);
    expect(dups[1].count).toBe(2);
  });

  it("findDuplicateSources returns empty for unique sources", () => {
    const sources = [
      { url: "https://example.com/a" },
      { url: "https://example.com/b" },
    ];
    expect(findDuplicateSources(sources)).toHaveLength(0);
  });
});

describe("domain frequency (round 132)", () => {
  it("counts domains and computes percentages", () => {
    const sources = [
      { url: "https://wikipedia.org/a" },
      { url: "https://wikipedia.org/b" },
      { url: "https://wikipedia.org/c" },
      { url: "https://nytimes.com/d" },
    ];
    const freq = getDomainFrequency(sources);
    expect(freq).toHaveLength(2);
    expect(freq[0].domain).toBe("wikipedia.org");
    expect(freq[0].count).toBe(3);
    expect(freq[0].percentage).toBe(75);
    expect(freq[1].domain).toBe("nytimes.com");
  });

  it("getTopDomains limits to N", () => {
    const sources = [
      { url: "https://a.com/1" },
      { url: "https://b.com/1" },
      { url: "https://c.com/1" },
      { url: "https://d.com/1" },
    ];
    const top = getTopDomains(sources, 2);
    expect(top).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(getDomainFrequency([])).toHaveLength(0);
    expect(getTopDomains([], 5)).toHaveLength(0);
  });
});

describe("source diversity metrics (round 132)", () => {
  it("measures high concentration", () => {
    const sources = [
      { url: "https://wikipedia.org/a" },
      { url: "https://wikipedia.org/b" },
      { url: "https://wikipedia.org/c" },
      { url: "https://other.com/x" },
    ];
    const m = computeSourceDiversity(sources);
    expect(m.totalSources).toBe(4);
    expect(m.uniqueDomains).toBe(2);
    expect(m.isHighlyConcentrated).toBe(true);
  });

  it("measures balanced diversity", () => {
    const sources = [
      { url: "https://a.com/1" },
      { url: "https://b.com/1" },
      { url: "https://c.com/1" },
      { url: "https://d.com/1" },
    ];
    const m = computeSourceDiversity(sources);
    expect(m.uniqueDomains).toBe(4);
    expect(m.domainDiversityScore).toBe(1);
    expect(m.isHighlyConcentrated).toBe(false);
  });

  it("detects duplicates in diversity metrics", () => {
    const sources = [
      { url: "https://a.com/1" },
      { url: "https://a.com/1" },
      { url: "https://b.com/1" },
    ];
    const m = computeSourceDiversity(sources);
    expect(m.duplicateCount).toBe(1);
    expect(m.hasDeduplicatedDuplicates).toBe(true);
    expect(m.totalSources).toBe(2);
  });
});

describe("overlap summary (round 132)", () => {
  it("labels identical overlap", () => {
    const r = computeSourceOverlap(
      [{ url: "https://a.com/1" }],
      [{ url: "https://a.com/1" }]
    );
    const s = summarizeOverlap(r);
    expect(s.similarityLabel).toBe("identical");
  });

  it("labels no overlap", () => {
    const r = computeSourceOverlap(
      [{ url: "https://a.com/1" }],
      [{ url: "https://b.com/1" }]
    );
    const s = summarizeOverlap(r);
    expect(s.similarityLabel).toBe("none");
    expect(s.coverageRatio).toBe(0);
  });

  it("labels medium overlap", () => {
    const a = [
      { url: "https://a.com/1" },
      { url: "https://a.com/2" },
      { url: "https://b.com/1" },
      { url: "https://c.com/1" },
    ];
    const b = [
      { url: "https://a.com/1" },
      { url: "https://d.com/1" },
      { url: "https://e.com/1" },
    ];
    const r = computeSourceOverlap(a, b);
    const s = summarizeOverlap(r);
    expect(s.similarityLabel).toBe("low");
    expect(s.overlapDescription.length).toBeGreaterThan(0);
    expect(s.suggestion.length).toBeGreaterThan(0);
  });
});

describe("merge sources (round 132)", () => {
  it("merges multiple source lists and deduplicates", () => {
    const list1 = [{ url: "https://a.com/1" }, { url: "https://b.com/1" }];
    const list2 = [{ url: "https://b.com/1" }, { url: "https://c.com/1" }];
    const list3 = [{ url: "https://d.com/1" }];
    const merged = mergeSources(list1, list2, list3);
    expect(merged.totalInput).toBe(5);
    expect(merged.uniqueCount).toBe(4);
    expect(merged.duplicatesRemoved).toBe(1);
    expect(merged.sources).toHaveLength(4);
    expect(merged.domainBreakdown.length).toBeGreaterThan(0);
  });

  it("handles zero lists", () => {
    const merged = mergeSources();
    expect(merged.totalInput).toBe(0);
    expect(merged.uniqueCount).toBe(0);
    expect(merged.sources).toHaveLength(0);
  });
});

