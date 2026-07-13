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
  awaitTerminalCheckpoint,
} from "@/lib/research/research-engine";
import { getResearchRun } from "@/lib/research/storage";
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
  it("createResearchSession seeds six agents and a cryptographic capability id", () => {
    const s = emptySession();
    const another = emptySession();
    expect(Object.keys(s.agents).sort()).toEqual([
      "channel-scout", "competitor-analyst", "market-sizer",
      "pain-detective", "pricing-scout", "synthesis",
    ]);
    expect(s.status).toBe("pending");
    expect(s.keywords).toEqual(["kw1", "kw2"]);
    expect(s.mode).toBe("standard");
    expect(s.id).toMatch(/^[0-9a-f]{32}$/);
    expect(another.id).not.toBe(s.id);
  });

  it("preserves an explicitly selected mode but will not execute preview-only Deep Research", async () => {
    const deep = createResearchSession("deep market audit", ["evidence"], undefined, {
      mode: "deep",
    });
    expect(deep.mode).toBe("deep");

    const { runResearchSession } = await import("@/lib/research/research-engine");
    await expect(runResearchSession(deep.id)).rejects.toThrow(/async/i);
    expect(deep.status).toBe("pending");
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

  it("does not emit agent-error on cancel (so UI shows no red badges)", async () => {
    const session = createResearchSession("widget", ["saas"]);
    session.status = "running";
    const events: Array<{ type: string; agentId?: string }> = [];
    const unsub = subscribeToSession(session.id, (ev) => {
      events.push({ type: ev.type, agentId: ev.agentId });
    });
    cancelSession(session.id);
    await awaitTerminalCheckpoint(session.id);
    unsub();
    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toEqual([]);
    // Must emit exactly one cancelled terminal event so SSE closes cleanly.
    const cancelled = events.filter((e) => e.type === "cancelled");
    expect(cancelled.length).toBe(1);
  });

  it("persists a 'cancelled' run so History can surface it (R212)", async () => {
    const session = createResearchSession("persist-cancel", ["kw"]);
    session.status = "running";
    session.agents["market-sizer"].status = "running";
    session.agents["market-sizer"].progress = 60;
    const ok = cancelSession(session.id);
    expect(ok).toBe(true);
    await awaitTerminalCheckpoint(session.id);
    const stored = getResearchRun(session.id);
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("cancelled");
    expect(stored?.query).toBe("persist-cancel");
  });

  it("does not let an observer unsubscribe cancel a pending remote-owned run", async () => {
    const session = createResearchSession("remote owner", ["observer"]);
    session.status = "running";
    const unsubscribe = subscribeToSession(session.id, () => {});

    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(getResearchSession(session.id)?.status).toBe("running");
    await expect(awaitTerminalCheckpoint(session.id)).resolves.toBeUndefined();
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

/**
 * R216: per-agent wall-clock timeout. When a real provider hangs, the
 * engine must abort the call within AGENT_TIMEOUT_MS and fall back to
 * mock data with degradedReason set, instead of sitting in "running"
 * forever. The default budget is 150s, so this test uses a tiny
 * override (LAUNCHLENS_AGENT_TIMEOUT_MS=200) to keep the suite fast.
 */
describe("per-agent wall-clock timeout (R216)", () => {
  let origEnv: NodeJS.ProcessEnv;
  let origFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    vi.useRealTimers();
    origEnv = { ...process.env };
    origFetch = globalThis.fetch;
    process.env.LAUNCHLENS_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LAUNCHLENS_AGENT_TIMEOUT_MS = "2000";
    // Real provider hangs forever — the timeout budget should rescue us.
    // The fetch never resolves on its own; when the engine's combined
    // signal aborts (timeout), the reject fires with an AbortError. This
    // routes through the provider's inner catch (which sees isAbort=true
    // and re-throws without reportFallback), then the outer catch, and
    // finally the engine's inner catch which marks the agent degraded.
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        sig?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      });
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    process.env = origEnv;
    if (origFetch !== undefined) globalThis.fetch = origFetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
  });

  it("aborts an unresponsive real provider within the budget and falls back to mock", async () => {
    const { runResearchSession, getAgentTimeoutMs } = await import("@/lib/research/research-engine");
    expect(getAgentTimeoutMs()).toBe(2000);
    const session = createResearchSession("timeout test", ["kw"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });

    const refreshed = getResearchSession(session.id)!;
    expect(refreshed.status).toBe("completed");
    // The agents that called the real provider should now be done
    // (degraded fallback) — none stuck in "running".
    for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout"] as const) {
      const ag = refreshed.agents[id];
      expect(ag.status).toBe("done");
      expect(ag.degraded).toBe(true);
    }
  });

  it("exposes the budget via getAgentTimeoutMs for ops/UI", async () => {
    const { getAgentTimeoutMs } = await import("@/lib/research/research-engine");
    // Module loaded with env AGENT_TIMEOUT_MS=2000 above.
    expect(getAgentTimeoutMs()).toBe(2000);
  });

  it("falls back to a safe default when env var is invalid", async () => {
    const { getAgentTimeoutMs } = await import("@/lib/research/research-engine");
    process.env.LAUNCHLENS_AGENT_TIMEOUT_MS = "not-a-number";
    expect(getAgentTimeoutMs()).toBe(180_000);
  });
});

/**
 * R217: in-memory session map eviction. The map holds AbortController
 * closures and listener Sets; without periodic pruning, a long-running
 * server leaks. The cron route + a future setInterval call
 * pruneStaleSessions() to keep the map bounded.
 */
describe("session map eviction (R217)", () => {
  it("evicts terminal sessions older than the retention budget", async () => {
    const { pruneStaleSessions, getSessionRetentionMs } = await import(
      "@/lib/research/research-engine"
    );
    // Use the default budget so the test isn't sensitive to env changes.
    const retention = getSessionRetentionMs();
    expect(retention).toBeGreaterThanOrEqual(60_000);

    // Create a terminal session, then back-date its updatedAt to "old".
    const { createResearchSession, getResearchSession } = await import(
      "@/lib/research/research-engine"
    );
    const s = createResearchSession("evict me", ["kw"]);
    s.status = "completed";
    s.updatedAt = new Date(Date.now() - retention - 60_000).toISOString();

    const evicted = pruneStaleSessions();
    expect(evicted).toBeGreaterThanOrEqual(1);
    expect(getResearchSession(s.id)).toBeUndefined();
  });

  it("keeps terminal sessions within the retention window", async () => {
    const { pruneStaleSessions, createResearchSession, getResearchSession } = await import(
      "@/lib/research/research-engine"
    );
    const s = createResearchSession("keep me", ["kw"]);
    s.status = "completed";
    s.updatedAt = new Date().toISOString();

    const evicted = pruneStaleSessions();
    expect(getResearchSession(s.id)).toBeDefined();
    // evicted is per-call; we don't assert == 0 because other tests in
    // the file may have left old terminal sessions in the map.
    expect(evicted).toBeGreaterThanOrEqual(0);
  });

  it("does not evict in-flight sessions", async () => {
    const { pruneStaleSessions, createResearchSession, getResearchSession } = await import(
      "@/lib/research/research-engine"
    );
    const s = createResearchSession("still running", ["kw"]);
    s.status = "running";
    s.updatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1d old
    pruneStaleSessions();
    // Running sessions are not eligible for pruning — we only reap
    // terminal ones.
    expect(getResearchSession(s.id)).toBeDefined();
  });

  it("exposes the retention budget via getSessionRetentionMs", async () => {
    const { getSessionRetentionMs } = await import("@/lib/research/research-engine");
    expect(getSessionRetentionMs()).toBeGreaterThanOrEqual(60_000);
  });
});
