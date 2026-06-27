/// <reference types="vitest/globals" />
﻿import { describe, it, expect } from "vitest";
import {
  normalizeQuery, normalizeKeywords, computeStudioProgress, deriveStudioPhase,
  studioStateEqual, applyAgentProgress, applyAgentOutput, applyAgentError,
  STUDIO_CONSTANTS,
} from "@/lib/research/use-research-studio";
import type { ResearchStudioState } from "@/lib/research/use-research-studio";

const baseAgent = () => ({ status: "idle", progress: 0, currentStep: "Waiting to start...", hasOutput: false });
const state = (overrides: any = {}): ResearchStudioState => ({
  sessionId: "s1", query: "AI", keywords: ["ai"], status: "running",
  activeAgentTab: "market-sizer", error: null,
  agents: Object.fromEntries(STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [id, baseAgent()])) as any,
  agentOutputs: Object.fromEntries(STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [id, null])) as any,
  agentErrors: {}, ...overrides,
});

describe("use-research-studio pure helpers (round 162)", () => {
  it("normalizeQuery trims, collapses whitespace, clamps", () => {
    expect(normalizeQuery("  hello   world  ")).toBe("hello world");
    expect(normalizeQuery("a".repeat(1000)).length).toBe(500);
    expect(normalizeQuery(null as any)).toBe("");
  });

  it("normalizeKeywords splits, dedupes case-insensitively, caps", () => {
    expect(normalizeKeywords("AI, ai, SaaS ;  ,  growth")).toEqual(["AI", "SaaS", "growth"]);
    expect(normalizeKeywords(["AI", "ai", "SaaS"])).toEqual(["AI", "SaaS"]);
    expect(normalizeKeywords(Array.from({ length: 20 }, (_, i) => "k" + i)).length).toBe(10);
    expect(normalizeKeywords(undefined)).toEqual([]);
  });

  it("computeStudioProgress averages and counts states", () => {
    const s = state({
      agents: {
        "market-sizer": { ...baseAgent(), status: "done", progress: 100 },
        "competitor-analyst": { ...baseAgent(), status: "running", progress: 50 },
        "pain-detective": { ...baseAgent(), status: "idle", progress: 0 },
        "pricing-scout": { ...baseAgent(), status: "idle", progress: 0 },
        "channel-scout": { ...baseAgent(), status: "idle", progress: 0 },
        synthesis: { ...baseAgent(), status: "idle", progress: 0 },
      },
    });
    const p = computeStudioProgress(s.agents, s.agentErrors);
    expect(p.totalAgents).toBe(6);
    expect(p.completedAgents).toBe(1);
    expect(p.runningAgents).toBe(1);
    expect(p.overallPercent).toBe(25); // (100+50)/6
  });

  it("computeStudioProgress counts errors", () => {
    const s = state({ agentErrors: { "market-sizer": "boom" } });
    expect(computeStudioProgress(s.agents, s.agentErrors).errorAgents).toBe(1);
  });

  it("deriveStudioPhase maps correctly", () => {
    expect(deriveStudioPhase({ status: "idle", agents: state().agents })).toBe("idle");
    expect(deriveStudioPhase({ status: "loading", agents: state().agents })).toBe("loading");
    expect(deriveStudioPhase({ status: "error", agents: state().agents })).toBe("error");
    expect(deriveStudioPhase({ status: "completed", agents: state().agents })).toBe("completed");
    const running = state({
      agents: { ...state().agents, "market-sizer": { ...baseAgent(), status: "running", progress: 20 } },
    });
    expect(deriveStudioPhase(running)).toBe("running");
  });

  it("studioStateEqual detects equality and differences", () => {
    const a = state(), b = state();
    expect(studioStateEqual(a, b)).toBe(true);
    expect(studioStateEqual(a, { ...a, query: "B" })).toBe(false);
    expect(studioStateEqual(a, { ...a, agents: { ...a.agents, synthesis: { ...a.agents.synthesis, progress: 50 } } })).toBe(false);
    expect(studioStateEqual(a, { ...a, agentErrors: { "market-sizer": "x" } })).toBe(false);
  });

  it("applyAgentProgress clamps 0-100 and ignores mismatched session", () => {
    const s = state();
    const s2 = applyAgentProgress(s, "other", { agentId: "market-sizer", progress: 999 });
    expect(s2).toBe(s);
    const s3 = applyAgentProgress(s, "s1", { agentId: "market-sizer", progress: 150, step: "go" });
    expect(s3.agents["market-sizer"].progress).toBe(100);
    expect(s3.agents["market-sizer"].currentStep).toBe("go");
    expect(s3.status).toBe("running");
  });

  it("applyAgentOutput marks done and stores output", () => {
    const s = state();
    const output: any = { agent: "market-sizer", insights: [] };
    const s2 = applyAgentOutput(s, "s1", { agentId: "market-sizer", output });
    expect(s2.agents["market-sizer"].status).toBe("done");
    expect(s2.agents["market-sizer"].hasOutput).toBe(true);
    expect(s2.agentOutputs["market-sizer"]).toBe(output);
  });

  it("applyAgentError sets default message", () => {
    const s = state();
    const s2 = applyAgentError(s, "s1", { agentId: "market-sizer" });
    expect(s2.agentErrors["market-sizer"]).toBe("Agent failed");
    const s3 = applyAgentError(s, "s1", { agentId: "competitor-analyst", message: "bad" });
    expect(s3.agentErrors["competitor-analyst"]).toBe("bad");
  });
});
