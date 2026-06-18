/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import {
  AGENT_METADATA,
  RESEARCH_AGENTS,
  isAgentId,
  isConfidenceLevel,
  isSourceCitation,
  compareAgentsByOrder,
  agentIdsByOrder,
  researchAgentIds,
  createEmptyAgentState,
  createEmptyAgentsRecord,
  summarizeSession,
  scoreLabel,
  clampProgress,
  type AgentId,
  type ConfidenceLevel,
} from "@/lib/schema/research-schema";

describe("research-schema constants", () => {
  it("exposes all six agent ids with metadata order 0..5", () => {
    const ids = Object.keys(AGENT_METADATA) as AgentId[];
    expect(ids).toHaveLength(6);
    expect(ids.map((i) => AGENT_METADATA[i].order).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("RESEARCH_AGENTS excludes synthesis and contains 5 ids", () => {
    expect(RESEARCH_AGENTS).toHaveLength(5);
    expect(RESEARCH_AGENTS).not.toContain("synthesis");
    expect(RESEARCH_AGENTS).toContain("market-sizer");
  });
});

describe("isAgentId", () => {
  it("accepts known ids", () => {
    expect(isAgentId("market-sizer")).toBe(true);
    expect(isAgentId("synthesis")).toBe(true);
    expect(isAgentId("channel-scout")).toBe(true);
  });
  it("rejects unknown strings and non-strings", () => {
    expect(isAgentId("bogus")).toBe(false);
    expect(isAgentId("")).toBe(false);
    expect(isAgentId(null)).toBe(false);
    expect(isAgentId(undefined)).toBe(false);
    expect(isAgentId(42)).toBe(false);
    expect(isAgentId({})).toBe(false);
  });
});

describe("isConfidenceLevel", () => {
  it("accepts the three levels", () => {
    (["low", "medium", "high"] as ConfidenceLevel[]).forEach((l) =>
      expect(isConfidenceLevel(l)).toBe(true)
    );
  });
  it("rejects invalid inputs", () => {
    expect(isConfidenceLevel("MEDIUM")).toBe(false);
    expect(isConfidenceLevel("very-high")).toBe(false);
    expect(isConfidenceLevel(null)).toBe(false);
  });
});

describe("compareAgentsByOrder / agentIdsByOrder / researchAgentIds", () => {
  it("agentIdsByOrder returns all six ids in ascending order", () => {
    const ordered = agentIdsByOrder();
    expect(ordered).toHaveLength(6);
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(AGENT_METADATA[ordered[i]].order).toBeLessThanOrEqual(
        AGENT_METADATA[ordered[i + 1]].order
      );
    }
    expect(ordered[ordered.length - 1]).toBe("synthesis");
  });

  it("researchAgentIds returns the 5 non-synthesis ids sorted", () => {
    const r = researchAgentIds();
    expect(r).toHaveLength(5);
    expect(r).not.toContain("synthesis");
    expect(new Set(r).size).toBe(5);
  });

  it("compareAgentsByOrder is antisymmetric and transitive for a sample", () => {
    expect(compareAgentsByOrder("market-sizer", "synthesis")).toBeLessThan(0);
    expect(compareAgentsByOrder("synthesis", "market-sizer")).toBeGreaterThan(0);
    expect(compareAgentsByOrder("market-sizer", "market-sizer")).toBe(0);
  });
});

describe("agent state factories", () => {
  it("createEmptyAgentState initializes idle/zero", () => {
    const st = createEmptyAgentState("pricing-scout");
    expect(st.id).toBe("pricing-scout");
    expect(st.status).toBe("idle");
    expect(st.progress).toBe(0);
    expect(st.currentStep).toBe("");
    expect(st.output).toBeUndefined();
    expect(st.error).toBeUndefined();
  });

  it("createEmptyAgentsRecord covers every AgentId", () => {
    const rec = createEmptyAgentsRecord();
    const ids = Object.keys(AGENT_METADATA) as AgentId[];
    for (const id of ids) {
      expect(rec[id]).toBeDefined();
      expect(rec[id].id).toBe(id);
      expect(rec[id].status).toBe("idle");
    }
    expect(Object.keys(rec)).toHaveLength(ids.length);
  });
});

describe("summarizeSession", () => {
  it("counts statuses and averages progress for a mixed session", () => {
    const agents = createEmptyAgentsRecord();
    agents["market-sizer"] = { ...agents["market-sizer"], status: "done", progress: 100 };
    agents["competitor-analyst"] = { ...agents["competitor-analyst"], status: "running", progress: 40 };
    agents["pain-detective"] = { ...agents["pain-detective"], status: "running", progress: 60 };
    agents["pricing-scout"] = { ...agents["pricing-scout"], status: "error", progress: 20 };
    // channel-scout and synthesis remain idle at 0
    const summary = summarizeSession({ agents, status: "running" });
    expect(summary.totalAgents).toBe(6);
    expect(summary.completed).toBe(1);
    expect(summary.running).toBe(2);
    expect(summary.errored).toBe(1);
    expect(summary.idle).toBe(2);
    expect(summary.progressPercent).toBe(37); // (100+40+60+20+0+0)/6 = 36.666 -> 37
    expect(summary.isFinished).toBe(false);
  });

  it("empty record yields zeros and not finished", () => {
    const summary = summarizeSession({ agents: {} as never, status: "pending" });
    expect(summary).toEqual({
      totalAgents: 0,
      completed: 0,
      running: 0,
      errored: 0,
      idle: 0,
      progressPercent: 0,
      isFinished: false,
    });
  });

  it("marks finished when session status is completed or error", () => {
    const agents = createEmptyAgentsRecord();
    expect(summarizeSession({ agents, status: "completed" }).isFinished).toBe(true);
    expect(summarizeSession({ agents, status: "error" }).isFinished).toBe(true);
    expect(summarizeSession({ agents, status: "running" }).isFinished).toBe(false);
  });

  it("clamps per-agent progress outside 0..100 when averaging", () => {
    const agents = {
      m: { id: "market-sizer" as AgentId, status: "running" as const, progress: 250, currentStep: "" },
    } as never;
    // 250 should clamp to 100 -> average 100/1
    expect(summarizeSession({ agents, status: "running" }).progressPercent).toBe(100);
  });
});

describe("scoreLabel", () => {
  it("buckets scores correctly", () => {
    expect(scoreLabel(-1)).toBe("poor");
    expect(scoreLabel(0)).toBe("poor");
    expect(scoreLabel(34)).toBe("poor");
    expect(scoreLabel(35)).toBe("fair");
    expect(scoreLabel(59)).toBe("fair");
    expect(scoreLabel(60)).toBe("good");
    expect(scoreLabel(79)).toBe("good");
    expect(scoreLabel(80)).toBe("strong");
    expect(scoreLabel(100)).toBe("strong");
    expect(scoreLabel(Infinity)).toBe("poor");
    expect(scoreLabel(NaN)).toBe("poor");
  });
});

describe("clampProgress", () => {
  it("rounds and clamps to integer 0..100", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(42.4)).toBe(42);
    expect(clampProgress(42.6)).toBe(43);
    expect(clampProgress(100)).toBe(100);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe("isSourceCitation", () => {
  const valid = {
    id: "c1",
    title: "t",
    snippet: "s",
    accessedAt: "2026-01-01",
    confidence: "high" as ConfidenceLevel,
    agent: "synthesis" as AgentId,
    url: "https://example.com",
  };
  it("accepts a well-formed citation", () => {
    expect(isSourceCitation(valid)).toBe(true);
  });
  it("rejects missing fields", () => {
    const { id, ...rest } = valid;
    void id;
    expect(isSourceCitation(rest)).toBe(false);
  });
  it("rejects bad confidence/agent", () => {
    expect(isSourceCitation({ ...valid, confidence: "super" })).toBe(false);
    expect(isSourceCitation({ ...valid, agent: "nope" })).toBe(false);
  });
  it("rejects non-objects", () => {
    expect(isSourceCitation(null)).toBe(false);
    expect(isSourceCitation(undefined)).toBe(false);
    expect(isSourceCitation("a string")).toBe(false);
    expect(isSourceCitation(42)).toBe(false);
  });
});
