// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchRun } from "./storage";

const ORIGINAL_ENV = { ...process.env };

function setRedisEnv() {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

function makeRun(id: string, createdAt: number, query = "AI market research"): ResearchRun {
  return {
    id,
    query,
    keywords: ["ai", "market"],
    result: JSON.stringify({ summary: id }),
    provider: "minimax",
    model: "MiniMax-M3",
    createdAt,
    durationMs: 1000,
    status: "completed",
    sources: [{ title: "Source", url: "https://example.com" }],
  };
}

describe("run-store — degraded without Redis", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("degrades to no-op/null when Redis is not configured", async () => {
    const { storePersistentResearchRun, getPersistentResearchRun, searchPersistentResearchRuns } =
      await import("./run-store");

    await expect(storePersistentResearchRun(makeRun("r1", 1))).resolves.toBeUndefined();
    await expect(getPersistentResearchRun("r1")).resolves.toBeNull();
    await expect(searchPersistentResearchRuns()).resolves.toEqual({ runs: [], total: 0 });
  });
});

describe("run-store — Redis configured", () => {
  const mockStore = new Map<string, string>();
  const mockExpiry = new Map<string, number>();

  beforeEach(() => {
    mockStore.clear();
    mockExpiry.clear();
    setRedisEnv();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: class MockRedis {
        async set(key: string, value: unknown, opts?: { ex?: number }) {
          mockStore.set(key, typeof value === "string" ? value : JSON.stringify(value));
          if (opts?.ex) mockExpiry.set(key, Date.now() + opts.ex * 1000);
          return "OK";
        }

        async get<T = unknown>(key: string): Promise<T | null> {
          const expiresAt = mockExpiry.get(key);
          if (expiresAt !== undefined && expiresAt <= Date.now()) {
            mockStore.delete(key);
            mockExpiry.delete(key);
          }
          const value = mockStore.get(key);
          if (value === undefined) return null;
          try {
            return JSON.parse(value) as T;
          } catch {
            return value as T;
          }
        }

        async del(key: string) {
          mockExpiry.delete(key);
          return mockStore.delete(key) ? 1 : 0;
        }
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@upstash/redis");
    process.env = { ...ORIGINAL_ENV };
  });

  it("stores a run and recovers it by id", async () => {
    const { storePersistentResearchRun, getPersistentResearchRun } = await import("./run-store");
    await storePersistentResearchRun(makeRun("r1", 1700000000000));

    await expect(getPersistentResearchRun("r1")).resolves.toMatchObject({
      id: "r1",
      query: "AI market research",
      status: "completed",
    });
  });

  it("lists newest Redis runs first and supports query filtering", async () => {
    const { storePersistentResearchRun, searchPersistentResearchRuns } = await import("./run-store");
    await storePersistentResearchRun(makeRun("old", 1000, "Old fintech research"));
    await storePersistentResearchRun(makeRun("new", 2000, "New AI research"));

    await expect(searchPersistentResearchRuns()).resolves.toMatchObject({
      total: 2,
      runs: [{ id: "new" }, { id: "old" }],
    });

    await expect(searchPersistentResearchRuns({ query: "fintech" })).resolves.toMatchObject({
      total: 1,
      runs: [{ id: "old" }],
    });
  });

  it("deletes run keys and removes ids from the index", async () => {
    const { storePersistentResearchRun, deletePersistentResearchRuns, searchPersistentResearchRuns } =
      await import("./run-store");
    await storePersistentResearchRun(makeRun("r1", 1000));
    await storePersistentResearchRun(makeRun("r2", 2000));

    await expect(deletePersistentResearchRuns(["r2"])).resolves.toBe(1);
    await expect(searchPersistentResearchRuns()).resolves.toMatchObject({
      total: 1,
      runs: [{ id: "r1" }],
    });
  });
});
