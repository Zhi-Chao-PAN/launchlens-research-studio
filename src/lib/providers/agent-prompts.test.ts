import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "./agent-prompts";
import type { AgentOutput } from "@/lib/schema/research-schema";

describe("agent-prompts", () => {
  describe("buildSystemPrompt", () => {
    it("names the agent and shows its required schema fields", () => {
      const prompt = buildSystemPrompt("market-sizer");
      // Every system prompt must be schema-aware — this is the regression guard
      // for the bug where real providers fell back to mock because the schema
      // was never shown to the LLM.
      expect(prompt).toContain("market-sizer");
      expect(prompt).toContain("TAM");
      expect(prompt).toContain("SAM");
      expect(prompt).toContain("SOM");
      expect(prompt).toContain("citations");
      expect(prompt).toContain("targetSegments");
    });

    it("demands a JSON-only response and forbids prose/fences", () => {
      const prompt = buildSystemPrompt("competitor-analyst");
      expect(prompt).toMatch(/single JSON object/i);
      expect(prompt).toMatch(/no markdown fences|no prose|nothing else/i);
    });

    it("includes the enum values the validator enforces", () => {
      const prompt = buildSystemPrompt("pain-detective");
      // The validator checks severity/frequency/confidence enums; the prompt
      // must surface the allowed values so the LLM does not invent others.
      expect(prompt).toContain("critical");
      expect(prompt).toContain("significant");
      expect(prompt).toContain("common");
      expect(prompt).toContain('"low" | "medium" | "high"');
    });

    it("carries the honesty rule about fabricated URLs", () => {
      const prompt = buildSystemPrompt("channel-scout");
      expect(prompt).toMatch(/prefer an honest confidence level.*low/i);
      expect(prompt).toMatch(/fabricated URL/i);
    });

    it("covers all six agents", () => {
      const agents = [
        "market-sizer",
        "competitor-analyst",
        "pain-detective",
        "pricing-scout",
        "channel-scout",
        "synthesis",
      ] as const;
      for (const id of agents) {
        const prompt = buildSystemPrompt(id);
        expect(prompt).toContain(id);
        expect(prompt).toContain("citations");
      }
    });

    it("gives the synthesis agent the cross-validation coaching", () => {
      const prompt = buildSystemPrompt("synthesis");
      expect(prompt).toContain("opportunityScore");
      expect(prompt).toContain("riskScore");
      expect(prompt).toContain("launchlensBrief");
      expect(prompt).toContain("supportingAgents");
    });
  });

  describe("buildUserPrompt", () => {
    it("includes the product query and keywords", () => {
      const prompt = buildUserPrompt("market-sizer", {
        query: "AI code reviewer",
        keywords: ["devtools", "linting"],
      });
      expect(prompt).toContain("AI code reviewer");
      expect(prompt).toContain("devtools");
      expect(prompt).toContain("linting");
    });

    it("notes when no keywords are provided", () => {
      const prompt = buildUserPrompt("pricing-scout", {
        query: "q",
        keywords: [],
      });
      expect(prompt).toMatch(/none provided/i);
    });

    it("includes verified retrieved sources when provided (R215)", () => {
      const prompt = buildUserPrompt("market-sizer", {
        query: "AI tools",
        keywords: [],
        retrievedSources: [
          {
            title: "Top AI tools 2026",
            url: "https://example.com/ai-tools",
            snippet: "a writeup about AI tools",
            confidence: "high",
          },
          {
            title: "AI tools market",
            url: "https://other.com/ai",
            snippet: "market data",
            confidence: "medium",
          },
        ],
      });
      expect(prompt).toContain("Verified web sources");
      expect(prompt).toContain("https://example.com/ai-tools");
      expect(prompt).toContain("https://other.com/ai");
      expect(prompt).toContain("[confidence: high]");
      expect(prompt).toContain("[confidence: medium]");
    });

    it("omits the verified-sources section when no retrieved sources are supplied", () => {
      const prompt = buildUserPrompt("market-sizer", {
        query: "AI tools",
        keywords: [],
      });
      expect(prompt).not.toContain("Verified web sources");
    });

    it("includes upstream outputs for the synthesis agent", () => {
      const upstream = [
        { agent: "market-sizer", summary: "x", citations: [] },
      ] as unknown as AgentOutput[];
      const prompt = buildUserPrompt("synthesis", {
        query: "q",
        keywords: [],
        upstream,
      });
      expect(prompt).toContain("Upstream agent outputs");
      expect(prompt).toContain("market-sizer");
    });

    it("renders each upstream agent as its own labeled block", () => {
      const upstream = [
        { agent: "market-sizer", summary: "ms", citations: [] },
        { agent: "competitor-analyst", summary: "ca", citations: [] },
      ] as unknown as AgentOutput[];
      const prompt = buildUserPrompt("synthesis", { query: "q", keywords: [], upstream });
      // Each agent gets a "--- <id> ---" header so the model can attribute
      // findings, and each block is independently valid JSON.
      expect(prompt).toContain("--- market-sizer ---");
      expect(prompt).toContain("--- competitor-analyst ---");
      // The full first agent output survives intact.
      expect(prompt).toContain('"summary":"ms"');
    });

    it("truncates a single oversized upstream output per-agent, not mid-array", () => {
      // An upstream output larger than the per-agent budget must be flagged
      // [truncated] rather than sliced mid-token (which would corrupt the
      // whole JSON array and make every agent's output unparseable).
      const bigSummary = "x".repeat(8000);
      const upstream = [
        { agent: "market-sizer", summary: bigSummary, citations: [] },
        { agent: "competitor-analyst", summary: "small", citations: [] },
      ] as unknown as AgentOutput[];
      const prompt = buildUserPrompt("synthesis", { query: "q", keywords: [], upstream });
      expect(prompt).toContain("[truncated");
      // The second (small) agent must survive fully — the old whole-string
      // slice could have dropped it entirely.
      expect(prompt).toContain('"summary":"small"');
      expect(prompt).toContain("--- competitor-analyst ---");
    });

    it("omits the upstream section when there is none", () => {
      const prompt = buildUserPrompt("market-sizer", {
        query: "q",
        keywords: [],
      });
      expect(prompt).not.toContain("Upstream agent outputs");
    });
  });
});
