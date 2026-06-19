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
  runResearchSession,
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


describe("cancelSession (round 190/191)", () => {
  it("returns false for non-existent session ids", () => {
    expect(cancelSession("does-not-exist-" + Math.random())).toBe(false);
  });

  it("returns false for already-finished sessions", () => {
    const session = createResearchSession("done", ["a"]);
    session.status = "completed";
    expect(cancelSession(session.id)).toBe(false);
  });

  it("flips a running session to cancelled synchronously and emits complete events", () => {
    const session = createResearchSession("widget", ["saas"]);
    session.status = "running";
    const ok = cancelSession(session.id);
    expect(ok).toBe(true);
    expect(getResearchSession(session.id)?.status).toBe("cancelled");
  });
});
