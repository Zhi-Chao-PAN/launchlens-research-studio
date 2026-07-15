// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createDeepResearchService: vi.fn(),
  getRedis: vi.fn(),
  pruneStaleSessions: vi.fn(() => 0),
  signal: vi.fn(),
  tickSchedules: vi.fn(async () => 3),
}));

vi.mock("@/lib/research/redis-client", () => ({
  getRedis: mocks.getRedis,
}));

vi.mock("@/lib/research/scheduler", () => ({
  tickSchedules: mocks.tickSchedules,
}));

vi.mock("@/lib/research/research-engine", () => ({
  pruneStaleSessions: mocks.pruneStaleSessions,
}));

vi.mock("@/lib/research/deep-research/runtime", () => ({
  createDeepResearchService: mocks.createDeepResearchService,
}));

import {
  DEFAULT_LOCK_TTL_SECONDS,
  HEARTBEAT_KEY,
  HEARTBEAT_LOCK_KEY,
  HEARTBEAT_META_KEY,
  RECOVERY_HISTORY_KEY,
} from "@/lib/research/deep-research/recovery-heartbeat";
import { GET, POST, checkStructuralRecoveryReadiness } from "./route";

interface FakeRedisValue {
  expiresAt?: number;
  value: unknown;
}

/**
 * Minimal Redis test double for the recovery primitives used by this route.
 * Expiry is evaluated against the fake Vitest clock, so lock recovery is
 * exercised by elapsed TTL rather than by deleting the key in the test.
 */
class FakeRedis {
  private readonly values = new Map<string, FakeRedisValue>();

  failNextEval = false;

  private expireIfNeeded(key: string): void {
    const entry = this.values.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
    }
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, { value });
  }

  peek<T>(key: string): T | undefined {
    this.expireIfNeeded(key);
    return this.values.get(key)?.value as T | undefined;
  }

  async set(
    key: string,
    value: unknown,
    options: { ex?: number; nx?: boolean } = {},
  ): Promise<"OK" | null> {
    this.expireIfNeeded(key);
    if (options.nx && this.values.has(key)) return null;
    this.values.set(key, {
      value,
      ...(options.ex === undefined
        ? {}
        : { expiresAt: Date.now() + options.ex * 1_000 }),
    });
    return "OK";
  }

  async get<T>(key: string): Promise<T | null> {
    return this.peek<T>(key) ?? null;
  }

  async hset(key: string, fields: Record<string, string>): Promise<number> {
    this.expireIfNeeded(key);
    const current = this.peek<Record<string, string>>(key) ?? {};
    this.values.set(key, { value: { ...current, ...fields } });
    return Object.keys(fields).length;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    this.expireIfNeeded(key);
    const current = this.values.get(key);
    if (!current) return 0;
    current.expiresAt = Date.now() + ttlSeconds * 1_000;
    return 1;
  }

  async lpush(key: string, value: string): Promise<number> {
    this.expireIfNeeded(key);
    const current = this.peek<string[]>(key) ?? [];
    const next = [value, ...current];
    this.values.set(key, { value: next });
    return next.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    this.expireIfNeeded(key);
    const current = this.peek<string[]>(key) ?? [];
    this.values.set(key, { value: current.slice(start, stop + 1) });
    return "OK";
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<number> {
    if (this.failNextEval) {
      this.failNextEval = false;
      throw new Error("simulated Redis release failure");
    }
    const key = keys[0];
    if (!key) return 0;
    this.expireIfNeeded(key);
    if (this.peek<string>(key) !== args[0]) return 0;
    this.values.delete(key);
    return 1;
  }
}

const VALID_SECRET = "correct-cron-secret-at-least-24-characters";
const FIXED_NOW = new Date("2026-07-15T08:00:00.000Z");
const DEEP_READY_ENV = {
  LAUNCHLENS_DEEP_ENABLED: "1",
  CRON_SECRET: VALID_SECRET,
  LAUNCHLENS_DEEP_WORKER_SECRET: "worker-secret-at-least-24-characters",
  LAUNCHLENS_DEEP_WORKER_BASE_URL: "https://studio.example",
  OPENAI_API_KEY: "model-key",
  LAUNCHLENS_PROVIDER: "openai",
  LAUNCHLENS_REVIEW_PROVIDER: "openai",
  LAUNCHLENS_REVIEW_OPENAI_KEY: "review-key",
  TAVILY_API_KEY: "search-key",
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
} as const;

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "LAUNCHLENS_CRON_SECRET",
  "LAUNCHLENS_DEEP_ENABLED",
  "LAUNCHLENS_DEEP_WORKER_BASE_URL",
  "LAUNCHLENS_DEEP_WORKER_SECRET",
  "LAUNCHLENS_OPENAI_KEY",
  "LAUNCHLENS_PROVIDER",
  "LAUNCHLENS_PROVIDER_KEYRING_ENABLED",
  "LAUNCHLENS_PROVIDER_KEYRING_PROVIDER",
  "LAUNCHLENS_REVIEW_ANTHROPIC_KEY",
  "LAUNCHLENS_REVIEW_OPENAI_KEY",
  "LAUNCHLENS_REVIEW_PROVIDER",
  "LAUNCHLENS_SEARCH_PROVIDER",
  "OPENAI_API_KEY",
  "TAVILY_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

let redis: FakeRedis;

function clearManagedEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function restoreManagedEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function configureDeepReadyEnv(): void {
  clearManagedEnv();
  Object.assign(process.env, DEEP_READY_ENV);
}

function setLegacySecret(value: string | undefined): void {
  if (value === undefined) delete process.env.LAUNCHLENS_CRON_SECRET;
  else process.env.LAUNCHLENS_CRON_SECRET = value;
}

function setVercelSecret(value: string | undefined): void {
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
}

function makeRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request(`http://localhost${path}`, { method: "POST", headers }),
  );
}

function makeDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.clearAllMocks();
  clearManagedEnv();
  redis = new FakeRedis();
  mocks.getRedis.mockReturnValue(redis);
  mocks.tickSchedules.mockResolvedValue(3);
  mocks.pruneStaleSessions.mockReturnValue(0);
  mocks.signal.mockResolvedValue({ dispatched: 2, failed: 0 });
  mocks.createDeepResearchService.mockReturnValue({ signal: mocks.signal });
});

afterEach(() => {
  vi.useRealTimers();
  restoreManagedEnv();
});

describe("/api/cron/scheduler authentication", () => {
  it("returns 503 when CRON_SECRET and its legacy alias are unset", async () => {
    const res = await POST(
      makeRequest("/api/cron/scheduler", { "x-cron-secret": "anything" }),
    );
    expect(res.status).toBe(503);
  });

  it("returns 401 when secret header is missing", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(makeRequest("/api/cron/scheduler"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret header is wrong", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(
      makeRequest("/api/cron/scheduler", { "x-cron-secret": "wrong" }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts the correct x-cron-secret header and returns the trigger count", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(
      makeRequest("/api/cron/scheduler", { "x-cron-secret": VALID_SECRET }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      triggered: 3,
      timestamp: FIXED_NOW.toISOString(),
    });
  });

  it("accepts Authorization: Bearer and prioritizes CRON_SECRET", async () => {
    setVercelSecret(VALID_SECRET);
    setLegacySecret("ignored-legacy-secret-at-least-24-characters");
    const res = await POST(
      makeRequest("/api/cron/scheduler", {
        authorization: `Bearer ${VALID_SECRET}`,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("allows GET as an authenticated alias for POST", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await GET(
      makeRequest("/api/cron/scheduler", { "x-cron-secret": VALID_SECRET }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("rejects a length-mismatched secret", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(
      makeRequest("/api/cron/scheduler", { "x-cron-secret": "correct-secre" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when the configured cron secret is too short", async () => {
    setVercelSecret("short");
    const res = await POST(
      makeRequest("/api/cron/scheduler", { authorization: "Bearer short" }),
    );
    expect(res.status).toBe(503);
  });
});

describe("/api/cron/scheduler recovery execution", () => {
  it("[simulated unit] runs the recover signal on the first-ever tick and writes a success heartbeat", async () => {
    configureDeepReadyEnv();

    const res = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "first-tick",
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.signal).toHaveBeenCalledWith({ kind: "recover", limit: 25 });
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
    expect(redis.peek<Record<string, string>>(HEARTBEAT_META_KEY)).toMatchObject({
      requestId: "first-tick",
      lastOkAt: FIXED_NOW.toISOString(),
      lastDispatched: "2",
      lastFailed: "0",
    });
    const history = redis.peek<string[]>(RECOVERY_HISTORY_KEY) ?? [];
    expect(history).toHaveLength(1);
    expect(JSON.parse(history[0] ?? "{}")).toMatchObject({
      ok: true,
      requestId: "first-tick",
      dispatched: 2,
      failed: 0,
    });
  });

  it("[simulated unit] runs recovery when the managed keyring is the only model credential source", async () => {
    configureDeepReadyEnv();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LAUNCHLENS_REVIEW_OPENAI_KEY;
    delete process.env.LAUNCHLENS_REVIEW_ANTHROPIC_KEY;
    process.env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED = "1";
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "openai";

    const res = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "keyring-only-tick",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      deepRecovery: { kind: "recovered" },
    });
    expect(mocks.signal).toHaveBeenCalledWith({ kind: "recover", limit: 25 });
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
  });

  it("[simulated unit] ignores a stale heartbeat as an execution gate and refreshes it after recovery", async () => {
    configureDeepReadyEnv();
    redis.seed(HEARTBEAT_KEY, "2026-07-14T00:00:00.000Z");

    const res = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "stale-heartbeat-tick",
      }),
    );

    expect(res.status).toBe(200);
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    expect(mocks.signal).toHaveBeenCalledWith({ kind: "recover", limit: 25 });
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
  });

  it("[simulated unit] records a failed heartbeat when the recover signal throws", async () => {
    configureDeepReadyEnv();
    const failure = new Error("provider unavailable");
    failure.name = "ProviderUnavailableError";
    mocks.signal.mockRejectedValueOnce(failure);

    const res = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "failed-tick",
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "provider unavailable",
    });
    expect(redis.peek(HEARTBEAT_KEY)).toBeUndefined();
    expect(redis.peek<Record<string, string>>(HEARTBEAT_META_KEY)).toMatchObject({
      requestId: "failed-tick",
      lastErrorAt: FIXED_NOW.toISOString(),
      lastErrorCode: "ProviderUnavailableError",
    });
    const history = redis.peek<string[]>(RECOVERY_HISTORY_KEY) ?? [];
    expect(JSON.parse(history[0] ?? "{}")).toMatchObject({
      ok: false,
      requestId: "failed-tick",
      errorCode: "ProviderUnavailableError",
    });
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBeUndefined();
  });

  it("[simulated unit] deduplicates a concurrent tick while the Redis lock is held", async () => {
    configureDeepReadyEnv();
    const entered = makeDeferred<void>();
    const releaseSignal = makeDeferred<{ dispatched: number; failed: number }>();
    mocks.signal.mockImplementationOnce(async () => {
      entered.resolve();
      return releaseSignal.promise;
    });

    const firstResponsePromise = POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "tick-owner",
      }),
    );
    await entered.promise;

    const duplicate = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "tick-duplicate",
      }),
    );

    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      ok: true,
      deduped: true,
      heldBy: "tick-owner",
    });
    expect(mocks.signal).toHaveBeenCalledTimes(1);

    releaseSignal.resolve({ dispatched: 1, failed: 0 });
    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(200);
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBeUndefined();
  });

  it("[simulated unit] retries recovery after the abandoned lock expires by TTL", async () => {
    configureDeepReadyEnv();
    // Simulate the holder disappearing after doing its work but before its
    // compare-and-delete reaches Redis. The production safety net is the
    // lock TTL, which this fake Redis expires from elapsed clock time.
    redis.failNextEval = true;

    const first = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "abandoned-owner",
      }),
    );
    expect(first.status).toBe(200);
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBe("abandoned-owner");

    const beforeExpiry = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "before-expiry",
      }),
    );
    await expect(beforeExpiry.json()).resolves.toMatchObject({
      deduped: true,
      heldBy: "abandoned-owner",
    });
    expect(mocks.signal).toHaveBeenCalledTimes(1);

    vi.setSystemTime(
      new Date(FIXED_NOW.getTime() + DEFAULT_LOCK_TTL_SECONDS * 1_000 + 1),
    );
    const afterExpiry = await POST(
      makeRequest("/api/cron/scheduler", {
        "x-cron-secret": VALID_SECRET,
        "x-request-id": "after-expiry",
      }),
    );

    expect(afterExpiry.status).toBe(200);
    await expect(afterExpiry.json()).resolves.toMatchObject({
      ok: true,
      deepRecovery: { kind: "recovered" },
    });
    expect(mocks.signal).toHaveBeenCalledTimes(2);
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBeUndefined();
  });
});

describe("checkStructuralRecoveryReadiness", () => {
  const FULL_ENV = {
    ...DEEP_READY_ENV,
    LAUNCHLENS_CRON_SECRET: "",
  };

  it("reports ready when every structural prerequisite is present", () => {
    expect(checkStructuralRecoveryReadiness(FULL_ENV)).toEqual({
      ready: true,
      missing: [],
    });
  });

  it("accepts the managed keyring as the provider and reviewer credential source", () => {
    expect(
      checkStructuralRecoveryReadiness({
        ...FULL_ENV,
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        LAUNCHLENS_REVIEW_OPENAI_KEY: "",
        LAUNCHLENS_REVIEW_ANTHROPIC_KEY: "",
        LAUNCHLENS_PROVIDER: "openai",
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("normalizes managed provider configuration for structural readiness", () => {
    expect(
      checkStructuralRecoveryReadiness({
        ...FULL_ENV,
        OPENAI_API_KEY: "",
        LAUNCHLENS_REVIEW_OPENAI_KEY: "",
        LAUNCHLENS_PROVIDER: "",
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: " 1 ",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: " OpEnAi ",
        LAUNCHLENS_REVIEW_PROVIDER: " openai ",
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("lets the dedicated keyring provider override the legacy generation setting", () => {
    expect(
      checkStructuralRecoveryReadiness({
        ...FULL_ENV,
        OPENAI_API_KEY: "",
        LAUNCHLENS_REVIEW_OPENAI_KEY: "",
        LAUNCHLENS_PROVIDER: "anthropic",
        LAUNCHLENS_REVIEW_PROVIDER: "",
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("rejects a keyring without a supported provider", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      OPENAI_API_KEY: "legacy-key-must-not-bypass-keyring",
      ANTHROPIC_API_KEY: "",
      LAUNCHLENS_REVIEW_OPENAI_KEY: "legacy-review-key-must-not-bypass-keyring",
      LAUNCHLENS_REVIEW_ANTHROPIC_KEY: "",
      LAUNCHLENS_PROVIDER: "",
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "unsupported",
    });

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("provider-key");
    expect(result.missing).toContain("reviewer-key");
  });

  it("rejects a reviewer override that conflicts with the managed provider", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      LAUNCHLENS_PROVIDER: "openai",
      LAUNCHLENS_REVIEW_PROVIDER: "anthropic",
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
    });

    expect(result.ready).toBe(false);
    expect(result.missing).not.toContain("provider-key");
    expect(result.missing).toContain("reviewer-key");
  });

  it("refuses to run when deep is not enabled", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_DEEP_ENABLED: "0",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("deep-not-enabled");
  });

  it("refuses to run when the cron secret is too short", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      CRON_SECRET: "short",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("cron-secret");
  });

  it("refuses to run when worker and cron secrets are equal", () => {
    const same = "shared-secret-at-least-24-chars";
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      CRON_SECRET: same,
      LAUNCHLENS_DEEP_WORKER_SECRET: same,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("secrets-equal");
  });

  it("refuses to run when the worker origin is missing", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_DEEP_WORKER_BASE_URL: "",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("worker-origin");
  });

  it("refuses to run when retrieval is missing", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      TAVILY_API_KEY: "",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("retrieval-key");
  });

  it("refuses to run when retrieval is forced to mock", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_SEARCH_PROVIDER: "mock",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("retrieval-forced-mock");
  });

  it("refuses to run when reviewer and shared provider keys are missing", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_REVIEW_OPENAI_KEY: "",
      LAUNCHLENS_REVIEW_ANTHROPIC_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("reviewer-key");
  });

  it("refuses to run when Redis authority is not configured", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain("redis");
  });

  it("uses KV_REST_API_* as the Redis authority fallback", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kv-token",
    });
    expect(result.ready).toBe(true);
  });

  it("ignores heartbeat freshness because this tick produces the heartbeat", () => {
    expect(checkStructuralRecoveryReadiness(FULL_ENV)).toEqual({
      ready: true,
      missing: [],
    });
  });
});
