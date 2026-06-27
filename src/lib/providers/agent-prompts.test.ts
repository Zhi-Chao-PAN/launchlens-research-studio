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

    it("omits the upstream section when there is none", () => {
      const prompt = buildUserPrompt("market-sizer", {
        query: "q",
        keywords: [],
      });
      expect(prompt).not.toContain("Upstream agent outputs");
    });
  });
});
