// Unit tests for redis-client.
//
// The Redis client is the safety net for cross-instance session state on
// Vercel serverless. These tests cover:
//   1. The env-missing fallback path (getRedis returns null). This is the
//      path tests and local dev use, and the path that proves the
//      in-memory engine behavior is preserved when Redis is not wired up.
//   2. The env-present path constructs a real @upstash/redis client.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture original env so each test can mutate freely without leaking.
const ORIGINAL_ENV = { ...process.env };

function clearRedisEnv(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

function setRedisEnv(): void {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

beforeEach(() => {
  clearRedisEnv();
  // Reset the module cache so env mutations take effect on next import.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("redis-client", () => {
  it("returns null when no env is set (degraded path)", async () => {
    clearRedisEnv();
    const { getRedis, isRedisConfigured } = await import("./redis-client");
    expect(getRedis()).toBeNull();
    expect(isRedisConfigured()).toBe(false);
  });

  it("returns null when only one of URL/token is set (degraded path)", async () => {
    clearRedisEnv();
    process.env.UPSTASH_REDIS_REST_URL = "https://only-url.upstash.io";
    const { getRedis } = await import("./redis-client");
    expect(getRedis()).toBeNull();
  });

  it("constructs a client when both URL and token are set", async () => {
    setRedisEnv();
    const { getRedis, isRedisConfigured } = await import("./redis-client");
    const client = getRedis();
    expect(client).not.toBeNull();
    expect(isRedisConfigured()).toBe(true);
  });

  it("accepts Vercel KV env variable names as a fallback", async () => {
    clearRedisEnv();
    process.env.KV_REST_API_URL = "https://kv.example.com";
    process.env.KV_REST_API_TOKEN = "kv-token";
    const { getRedis } = await import("./redis-client");
    expect(getRedis()).not.toBeNull();
  });

  it("caches the client across calls within a process", async () => {
    setRedisEnv();
    const { getRedis } = await import("./redis-client");
    const a = getRedis();
    const b = getRedis();
    expect(a).toBe(b); // reference equality proves caching
  });

  it("_resetRedisCacheForTests clears the cache", async () => {
    setRedisEnv();
    const { getRedis, _resetRedisCacheForTests } = await import("./redis-client");
    const a = getRedis();
    _resetRedisCacheForTests();
    clearRedisEnv();
    const b = getRedis();
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});
