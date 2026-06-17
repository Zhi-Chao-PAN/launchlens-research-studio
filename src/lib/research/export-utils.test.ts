import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  synthesisToMarkdown,
  runToStructuredJSON,
  generateExportFilename,
} from "@/lib/research/export-utils";
import type { SynthesisOutput } from "@/lib/research/synthesis-parser";

// Mock window + document + URL for download tests
beforeAll(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    createElement: () => ({ href: "", download: "", style: {} }),
    body: { appendChild: () => {}, removeChild: () => {} },
  });
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => {},
  });
  vi.stubGlobal("Blob", function (parts: any[], opts: any) {
    this.parts = parts;
    this.opts = opts;
  });
});

const mockSyn: SynthesisOutput = {
  agent: "test-agent",
  execSummary: "This is a test summary.",
  opportunityScore: 75,
  riskScore: 30,
  keyInsights: [
    { insight: "First insight", confidence: "high", supportingAgents: ["a"] },
    { insight: "Second insight", confidence: "medium", supportingAgents: ["b"] },
  ],
  topThreeOpportunities: [
    { title: "Opp 1", description: "Desc 1", rationale: "Reason 1" },
    { title: "Opp 2", description: "Desc 2", rationale: "Reason 2" },
    { title: "Opp 3", description: "Desc 3", rationale: "Reason 3" },
  ],
  topThreeRisks: [
    { title: "Risk 1", description: "Risk desc 1", mitigation: "Fix 1" },
    { title: "Risk 2", description: "Risk desc 2", mitigation: "Fix 2" },
    { title: "Risk 3", description: "Risk desc 3", mitigation: "Fix 3" },
  ],
  recommendedNextStep: "Do the next thing",
  launchlensBrief: "Brief summary here",
  citations: [],
};

describe("export utils", () => {
  describe("synthesisToMarkdown", () => {
    it("generates valid markdown", () => {
      const md = synthesisToMarkdown(mockSyn, {
        query: "Test query",
        keywords: ["test", "research"],
        runId: "test-123",
        agent: "analyst",
      });

      expect(md).toContain("# 研究报告");
      expect(md).toContain("Test query");
      expect(md).toContain("test, research");
      expect(md).toContain("## 执行摘要");
      expect(md).toContain("This is a test summary.");
      expect(md).toContain("75/100");
      expect(md).toContain("30/100");
      expect(md).toContain("## 核心洞察");
      expect(md).toContain("First insight");
      expect(md).toContain("## 三大机遇");
      expect(md).toContain("Opp 1");
      expect(md).toContain("## 三大风险");
      expect(md).toContain("Risk 1");
      expect(md).toContain("建议下一步");
      expect(md).toContain("Do the next thing");
      expect(md).toContain("LaunchLens");
      expect(md).toContain("test-123");
    });

    it("works without metadata", () => {
      const md = synthesisToMarkdown(mockSyn);
      expect(md).toContain("# 研究报告");
      expect(md).toContain("未知");
    });

    it("includes sources when provided", () => {
      const md = synthesisToMarkdown(mockSyn, {
        sources: [
          { title: "Source 1", url: "https://example.com/1" },
          { title: "Source 2", url: "https://example.com/2" },
        ],
      });

      expect(md).toContain("## 参考来源");
      expect(md).toContain("Source 1");
      expect(md).toContain("https://example.com/1");
    });
  });

  describe("generateExportFilename", () => {
    it("generates a filename with query and date", () => {
      const name = generateExportFilename("AI market research", "md");
      expect(name).toMatch(/\.md$/);
      expect(name).toContain("ai-market-research");
      expect(name).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("handles Chinese queries", () => {
      const name = generateExportFilename("人工智能市场", "json");
      expect(name).toMatch(/\.json$/);
      expect(name.length).toBeGreaterThan(0);
    });

    it("handles empty query gracefully", () => {
      const name = generateExportFilename("", "txt");
      expect(name).toMatch(/research.*\.txt$/);
    });

    it("limits filename length", () => {
      const longQuery = "a".repeat(100);
      const name = generateExportFilename(longQuery, "md");
      expect(name.length).toBeLessThan(80);
    });
  });

  describe("runToStructuredJSON", () => {
    it("produces valid JSON with required fields", () => {
      const run = {
        id: "test-1",
        query: "test query",
        keywords: ["a", "b"],
        status: "completed" as const,
        result: JSON.stringify({ summary: "hello" }),
        sources: [],
        createdAt: Date.now(),
        durationMs: 5000,
        provider: "mock",
        model: "test",
        agent: "analyst",
      };

      const json = runToStructuredJSON(run, false);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe("test-1");
      expect(parsed.query).toBe("test query");
      expect(parsed.keywords).toEqual(["a", "b"]);
      expect(parsed.status).toBe("completed");
      expect(parsed.durationSeconds).toBe(5);
      expect(parsed.result).toBeDefined();
      expect(parsed.provider).toBe("mock");
      expect(parsed.agent).toBe("analyst");
    });

    it("handles non-JSON results gracefully", () => {
      const run = {
        id: "test-2",
        query: "test",
        keywords: [],
        status: "completed" as const,
        result: "plain text result",
        sources: [],
        createdAt: Date.now(),
      };

      const json = runToStructuredJSON(run, false);
      const parsed = JSON.parse(json);
      expect(parsed.result.raw).toBe("plain text result");
    });

    it("pretty prints when requested", () => {
      const run = {
        id: "t",
        query: "q",
        keywords: [],
        status: "completed" as const,
        result: "{}",
        sources: [],
        createdAt: Date.now(),
      };

      const pretty = runToStructuredJSON(run, true);
      const compact = runToStructuredJSON(run, false);
      expect(pretty.length).toBeGreaterThan(compact.length);
      expect(pretty).toContain("\n");
    });
  });
});