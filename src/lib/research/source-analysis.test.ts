import { describe, it, expect } from "vitest";
import {
  analyzeSources,
  analyzeInsightConfidence,
  generateRadarData,
classifySource,
  getSourceTypeBreakdown,
  calculateDiversity,
  extractTitleKeywords,
  assessSourceQuality,
  overallQualityScore,
  analyzeSourceRecency,
} from "./source-analysis";

describe("source analysis", () => {
  describe("analyzeSources", () => {
    it("counts sources by domain", () => {
      const sources = [
        { url: "https://example.com/article1", title: "Article 1" },
        { url: "https://example.com/article2", title: "Article 2" },
        { url: "https://news.org/report", title: "Report" },
        { url: "https://www.example.com/page", title: "Page" },
      ];
      const result = analyzeSources(sources);
      expect(result.totalSources).toBe(4);
      expect(result.domains.length).toBe(2);
      expect(result.domains[0].domain).toBe("example.com");
      expect(result.domains[0].count).toBe(3);
      expect(result.domains[1].domain).toBe("news.org");
      expect(result.domains[1].count).toBe(1);
    });

    it("handles empty input", () => {
      const result = analyzeSources([]);
      expect(result.totalSources).toBe(0);
      expect(result.domains.length).toBe(0);
    });

    it("calculates percentages", () => {
      const sources = [
        { url: "https://a.com/1", title: "" },
        { url: "https://a.com/2", title: "" },
        { url: "https://b.com/1", title: "" },
        { url: "https://c.com/1", title: "" },
      ];
      const result = analyzeSources(sources);
      expect(result.domains[0].percentage).toBe(50);
      expect(result.domains[1].percentage).toBe(25);
      expect(result.domains[2].percentage).toBe(25);
    });

    it("handles invalid URLs gracefully", () => {
      const sources = [
        { url: "not-a-url", title: "Bad URL" },
      ];
      const result = analyzeSources(sources);
      expect(result.totalSources).toBe(1);
      expect(result.domains.length).toBe(1);
    });

    it("sorts domains by count descending", () => {
      const sources = [
        { url: "https://small.com/1", title: "" },
        { url: "https://big.com/1", title: "" },
        { url: "https://big.com/2", title: "" },
        { url: "https://big.com/3", title: "" },
      ];
      const result = analyzeSources(sources);
      expect(result.domains[0].count).toBe(3);
      expect(result.domains[1].count).toBe(1);
    });
  });

  describe("analyzeInsightConfidence", () => {
    it("counts high/medium/low confidence insights", () => {
      const insights = [
        { confidence: "High" },
        { confidence: "Medium" },
        { confidence: "High" },
        { confidence: "Low" },
        { confidence: "Medium" },
        { confidence: "Medium" },
      ];
      const dist = analyzeInsightConfidence(insights);
      expect(dist.high).toBe(2);
      expect(dist.medium).toBe(3);
      expect(dist.low).toBe(1);
      expect(dist.total).toBe(6);
    });

    it("handles empty array", () => {
      const dist = analyzeInsightConfidence([]);
      expect(dist.high).toBe(0);
      expect(dist.medium).toBe(0);
      expect(dist.low).toBe(0);
      expect(dist.total).toBe(0);
    });

    it("is case insensitive", () => {
      const insights = [
        { confidence: "high" },
        { confidence: "HIGH" },
        { confidence: "Low" },
      ];
      const dist = analyzeInsightConfidence(insights);
      expect(dist.high).toBe(2);
      expect(dist.low).toBe(1);
    });

    it("treats unknown confidence as medium", () => {
      const insights = [
        { confidence: "Moderate" },
        { confidence: "Uncertain" },
      ];
      const dist = analyzeInsightConfidence(insights);
      expect(dist.medium).toBe(2);
    });
  });

  describe("generateRadarData", () => {
    it("generates 6 radar dimensions", () => {
      const synthesis = {
        opportunityScore: 75,
        riskScore: 40,
        keyInsights: [
          { confidence: "High" },
          { confidence: "Medium" },
          { confidence: "High" },
        ],
        topThreeOpportunities: [{}, {}, {}],
        topThreeRisks: [{}, {}],
        citations: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}],
      };
      const data = generateRadarData(synthesis);
      expect(data.length).toBe(6);
      expect(data[0].label).toBe("Opportunity");
      expect(data[0].value).toBe(75);
    });

    it("reverses risk score (lower risk = higher value)", () => {
      const synthesis = {
        opportunityScore: 50,
        riskScore: 20,
        keyInsights: [],
      };
      const data = generateRadarData(synthesis);
      // Risk (reversed) should be 100 - 20 = 80
      const riskItem = data.find((d) => d.label === "Risk (reversed)");
      expect(riskItem?.value).toBe(80);
    });

    it("caps scores at 100", () => {
      const synthesis = {
        opportunityScore: 150,
        riskScore: 0,
        keyInsights: Array(50).fill({ confidence: "High" }),
        citations: Array(100).fill({}),
        topThreeOpportunities: [{}, {}, {}],
        topThreeRisks: [{}, {}, {}],
      };
      const data = generateRadarData(synthesis);
      for (const item of data) {
        expect(item.value).toBeLessThanOrEqual(100);
        expect(item.value).toBeGreaterThanOrEqual(0);
      }
    });
  });
});


describe("extended source analysis (round 140)", () => {
  describe("classifySource", () => {
    it("classifies government domains", () => {
      expect(classifySource("https://www.irs.gov/path")).toBe("government");
      expect(classifySource("https://data.gov/dataset")).toBe("government");
    });

    it("classifies academic domains", () => {
      expect(classifySource("https://stanford.edu/paper")).toBe("academic");
      expect(classifySource("https://arxiv.org/abs/1234")).toBe("academic");
    });

    it("classifies news domains", () => {
      expect(classifySource("https://www.reuters.com/markets")).toBe("news");
      expect(classifySource("https://bloomberg.com/news")).toBe("news");
    });

    it("classifies reference domains", () => {
      expect(classifySource("https://en.wikipedia.org/wiki/AI")).toBe("reference");
      expect(classifySource("https://statista.com/statistics")).toBe("reference");
    });

    it("classifies social domains", () => {
      expect(classifySource("https://twitter.com/user/status/1")).toBe("social");
      expect(classifySource("https://www.linkedin.com/posts/1")).toBe("social");
    });

    it("falls back to company for unknown corporate-looking urls", () => {
      expect(classifySource("https://acme.co/about")).toBe("company");
    });

    it("returns other for invalid urls", () => {
      expect(classifySource("not-a-url")).toBe("other");
    });

    it("classifies blog from subdomain", () => {
      expect(classifySource("https://blog.example.com/post")).toBe("blog");
    });
  });

  describe("getSourceTypeBreakdown", () => {
    it("counts types and percentages", () => {
      const sources = [
        { url: "https://reuters.com/a" },
        { url: "https://bbc.com/b" },
        { url: "https://stanford.edu/c" },
        { url: "https://acme.co/d" },
      ];
      const b = getSourceTypeBreakdown(sources);
      const total = b.reduce((s, x) => s + x.count, 0);
      expect(total).toBe(4);
      const newsRow = b.find(r => r.type === "news");
      expect(newsRow?.count).toBe(2);
      expect(newsRow?.percentage).toBe(50);
    });

    it("returns empty for empty input", () => {
      expect(getSourceTypeBreakdown([])).toEqual([]);
    });
  });

  describe("calculateDiversity", () => {
    it("measures domain spread", () => {
      const sources = [
        { url: "https://a.com/1" },
        { url: "https://b.com/2" },
        { url: "https://c.com/3" },
        { url: "https://d.com/4" },
      ];
      const d = calculateDiversity(sources);
      expect(d.uniqueDomains).toBe(4);
      expect(d.domainDiversity).toBe(100);
    });

    it("returns zero for empty input", () => {
      const d = calculateDiversity([]);
      expect(d.overallDiversity).toBe(0);
      expect(d.totalSources).toBe(0);
    });

    it("identifies dominant domain share", () => {
      const sources = [
        { url: "https://a.com/1" },
        { url: "https://a.com/2" },
        { url: "https://a.com/3" },
        { url: "https://b.com/1" },
      ];
      const d = calculateDiversity(sources);
      expect(d.dominantDomain).toBe("a.com");
      expect(d.dominantDomainShare).toBe(75);
    });
  });

  describe("extractTitleKeywords", () => {
    it("extracts high-signal keywords, skipping stop words", () => {
      const titles = [
        "AI market growth in 2026",
        "AI healthcare trends and growth",
        "The future of AI",
      ];
      const kws = extractTitleKeywords(titles, 5);
      expect(kws[0].keyword).toBe("ai");
      expect(kws[0].count).toBe(3);
    });

    it("returns empty for empty input", () => {
      expect(extractTitleKeywords([])).toEqual([]);
    });
  });

  describe("assessSourceQuality", () => {
    it("awards higher scores to gov/academic", () => {
      const s = assessSourceQuality([{ url: "https://www.data.gov/report", title: "Official Report 2026" }]);
      expect(s[0].reputationScore).toBeGreaterThanOrEqual(80);
      expect(s[0].isHttps).toBe(true);
      expect(s[0].hasTitle).toBe(true);
    });

    it("returns signals even for invalid urls", () => {
      const s = assessSourceQuality([{ url: "bad", title: "" }]);
      expect(s).toHaveLength(1);
      expect(s[0].reputationScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("overallQualityScore", () => {
    it("returns 0 for no sources", () => {
      expect(overallQualityScore([])).toBe(0);
    });

    it("scores above 70 for high-quality diverse set", () => {
      const sources = [
        { url: "https://reuters.com/markets", title: "Market trends in AI 2026" },
        { url: "https://stanford.edu/report", title: "AI Index Report" },
        { url: "https://data.gov/dataset", title: "Labor Statistics 2025" },
        { url: "https://en.wikipedia.org/wiki/AI", title: "Artificial Intelligence" },
      ];
      expect(overallQualityScore(sources)).toBeGreaterThanOrEqual(70);
    });
  });

  describe("analyzeSourceRecency", () => {
    it("infers year from title", () => {
      const r = analyzeSourceRecency([
        { url: "https://example.com/report", title: "Trends 2025" },
        { url: "https://example.com/old", title: "Archive 2010" },
      ]);
      expect(r.newestYear).toBe(2025);
      expect(r.oldestYear).toBe(2010);
      expect(r.unknown).toBe(0);
    });

    it("counts unknown when no year present", () => {
      const r = analyzeSourceRecency([{ url: "https://example.com/x", title: "About us" }]);
      expect(r.unknown).toBe(1);
    });
  });
});
