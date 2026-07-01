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
  recordSessionAccess,
  getSessionWithLruTouch,
  getLeastRecentlyUsedSessions,
  getSessionAccessStats,
  recordCacheHit,
  recordCacheMiss,
  recordCacheEviction,
  resetCacheStats,
  getCacheStats,
  estimateSessionSize,
  estimateTotalCacheSize,
  getAverageSessionSize,
  getCachedSessionsBatch,
  deleteCachedSessionsBatch,
  deleteSessionsOlderThan,
  evictLru,
  evictOldest,
  getTopAccessedSessions,
  warmCache,
  summarizeCachedSessions,
  computeHitRate,
  isValidCachedSession,
  sanitizeCachedSessions,
  cachedSessionsToCsv,
  cachedSessionsEqual,
  searchCachedSessions,
} from "@/lib/research/session-cache";
import type { ResearchSession, AgentOutput } from "@/lib/schema/research-schema";

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



describe("session access tracking (round 131)", () => {
  beforeEach(() => {
    clearAllCachedSessions();
    // clear access records
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("launchlens:sessions-accessed");
      localStorage.removeItem("launchlens:sessions-stats");
    }
  });

  it("recordSessionAccess increments access count", () => {
    saveSessionSnapshot(makeSession("s1", "q1"));
    recordSessionAccess("s1");
    recordSessionAccess("s1");
    recordSessionAccess("s1");

    const stats = getSessionAccessStats("s1");
    expect(stats.accessCount).toBe(3);
    expect(stats.accessedAt).toBeTruthy();
  });

  it("getSessionAccessStats returns zeros for unknown session", () => {
    const stats = getSessionAccessStats("unknown");
    expect(stats.accessCount).toBe(0);
    expect(stats.accessedAt).toBeUndefined();
  });

  it("getSessionWithLruTouch records access and moves to front", () => {
    saveSessionSnapshot(makeSession("s1", "first"));
    saveSessionSnapshot(makeSession("s2", "second"));
    saveSessionSnapshot(makeSession("s3", "third"));

    // access s1 (oldest, at position 2)
    const s = getSessionWithLruTouch("s1");
    expect(s).toBeDefined();
    expect(s?.query).toBe("first");

    // s1 should now be at front
    const all = listCachedSessions();
    expect(all[0].id).toBe("s1");

    const stats = getSessionAccessStats("s1");
    expect(stats.accessCount).toBe(1);
  });

  it("getSessionWithLruTouch returns undefined for missing", () => {
    expect(getSessionWithLruTouch("missing")).toBeUndefined();
  });

  it("getLeastRecentlyUsedSessions sorts by last access", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    recordSessionAccess("s3");
    recordSessionAccess("s1");
    // s2 was never accessed -> should be LRU
    const lru = getLeastRecentlyUsedSessions();
    expect(lru[0].id).toBe("s2");
  });
});

describe("cache statistics (round 131)", () => {
  beforeEach(() => {
    clearAllCachedSessions();
    resetCacheStats();
  });

  it("starts with zero stats", () => {
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.totalSessions).toBe(0);
  });

  it("records hits and calculates hit rate", () => {
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();
    recordCacheHit();

    const stats = getCacheStats();
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(1);
    expect(stats.totalRequests).toBe(4);
    expect(stats.hitRate).toBe(75);
  });

  it("records evictions", () => {
    recordCacheEviction();
    recordCacheEviction();
    expect(getCacheStats().evictions).toBe(2);
  });

  it("resetCacheStats clears counters", () => {
    recordCacheHit();
    recordCacheMiss();
    recordCacheEviction();
    resetCacheStats();

    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.evictions).toBe(0);
  });
});

describe("size estimation (round 131)", () => {
  beforeEach(() => clearAllCachedSessions());

  it("estimateSessionSize returns JSON byte size", () => {
    saveSessionSnapshot(makeSession("s1", "hello"));
    const size = estimateSessionSize("s1");
    expect(size).toBeGreaterThan(0);
    expect(typeof size).toBe("number");
  });

  it("estimateSessionSize returns 0 for missing session", () => {
    expect(estimateSessionSize("missing")).toBe(0);
  });

  it("estimateTotalCacheSize aggregates all sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    const total = estimateTotalCacheSize();
    expect(total).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(estimateSessionSize("s1"));
  });

  it("getAverageSessionSize divides total by count", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    const avg = getAverageSessionSize();
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBe(Math.round(estimateTotalCacheSize() / 2));
  });

  it("returns 0 when cache empty", () => {
    expect(estimateTotalCacheSize()).toBe(0);
    expect(getAverageSessionSize()).toBe(0);
  });
});

describe("batch operations (round 131)", () => {
  beforeEach(() => clearAllCachedSessions());

  it("getCachedSessionsBatch returns matching sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    const batch = getCachedSessionsBatch(["s1", "s3", "missing"]);
    expect(batch).toHaveLength(2);
    expect(batch.map((s) => s.id)).toContain("s1");
    expect(batch.map((s) => s.id)).toContain("s3");
  });

  it("deleteCachedSessionsBatch removes multiple sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    const deleted = deleteCachedSessionsBatch(["s1", "s3"]);
    expect(deleted).toBe(2);
    expect(listCachedSessions()).toHaveLength(1);
    expect(listCachedSessions()[0].id).toBe("s2");
  });

  it("deleteCachedSessionsBatch returns 0 for empty input", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    expect(deleteCachedSessionsBatch([])).toBe(0);
    expect(listCachedSessions()).toHaveLength(1);
  });

  it("deleteSessionsOlderThan removes old sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));

    const cutoff = new Date("2030-01-01").getTime();
    const deleted = deleteSessionsOlderThan(cutoff);
    expect(deleted).toBe(2);
    expect(listCachedSessions()).toHaveLength(0);
  });
});

describe("eviction (round 131)", () => {
  beforeEach(() => {
    clearAllCachedSessions();
    resetCacheStats();
  });

  it("evictOldest removes oldest sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    const evicted = evictOldest(2);
    expect(evicted).toBe(1);
    expect(listCachedSessions().length).toBe(2);
    expect(getCacheStats().evictions).toBe(1);
  });

  it("evictLru removes least recently accessed", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    recordSessionAccess("s1");
    recordSessionAccess("s2");
    // s3 never accessed = LRU

    const evicted = evictLru(2);
    expect(evicted).toBe(1);
    const remaining = listCachedSessions();
    expect(remaining).toHaveLength(2);
    const remainingIds = remaining.map((s) => s.id);
    expect(remainingIds).toContain("s1");
    expect(remainingIds).toContain("s2");
    expect(remainingIds).not.toContain("s3");
  });

  it("eviction does nothing when already under target", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    expect(evictOldest(8)).toBe(0);
    expect(evictLru(8)).toBe(0);
    expect(listCachedSessions().length).toBe(1);
  });
});

describe("warmup / preload (round 131)", () => {
  beforeEach(() => {
    clearAllCachedSessions();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("launchlens:sessions-accessed");
    }
  });

  it("getTopAccessedSessions returns most-accessed sessions", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    recordSessionAccess("s1");
    recordSessionAccess("s1");
    recordSessionAccess("s1");
    recordSessionAccess("s2");

    const top = getTopAccessedSessions(2);
    expect(top).toHaveLength(2);
    expect(top[0].id).toBe("s1");
    expect(top[1].id).toBe("s2");
  });

  it("warmCache reorders top sessions to front", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    saveSessionSnapshot(makeSession("s2", "b"));
    saveSessionSnapshot(makeSession("s3", "c"));

    recordSessionAccess("s3");

    const warmed = warmCache(2);
    expect(warmed).toBe(1);

    const all = listCachedSessions();
    expect(all[0].id).toBe("s3"); // most accessed first
  });

  it("warmCache returns 0 when no access records", () => {
    saveSessionSnapshot(makeSession("s1", "a"));
    expect(warmCache()).toBe(0);
  });
});

describe("session-cache pure helpers (round 157)", () => {
  const base = (overrides: any = {}) => ({
    id: "s1", query: "AI tools", keywords: ["ai", "saas"],
    createdAt: "2024-06-01T00:00:00.000Z", updatedAt: "2024-06-01T00:05:00.000Z",
    completedAt: "2024-06-01T00:05:00.000Z", citationCount: 12,
    outputs: { "market-sizer": { agent: "market-sizer", insights: [] } as any, synthesis: null },
    agentStatuses: {
      "market-sizer": { status: "done", progress: 100, currentStep: "x", hasOutput: true },
      synthesis: { status: "done", progress: 100, currentStep: "x", hasOutput: false },
    },
    ...overrides,
  });

  it("summarizeCachedSessions aggregates totals and staleness", () => {
    const now = new Date("2024-06-02T00:00:00.000Z").getTime();
    const sum = summarizeCachedSessions([base(), base({ id: "s2", citationCount: 6, createdAt: "2024-05-01T00:00:00.000Z" })], now);
    expect(sum.totalSessions).toBe(2);
    expect(sum.totalOutputs).toBe(2);
    expect(sum.totalCitations).toBe(18);
    expect(sum.avgCitationCount).toBe(9);
    expect(sum.sessionsWithOutputs).toBe(2);
    expect(sum.isStale).toBe(false);
  });

  it("summarizeCachedSessions marks stale after threshold", () => {
    const now = new Date("2024-08-01T00:00:00.000Z").getTime();
    const sum = summarizeCachedSessions([base()], now);
    expect(sum.isStale).toBe(true);
  });

  it("computeHitRate yields rates", () => {
    const r = computeHitRate({ hits: 80, misses: 20, evictions: 5 });
    expect(r.totalRequests).toBe(100);
    expect(r.hitRate).toBe(80);
    expect(r.missRate).toBe(20);
    expect(r.evictionRate).toBe(5);
  });

  it("isValidCachedSession rejects bad shapes", () => {
    expect(isValidCachedSession(null)).toBe(false);
    expect(isValidCachedSession({})).toBe(false);
    expect(isValidCachedSession(base())).toBe(true);
    expect(isValidCachedSession({ ...base(), id: "" })).toBe(false);
    expect(isValidCachedSession({ ...base(), keywords: "x" })).toBe(false);
  });

  it("sanitizeCachedSessions filters and sorts by createdAt desc", () => {
    const bad: any = { id: "" };
    const old = base({ id: "a", createdAt: "2024-01-01T00:00:00.000Z" });
    const recent = base({ id: "b", createdAt: "2024-06-01T00:00:00.000Z" });
    const out = sanitizeCachedSessions([bad, old, recent]);
    expect(out.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("cachedSessionsToCsv includes header and query", () => {
    const csv = cachedSessionsToCsv([base()]);
    expect(csv.startsWith("id,query,keywords")).toBe(true);
    expect(csv).toContain("AI tools");
  });

  it("cachedSessionsEqual detects equality and differences", () => {
    const a = base();
    expect(cachedSessionsEqual(a, { ...a })).toBe(true);
    expect(cachedSessionsEqual(a, { ...a, citationCount: 3 })).toBe(false);
    expect(cachedSessionsEqual(a, { ...a, keywords: [...a.keywords, "x"] })).toBe(false);
    expect(cachedSessionsEqual(a, { ...a, agentStatuses: { ...a.agentStatuses, "market-sizer": { ...a.agentStatuses["market-sizer"], progress: 99 } } })).toBe(false);
  });

  it("searchCachedSessions matches query and keywords", () => {
    const sessions = [base(), base({ id: "s2", query: "Pricing tools", keywords: ["pricing"] })];
    expect(searchCachedSessions(sessions, "ai").map((s) => s.id)).toEqual(["s1"]);
    expect(searchCachedSessions(sessions, "Pricing").map((s) => s.id)).toEqual(["s2"]);
    expect(searchCachedSessions(sessions, "  ").map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});

describe("corrupted session-cache storage (round validation)", () => {
  beforeEach(() => clearAllCachedSessions());

  it("listCachedSessions drops malformed entries but keeps the valid ones", () => {
    const good = {
      id: "ok",
      query: "q",
      keywords: ["k"],
      status: "completed",
      createdAt: "2025",
      updatedAt: "2025",
      savedAt: 1,
      completedAt: "2025",
      outputs: {},
      agentStatuses: {},
      citationCount: 0,
    };
    const payload = [
      good,
      { id: "no-query", keywords: [], status: "completed", createdAt: "", updatedAt: "", savedAt: 1, completedAt: "", outputs: {}, agentStatuses: {}, citationCount: 0 },
      { id: "bad-keywords", query: "q", keywords: "not-an-array", status: "completed", createdAt: "", updatedAt: "", savedAt: 1, completedAt: "", outputs: {}, agentStatuses: {}, citationCount: 0 },
      { id: "bad-savedAt", query: "q", keywords: [], status: "completed", createdAt: "", updatedAt: "", savedAt: "now", completedAt: "", outputs: {}, agentStatuses: {}, citationCount: 0 },
      "string-not-object",
    ];
    localStorage.setItem("launchlens:sessions", JSON.stringify(payload));
    const all = listCachedSessions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("ok");
  });

  it("access-tracking storage also drops malformed entries", () => {
    localStorage.setItem("launchlens:sessions-accessed", JSON.stringify([
      { id: "ok", accessedAt: "2025", accessCount: 1 },
      { id: "bad-count", accessedAt: "2025", accessCount: "lots" },
      { id: "bad-time", accessedAt: 1, accessCount: 1 },
      { id: "", accessedAt: "2025", accessCount: 1 },
      "not-an-object",
    ]));
    // Touching the access store should silently drop the bad rows
    // and the surviving entry should still be reachable.
    recordSessionAccess("ok");
    const stats = getSessionAccessStats("ok");
    expect(stats.accessCount).toBe(2);
    const badStats = getSessionAccessStats("bad-count");
    expect(badStats.accessCount).toBe(0);
  });
});
