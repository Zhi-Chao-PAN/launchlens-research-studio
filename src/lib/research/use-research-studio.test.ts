/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import {
  normalizeQuery, normalizeKeywords, computeStudioProgress, deriveStudioPhase,
  studioStateEqual, applyAgentProgress, applyAgentOutput, applyAgentError,
  studioStateFromCachedSession, mergeStudioSessionSnapshot,
  normalizeResumeSessionId, shouldScheduleStudioPoll, STUDIO_CONSTANTS,
} from "@/lib/research/use-research-studio";
import type { ResearchStudioState } from "@/lib/research/use-research-studio";
import type { CachedSession } from "@/lib/research/session-cache";

const baseAgent = () => ({ status: "idle", progress: 0, currentStep: "Waiting to start...", hasOutput: false });
const state = (overrides: any = {}): ResearchStudioState => ({
  sessionId: "s1", query: "AI", keywords: ["ai"], mode: "standard", status: "running",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:01:00.000Z",
  activeAgentTab: "market-sizer", error: null,
  agents: Object.fromEntries(STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [id, baseAgent()])) as any,
  agentOutputs: Object.fromEntries(STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [id, null])) as any,
  evidence: null, validation: null, deepRun: null,
  agentErrors: {}, rateLimitUntilMs: null, retryReadyPulse: 0, retryCount: 0,
  reconnectUntilMs: null, pollingIntervalMs: null, ...overrides,
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
    expect(deriveStudioPhase({ status: "cancelled", agents: state().agents })).toBe("cancelled");
    expect(deriveStudioPhase({ status: "cancelling", agents: state().agents })).toBe("cancelling");
    const running = state({
      agents: { ...state().agents, "market-sizer": { ...baseAgent(), status: "running", progress: 20 } },
    });
    expect(deriveStudioPhase(running)).toBe("running");
  });

  it("studioStateEqual detects equality and differences", () => {
    const a = state(), b = state();
    expect(studioStateEqual(a, b)).toBe(true);
    expect(studioStateEqual(a, { ...a, query: "B" })).toBe(false);
    expect(studioStateEqual(a, { ...a, mode: "deep" })).toBe(false);
    expect(studioStateEqual(a, { ...a, agents: { ...a.agents, synthesis: { ...a.agents.synthesis, progress: 50 } } })).toBe(false);
    expect(studioStateEqual(a, { ...a, agentErrors: { "market-sizer": "x" } })).toBe(false);
  });

  it("keeps a complete SSE snapshot monotonic against a delayed pre-synthesis GET", () => {
    const finalEvidence = { version: 1, agents: { synthesis: { grounding: "grounded" } } } as any;
    const finalValidation = {
      version: 1,
      generatedAt: "2026-01-01T00:02:00.000Z",
      stage: "final",
    } as any;
    const final = mergeStudioSessionSnapshot(
      state(),
      "s1",
      {
        status: "completed",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
        agents: {
          synthesis: {
            status: "done",
            progress: 100,
            hasOutput: true,
            output: { agent: "synthesis", summary: "final" } as any,
          },
        },
        evidence: finalEvidence,
        validation: finalValidation,
      },
    );

    const stale = mergeStudioSessionSnapshot(final, "s1", {
      status: "running",
      updatedAt: "2026-01-01T00:01:30.000Z",
      evidence: { version: 1, agents: {} },
      validation: {
        version: 1,
        generatedAt: "2026-01-01T00:01:30.000Z",
        stage: "pre_synthesis",
      } as any,
    });

    expect(final.status).toBe("completed");
    expect(final.agentOutputs.synthesis).toMatchObject({ summary: "final" });
    expect(stale).toBe(final);
    expect(stale.evidence).toBe(finalEvidence);
    expect(stale.validation).toBe(finalValidation);
    expect(stale.updatedAt).toBe("2026-01-01T00:02:00.000Z");

    const staleTerminal = mergeStudioSessionSnapshot(final, "s1", {
      status: "completed",
      updatedAt: "2026-01-01T00:01:45.000Z",
      evidence: { version: 1, agents: {} },
      validation: {
        version: 1,
        generatedAt: "2026-01-01T00:01:45.000Z",
        stage: "pre_synthesis",
      } as any,
    });
    expect(staleTerminal).toBe(final);
    expect(staleTerminal.evidence).toBe(finalEvidence);
  });

  it("stops polling immediately after a terminal fetch", () => {
    expect(shouldScheduleStudioPoll(true, true)).toBe(false);
    expect(shouldScheduleStudioPoll(false, false)).toBe(false);
    expect(shouldScheduleStudioPoll(false, true)).toBe(true);
  });

  it("accepts only opaque public session ids for durable resume links", () => {
    expect(normalizeResumeSessionId(" deep123 ")).toBe("deep123");
    expect(normalizeResumeSessionId("../deep123")).toBeNull();
    expect(normalizeResumeSessionId("deep-123")).toBeNull();
    expect(normalizeResumeSessionId(null)).toBeNull();
  });

  it("merges durable Deep work progress from GET and SSE observer snapshots", () => {
    const deepRun = {
      revision: 8,
      lifecycle: "active" as const,
      currentWorkIndex: 3,
      totalWork: 10,
      currentWork: {
        id: "specialist:competitor-analyst",
        kind: "specialist" as const,
        agentId: "competitor-analyst" as const,
        status: "running" as const,
        attempts: 1,
        maxAttempts: 3,
      },
      nextWakeAt: 2_000,
      totalAttempts: 4,
    };

    const merged = mergeStudioSessionSnapshot(
      state({ mode: "deep" }),
      "s1",
      { status: "running", mode: "deep", deepRun },
    );

    expect(merged.deepRun).toBe(deepRun);
    expect(merged.deepRun).toMatchObject({ currentWorkIndex: 3, totalWork: 10 });
  });

  it("keeps cancelled as a sticky terminal state while enriching partial evidence", () => {
    const partialOutput = { agent: "market-sizer", summary: "partial" } as any;
    const cancelled = mergeStudioSessionSnapshot(state(), "s1", {
      status: "cancelled",
      updatedAt: "2026-01-01T00:02:00.000Z",
      agents: {
        "market-sizer": {
          status: "done",
          progress: 100,
          hasOutput: true,
          output: partialOutput,
        },
      },
      evidence: { version: 1, agents: {} },
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.agentOutputs["market-sizer"]).toBe(partialOutput);
    expect(cancelled.agentErrors).toEqual({});

    const delayedRunning = mergeStudioSessionSnapshot(cancelled, "s1", {
      status: "running",
      updatedAt: "2026-01-01T00:03:00.000Z",
      agents: { "market-sizer": { status: "running", progress: 10 } },
    });
    const conflictingComplete = mergeStudioSessionSnapshot(cancelled, "s1", {
      status: "completed",
      updatedAt: "2026-01-01T00:03:00.000Z",
    });

    expect(delayedRunning).toBe(cancelled);
    expect(conflictingComplete).toBe(cancelled);
  });

  it("applyAgentProgress clamps 0-100 and ignores mismatched session", () => {
    const s = state();
    const s2 = applyAgentProgress(s, "other", { agentId: "market-sizer", progress: 999 });
    expect(s2).toBe(s);
    const s3 = applyAgentProgress(s, "s1", { agentId: "market-sizer", progress: 150, step: "go" });
    expect(s3.agents["market-sizer"].progress).toBe(100);
    expect(s3.agents["market-sizer"].currentStep).toBe("go");
    expect(s3.status).toBe("running");
    const terminal = state({ status: "cancelled" });
    expect(applyAgentProgress(terminal, "s1", {
      agentId: "market-sizer",
      progress: 10,
    })).toBe(terminal);
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

  it("hydrates a cached run without scheduling network state", () => {
    const cached: CachedSession = {
      id: "cached-1",
      query: "AI research copilot",
      keywords: ["ai", "research"],
      mode: "deep",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      savedAt: 1,
      completedAt: "2026-01-01T00:10:00.000Z",
      citationCount: 4,
      outputs: Object.fromEntries(
        STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [
          id,
          id === "market-sizer" ? { agent: "market-sizer", summary: "cached" } : null,
        ]),
      ) as CachedSession["outputs"],
      agentStatuses: Object.fromEntries(
        STUDIO_CONSTANTS.ALL_AGENT_IDS.map((id) => [
          id,
          {
            status: id === "market-sizer" ? "done" : "idle",
            progress: id === "market-sizer" ? 100 : 0,
            currentStep: id === "market-sizer" ? "Done" : "Waiting",
            hasOutput: id === "market-sizer",
          },
        ]),
      ) as CachedSession["agentStatuses"],
      evidence: { version: 1, agents: {} },
      validation: {
        version: 1,
        generatedAt: "2026-01-01T00:10:00.000Z",
        stage: "final",
      } as CachedSession["validation"],
    };

    const restored = studioStateFromCachedSession(cached);
    expect(restored).toMatchObject({
      sessionId: "cached-1",
      query: "AI research copilot",
      mode: "deep",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      status: "completed",
      activeAgentTab: "market-sizer",
      reconnectUntilMs: null,
      pollingIntervalMs: null,
    });
    expect(restored.agentOutputs["market-sizer"]).toMatchObject({ summary: "cached" });
    expect(restored.evidence).toEqual({ version: 1, agents: {} });
    expect(restored.validation?.stage).toBe("final");
    expect(restored.agents["market-sizer"]).toMatchObject({
      status: "done",
      progress: 100,
      hasOutput: true,
    });
  });

  it("restores legacy cached runs as Standard", () => {
    const cached = {
      id: "legacy",
      query: "Legacy run",
      keywords: [],
      status: "completed",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
      savedAt: 1,
      completedAt: "2025-01-01",
      citationCount: 0,
      outputs: {},
      agentStatuses: {},
    } as unknown as CachedSession;

    expect(studioStateFromCachedSession(cached).mode).toBe("standard");
  });

  it("restores cancelled and incomplete cache records without promoting them to completed", () => {
    const cached = {
      id: "cancelled-cache",
      query: "Cancelled run",
      keywords: [],
      status: "cancelled",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      savedAt: 1,
      completedAt: "2026-01-01T00:01:00.000Z",
      citationCount: 0,
      outputs: { "market-sizer": { agent: "market-sizer", summary: "partial" } },
      agentStatuses: {},
    } as unknown as CachedSession;

    const cancelled = studioStateFromCachedSession(cached);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.error).toBeNull();
    expect(cancelled.agentOutputs["market-sizer"]).toMatchObject({ summary: "partial" });

    const incomplete = studioStateFromCachedSession({
      ...cached,
      id: "running-cache",
      status: "running",
    } as CachedSession);
    expect(incomplete.status).toBe("error");
    expect(incomplete.error).toMatch(/incomplete/i);
  });
});
