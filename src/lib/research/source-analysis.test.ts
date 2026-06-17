import { describe, it, expect } from "vitest";
import {
  analyzeSources,
  analyzeInsightConfidence,
  generateRadarData,
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
