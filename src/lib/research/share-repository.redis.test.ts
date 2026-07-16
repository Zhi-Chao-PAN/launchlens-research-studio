import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createShareManifest,
  type PublicShareReportV1,
} from "@/lib/research/share-manifest";

function publicReport(): PublicShareReportV1 {
  return {
    version: 1,
    query: "Redis snapshot",
    createdAt: 100,
    durationMs: 200,
    status: "completed",
    sections: {
      summary: "Stable summary",
      sources: [{ title: "Source", url: "https://example.com" }],
    },
  };
}

const redisState = vi.hoisted(() => ({ enabled: true }));
const redisPipeline = vi.hoisted(() => ({
  srem: vi.fn(),
  sadd: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exec: vi.fn(),
}));
const redis = vi.hoisted(() => ({
  set: vi.fn(),
  sadd: vi.fn(),
  eval: vi.fn(),
  sscan: vi.fn(),
  mget: vi.fn(),
  pipeline: vi.fn(() => redisPipeline),
}));
redisPipeline.srem.mockImplementation(() => redisPipeline);
redisPipeline.sadd.mockImplementation(() => redisPipeline);
redisPipeline.set.mockImplementation(() => redisPipeline);
redisPipeline.del.mockImplementation(() => redisPipeline);
redisPipeline.exec.mockResolvedValue([]);

vi.mock("@/lib/research/redis-client", () => ({
  getRedis: () => (redisState.enabled ? redis : null),
}));

import {
  RedisShareRepository,
  ShareRepositoryUnavailableError,
} from "@/lib/research/share-repository";

afterEach(() => {
  redisState.enabled = true;
  vi.clearAllMocks();
});

describe("RedisShareRepository", () => {
  it("persists only capability hashes and accepts Upstash-deserialized consume results", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    redis.eval.mockResolvedValueOnce(1);

    const created = await repository.create({
      runId: "run-redis",
      manifest: createShareManifest(["summary", "sources"]),
      report: {
        ...publicReport(),
        provider: "must-not-persist",
        model: "must-not-persist",
        result: "must-not-persist",
      } as PublicShareReportV1,
      expiresInMs: 60_000,
      maxViews: 2,
    });

    const [createScript, createKeys, createArgs] = redis.eval.mock.calls[0];
    const stored = JSON.parse(String(createArgs[1]));
    expect(stored).toMatchObject({
      version: 1,
      runId: "run-redis",
      views: 0,
      maxViews: 2,
      manifest: { sections: ["summary", "sources"] },
      report: publicReport(),
    });
    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect(JSON.stringify(stored)).not.toContain(created.manageToken);
    expect(JSON.stringify(stored)).not.toContain("must-not-persist");
    expect(createScript).toContain('redis.call("SADD", KEYS[2], ARGV[1])');
    expect(createScript.indexOf('redis.call("SADD", KEYS[2], ARGV[1])'))
      .toBeLessThan(createScript.indexOf('redis.call("SET", KEYS[1]'));
    expect(createKeys).toEqual([
      expect.stringMatching(/^rs:share:v1:[a-f0-9]{64}$/),
      "rs:share:index:v1",
      "rs:share:run:run-redis",
      expect.stringMatching(/^rs:share:runmeta:v1:[a-f0-9]{64}$/),
    ]);
    expect(createArgs[2]).toBe("run-redis");
    expect(createArgs[3]).toBe("60000");

    redis.eval.mockResolvedValueOnce({ ...stored, views: 1 });
    await expect(repository.consume(created.token)).resolves.toMatchObject({
      runId: "run-redis",
      views: 1,
      manifest: { sections: ["summary", "sources"] },
      report: publicReport(),
    });
  });

  it("accepts legacy stored records without a manifest as all-sections shares", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    redis.eval.mockResolvedValueOnce(JSON.stringify({
      version: 1,
      shareId: "a".repeat(64),
      runId: "legacy-run",
      manageTokenHash: "",
      createdAt: 1,
      expiresAt: null,
      views: 4,
      maxViews: null,
      revoked: false,
    }));

    await expect(repository.consume("legacy_token")).resolves.toMatchObject({
      runId: "legacy-run",
      views: 4,
      manifest: { sections: [
        "summary", "scores", "insights", "opportunities", "risks", "nextStep", "sources",
      ] },
    });
  });

  it("fails closed instead of returning an instance-local share when Redis is configured but unavailable", async () => {
    const repository = new RedisShareRepository();
    redisState.enabled = false;

    await expect(repository.consume("valid_token")).rejects.toBeInstanceOf(
      ShareRepositoryUnavailableError,
    );
  });

  it("adopts a legacy capability through one atomic Redis transition", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    redis.eval.mockImplementationOnce((_script, _keys, args) => {
      const stored = JSON.parse(String(args[2]));
      return { ...stored, views: stored.views + 1 };
    });

    await expect(repository.adoptLegacyAndConsume({
      token: "legacy_public_token",
      runId: "legacy-run",
      manifest: createShareManifest(["summary"]),
      report: publicReport(),
      createdAt: 100,
      expiresAt: null,
      views: 4,
      maxViews: 10,
    })).resolves.toMatchObject({
      runId: "legacy-run",
      views: 5,
      report: { sections: { summary: "Stable summary" } },
    });

    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toContain('redis.call("EXISTS", KEYS[3])');
    expect(script).toContain('redis.call("SET", KEYS[3], "1", "PX", claimTtl)');
    expect(script).toContain('redis.call("SADD", KEYS[2], ARGV[2])');
    expect(keys[1]).toBe("rs:share:index:v1");
    expect(keys[2]).toMatch(/^rs:share:terminal:v1:[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain("legacy_public_token");
    expect(JSON.parse(String(args[2]))).toMatchObject({
      manageTokenHash: "",
      views: 4,
      maxViews: 10,
      legacyAdopted: true,
    });
  });

  it("atomically tombstones an administrator-validated legacy capability", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    redis.eval.mockResolvedValueOnce(1);

    await expect(repository.revokeLegacy("legacy_public_token")).resolves.toBe(true);
    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toContain('redis.call("SET", KEYS[3], "1", "PX", ttl)');
    expect(script).toContain('redis.call("DEL", KEYS[1], KEYS[4])');
    expect(keys[2]).toMatch(/^rs:share:terminal:v1:[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain("legacy_public_token");
  });

  it("scans a run index in one MGET batch and pipelines stale terminal cleanup", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    const activeId = "a".repeat(64);
    const missingId = "b".repeat(64);
    const revokedId = "c".repeat(64);
    const maxedId = "d".repeat(64);
    const wrongRunId = "e".repeat(64);
    const stored = (shareId: string, overrides: Record<string, unknown> = {}) => ({
      version: 1,
      shareId,
      runId: "run-1",
      manageTokenHash: "",
      createdAt: 1,
      expiresAt: null,
      views: 1,
      maxViews: null,
      revoked: false,
      ...overrides,
    });
    redis.sscan.mockResolvedValueOnce([
      "0",
      [activeId, missingId, revokedId, maxedId, wrongRunId],
    ]);
    redis.mget.mockResolvedValueOnce([
      stored(activeId),
      null,
      stored(revokedId, { revoked: true }),
      stored(maxedId, { views: 2, maxViews: 2 }),
      stored(wrongRunId, { runId: "run-2" }),
    ]);

    await expect(repository.listForRun("run-1")).resolves.toEqual([
      expect.objectContaining({ shareId: activeId, runId: "run-1" }),
    ]);
    expect(redis.mget).toHaveBeenCalledTimes(1);
    expect(redisPipeline.srem).toHaveBeenCalledWith(
      "rs:share:run:run-1",
      missingId,
      revokedId,
      maxedId,
      wrongRunId,
    );
    expect(redisPipeline.srem).toHaveBeenCalledWith(
      "rs:share:index:v1",
      missingId,
      revokedId,
      maxedId,
    );
    expect(redisPipeline.del).toHaveBeenCalledWith(
      `rs:share:v1:${missingId}`,
      `rs:share:runmeta:v1:${missingId}`,
      `rs:share:v1:${revokedId}`,
      `rs:share:runmeta:v1:${revokedId}`,
      `rs:share:v1:${maxedId}`,
      `rs:share:runmeta:v1:${maxedId}`,
    );
    expect(redisPipeline.exec).toHaveBeenCalledTimes(1);
  });

  it("paginates global stats with SSCAN and one MGET per page", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    const ids = ["1".repeat(64), "2".repeat(64), "3".repeat(64)];
    const stored = (shareId: string, views: number) => ({
      version: 1,
      shareId,
      runId: "run-stats",
      manageTokenHash: "",
      createdAt: 1,
      expiresAt: null,
      views,
      maxViews: null,
      revoked: false,
    });
    redis.sscan
      .mockResolvedValueOnce(["7", ids.slice(0, 2)])
      .mockResolvedValueOnce(["0", ids.slice(2)]);
    redis.mget
      .mockResolvedValueOnce([stored(ids[0], 1), stored(ids[1], 2)])
      .mockResolvedValueOnce([stored(ids[2], 3)]);

    await expect(repository.stats()).resolves.toEqual({ total: 3, active: 3, totalViews: 6 });
    expect(redis.sscan).toHaveBeenCalledTimes(2);
    expect(redis.mget).toHaveBeenCalledTimes(2);
  });

  it("uses reverse run metadata to clean natural-TTL index tombstones", async () => {
    const repository = new RedisShareRepository(() => 10_000);
    const expiredId = "f".repeat(64);
    redis.sscan.mockResolvedValueOnce(["0", [expiredId]]);
    // Global scans fetch records followed by their reverse run metadata.
    redis.mget.mockResolvedValueOnce([null, "run-expired"]);

    await expect(repository.stats()).resolves.toEqual({ total: 0, active: 0, totalViews: 0 });
    expect(redisPipeline.srem).toHaveBeenCalledWith("rs:share:index:v1", expiredId);
    expect(redisPipeline.srem).toHaveBeenCalledWith("rs:share:run:run-expired", expiredId);
    expect(redisPipeline.del).toHaveBeenCalledWith(
      `rs:share:v1:${expiredId}`,
      `rs:share:runmeta:v1:${expiredId}`,
    );
  });
});
