import { describe, it, expect, beforeEach } from "vitest";

class MockStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  get length() { return this.data.size; }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
}

const storage = new MockStorage();
(globalThis as any).window = { localStorage: storage };
(globalThis as any).localStorage = storage;

import {
  saveSessionSnapshot,
  getCachedSession,
  listCachedSessions,
  deleteCachedSession,
  clearAllCachedSessions,
  type CachedSession,
} from "@/lib/research/session-cache";
import type { ResearchSession, AgentOutput, AgentId } from "@/lib/schema/research-schema";

function makeSession(id: string, query: string, withOutput = true): ResearchSession {
  const output: AgentOutput | null = withOutput
    ? {
        agent: "market-sizer",
        summary: "test",
        marketSize: { tam: 1e9, sam: 1e8, som: 1e6, currency: "USD", growthRate: 10, growthTrend: "stable", unit: "revenue", sources: [], confidence: "high" },
        keyTrends: [],
        targetSegments: [],
        citations: [
          { id: "c1", title: "T1", snippet: "s", accessedAt: "2026-01-01", confidence: "high", agent: "market-sizer" },
        ],
      }
    : null;

  return {
    id,
    query,
    keywords: ["ai"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:01:00Z",
    status: "completed",
    agents: {
      "market-sizer": { id: "market-sizer", status: "done", progress: 100, currentStep: "Done", output: output as AgentOutput },
      "competitor-analyst": { id: "competitor-analyst", status: "done", progress: 100, currentStep: "Done" },
      "pain-detective": { id: "pain-detective", status: "done", progress: 100, currentStep: "Done" },
      "pricing-scout": { id: "pricing-scout", status: "done", progress: 100, currentStep: "Done" },
      "channel-scout": { id: "channel-scout", status: "done", progress: 100, currentStep: "Done" },
      synthesis: { id: "synthesis", status: "done", progress: 100, currentStep: "Done" },
    },
    citations: output?.citations ?? [],
  } as ResearchSession;
}

describe("saveSessionSnapshot", () => {
  beforeEach(() => {
    clearAllCachedSessions();
  });

  it("saves a session snapshot", () => {
    saveSessionSnapshot(makeSession("s1", "test query"));
    const all = listCachedSessions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("s1");
    expect(all[0].query).toBe("test query");
  });

  it("captures outputs and statuses", () => {
    saveSessionSnapshot(makeSession("s1", "q"));
    const c = getCachedSession("s1")!;
    expect(c.outputs["market-sizer"]).not.toBe(null);
    expect(c.agentStatuses["market-sizer"].status).toBe("done");
    expect(c.agentStatuses["market-sizer"].hasOutput).toBe(true);
  });

  it("overwrites existing entry with same id", () => {
    saveSessionSnapshot(makeSession("s1", "first"));
    saveSessionSnapshot(makeSession("s1", "second"));
    const all = listCachedSessions();
    expect(all).toHaveLength(1);
    expect(all[0].query).toBe("second");
  });

  it("keeps most recent first", () => {
    saveSessionSnapshot(makeSession("s1", "first"));
    saveSessionSnapshot(makeSession("s2", "second"));
    const all = listCachedSessions();
    expect(all[0].id).toBe("s2");
    expect(all[1].id).toBe("s1");
  });
});

describe("getCachedSession", () => {
  beforeEach(() => clearAllCachedSessions());

  it("returns undefined for missing id", () => {
    expect(getCachedSession("missing")).toBe(undefined);
  });

  it("returns the session by id", () => {
    saveSessionSnapshot(makeSession("s1", "q"));
    const c = getCachedSession("s1");
    expect(c).toBeDefined();
    expect(c!.query).toBe("q");
  });
});

describe("deleteCachedSession", () => {
  beforeEach(() => clearAllCachedSessions());

  it("removes a specific session", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    deleteCachedSession("s1");
    const all = listCachedSessions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("s2");
  });
});

describe("clearAllCachedSessions", () => {
  it("removes all sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    clearAllCachedSessions();
    expect(listCachedSessions()).toHaveLength(0);
  });
});
