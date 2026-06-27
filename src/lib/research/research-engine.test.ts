/// <reference types="vitest/globals" />
import { describe, it, expect, vi } from "vitest";
import {
  createResearchSession,
  getResearchSession,
  listSessions,
  summarizeSession,
  agentStatesList,
  isSessionHealthy,
  sessionToPlainRow,
  sessionsToCsv,
  completedAgentIds,
  erroredAgentIds,
  estimateEtaMs,
  sessionsEqual,
  cancelSession,
  deleteSession,
  subscribeToSession,
} from "@/lib/research/research-engine";
import type { ResearchSession, AgentState } from "@/lib/schema/research-schema";

// Deterministic IDs & timestamps so tests aren't flaky.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
});
afterAll(() => { vi.useRealTimers(); });

const emptySession = (): ResearchSession => createResearchSession("test query", ["kw1", "kw2"]);

function setAgent(session: ResearchSession, id: string, status: AgentState["status"], progress = 0) {
  session.agents[id as keyof typeof session.agents] = { ...session.agents[id as keyof typeof session.agents], status, progress, currentStep: status };
}

describe("research-engine helpers (round 155)", () => {
  it("createResearchSession seeds six agents and a stable id", () => {
    const s = emptySession();
    expect(Object.keys(s.agents).sort()).toEqual([
      "channel-scout", "competitor-analyst", "market-sizer",
      "pain-detective", "pricing-scout", "synthesis",
    ]);
    expect(s.status).toBe("pending");
    expect(s.keywords).toEqual(["kw1", "kw2"]);
  });

  it("getResearchSession and listSessions reflect created sessions", () => {
    const a = emptySession();
    const b = emptySession();
    expect(getResearchSession(a.id)).toBe(a);
    expect(listSessions()).toContain(a.id);
    expect(listSessions()).toContain(b.id);
  });

  it("summarizeSession aggregates agents and progress", () => {
    const s = emptySession();
    setAgent(s, "market-sizer", "done", 100);
    setAgent(s, "competitor-analyst", "running", 40);
    setAgent(s, "pain-detective", "error", 20);
    s.citations.push({ id: "c1", title: "t", url: "u" } as any);
    s.status = "running";
    const sum = summarizeSession(s, new Date("2024-06-01T00:00:01.000Z").getTime());
    expect(sum.totalAgents).toBe(6);
    expect(sum.doneAgents).toBe(1);
    expect(sum.runningAgents).toBe(1);
    expect(sum.errorAgents).toBe(1);
    expect(sum.citationCount).toBe(1);
    expect(sum.keywordCount).toBe(2);
    expect(sum.durationMs).toBe(1000);
    expect(sum.hasSynthesis).toBe(false);
  });

  it("summarizeSession reports 100% for completed sessions", () => {
    const s = emptySession();
    s.status = "completed";
    Object.values(s.agents).forEach(a => { a.status = "done"; a.progress = 80; });
    expect(summarizeSession(s).overallProgress).toBe(100);
  });

  it("agentStatesList returns AGENT_METADATA order", () => {
    const s = emptySession();
    const ids = agentStatesList(s).map((a) => a.id);
    expect(ids).toEqual([
      "market-sizer", "competitor-analyst", "pain-detective",
      "pricing-scout", "channel-scout", "synthesis",
    ]);
  });

  it("isSessionHealthy false for sessions with <3 done agents after completed", () => {
    const pending = emptySession();
    expect(isSessionHealthy(pending)).toBe(true);
    const done = emptySession();
    done.status = "completed";
    setAgent(done, "market-sizer", "done", 100);
    setAgent(done, "competitor-analyst", "done", 100);
    expect(isSessionHealthy(done)).toBe(false);
    setAgent(done, "pain-detective", "done", 100);
    expect(isSessionHealthy(done)).toBe(true);
    const err = emptySession(); err.status = "error";
    expect(isSessionHealthy(err)).toBe(false);
  });

  it("sessionToPlainRow and sessionsToCsv produce flat export", () => {
    const s = emptySession();
    const row = sessionToPlainRow(s);
    expect(row.id).toBe(s.id);
    expect(row.keywords).toContain("kw1");
    const csv = sessionsToCsv([s]);
    const [header, line] = csv.split("\n");
    expect(header).toBe("id,status,query,keywords,agentsDone,agentsTotal,progress,citations,createdAt,updatedAt");
    expect(line.startsWith(s.id + ",")).toBe(true);
  });

  it("completedAgentIds and erroredAgentIds filter status", () => {
    const s = emptySession();
    setAgent(s, "market-sizer", "done");
    setAgent(s, "competitor-analyst", "error");
    s.agents["market-sizer"].output = { agentId: "market-sizer" } as any;
    expect(completedAgentIds(s)).toEqual(["market-sizer"]);
    expect(erroredAgentIds(s)).toEqual(["competitor-analyst"]);
  });

  it("estimateEtaMs returns null for zero progress and 0 when done", () => {
    const pending = emptySession();
    expect(estimateEtaMs(pending, new Date("2024-06-01T00:00:01.000Z").getTime())).toBeNull();
    const done = emptySession(); done.status = "completed";
    expect(estimateEtaMs(done)).toBe(0);
  });

  it("estimateEtaMs extrapolates from finished non-synthesis agents", () => {
    const s = emptySession();
    setAgent(s, "market-sizer", "done", 100);
    s.status = "running";
    // 1 of 5 research agents done after 5s => ~20s remaining + 2.5s synthesis => 22500
    const eta = estimateEtaMs(s, new Date("2024-06-01T00:00:05.000Z").getTime());
    expect(eta).toBeGreaterThan(15000);
    expect(eta).toBeLessThan(30000);
  });

  it("sessionsEqual detects equal vs different sessions", () => {
    const a = emptySession();
    const b = getResearchSession(a.id)!;
    expect(sessionsEqual(a, b)).toBe(true); // same ref trivially equal
    const c = emptySession();
    expect(sessionsEqual(a, c)).toBe(false); // different id
    // Different query on a structurally-different session
    const d = { ...a, query: "changed", keywords: [...a.keywords], agents: { ...a.agents }, citations: [...a.citations] };
    expect(sessionsEqual(a, d)).toBe(false);
  });
});


describe("cancelSession (round 190/191 + R48)", () => {
  it("returns false for non-existent session ids", () => {
    expect(cancelSession("does-not-exist-" + Math.random())).toBe(false);
  });

  it("returns false for already-finished sessions", () => {
    const session = createResearchSession("done", ["a"]);
    session.status = "completed";
    expect(cancelSession(session.id)).toBe(false);
  });

  it("flips a running session to cancelled synchronously and quiesces in-flight agents to idle", () => {
    const session = createResearchSession("widget", ["saas"]);
    session.status = "running";
    // Simulate agents mid-flight
    session.agents["market-sizer"].status = "running";
    session.agents["market-sizer"].progress = 45;
    session.agents["competitor-analyst"].status = "running";
    session.agents["competitor-analyst"].progress = 20;
    // One agent already finished before cancel — should keep its done state.
    session.agents["pricing-scout"].status = "done";
    session.agents["pricing-scout"].progress = 100;
    const ok = cancelSession(session.id);
    expect(ok).toBe(true);
    const fresh = getResearchSession(session.id);
    expect(fresh?.status).toBe("cancelled");
    // In-flight agents returned to idle; not marked error.
    expect(fresh?.agents["market-sizer"].status).toBe("idle");
    expect(fresh?.agents["market-sizer"].progress).toBe(0);
    expect(fresh?.agents["competitor-analyst"].status).toBe("idle");
    expect(fresh?.agents["pricing-scout"].status).toBe("done");
    expect(fresh?.agents["pricing-scout"].progress).toBe(100);
  });

  it("does not emit agent-error on cancel (so UI shows no red badges)", () => {
    const session = createResearchSession("widget", ["saas"]);
    session.status = "running";
    const events: Array<{ type: string; agentId?: string }> = [];
    const unsub = subscribeToSession(session.id, (ev) => {
      events.push({ type: ev.type, agentId: ev.agentId });
    });
    cancelSession(session.id);
    unsub();
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toEqual([]);
    // Must emit exactly one cancelled terminal event so SSE closes cleanly.
    const cancelled = events.filter((e) => e.type === "cancelled");
    expect(cancelled.length).toBe(1);
  });
});

describe("deleteSession (R47/R48)", () => {
  it("removes session from store and releases resources", () => {
    const s = createResearchSession("to-delete", ["x"]);
    expect(getResearchSession(s.id)).toBeDefined();
    expect(deleteSession(s.id)).toBe(true);
    expect(getResearchSession(s.id)).toBeUndefined();
    expect(listSessions()).not.toContain(s.id);
    expect(deleteSession(s.id)).toBe(false);
  });
});

describe("provider fallback visibility (round 205)", () => {
  // R205: when a real provider silently degrades to mock internally (the
  // common case — bad key, weak model, validation failure), the engine must
  // still mark the agent `degraded` so the UI shows a "demo data" badge.
  // Previously the provider's internal catch returned mock without the
  // engine ever knowing, so users saw demo data with no indication their
  // real provider never ran. These tests force the real-provider path and
  // assert the degraded flag + reason propagate to the agent state.
  const origEnv = { ...process.env };
  let origFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    // The file-level beforeAll installs fake timers for the helper tests;
    // runResearchSession uses real setTimeout-based sleep, so restore real
    // timers for this block only.
    vi.useRealTimers();
    origFetch = globalThis.fetch;
    // Force the OpenAI provider so selectProvider() returns a real adapter
    // (not the mock), then make fetch throw so it degrades via onFallback.
    process.env.LAUNCHLENS_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    process.env = { ...origEnv };
    if (origFetch !== undefined) globalThis.fetch = origFetch;
    // Re-arm fake timers for any subsequent describe blocks in this file.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
  });

  it("marks agents degraded with network_error when the real provider is unreachable", async () => {
    const { runResearchSession } = await import("@/lib/research/research-engine");
    const session = createResearchSession("AI code reviewer", ["devtools"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });

    const refreshed = getResearchSession(session.id)!;
    expect(refreshed.status).toBe("completed");
    // Every research agent should be done and flagged as degraded mock data.
    for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout"] as const) {
      const ag = refreshed.agents[id];
      expect(ag.status).toBe("done");
      expect(ag.degraded).toBe(true);
      expect(ag.degradedReason).toBe("network_error");
    }
  });
});
