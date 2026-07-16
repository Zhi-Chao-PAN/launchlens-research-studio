// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createDeepResearchService: vi.fn(),
  getRedis: vi.fn(),
  pruneStaleSessions: vi.fn(() => 0),
  signal: vi.fn(),
  tickSchedules: vi.fn(async () => 3),
}));

vi.mock("@/lib/research/deep-research/qstash-recovery-auth", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/research/deep-research/qstash-recovery-auth")
  >();
  return {
    ...actual,
    authenticateQStashRecoveryRequest: mocks.authenticate,
  };
});

vi.mock("@/lib/research/redis-client", () => ({ getRedis: mocks.getRedis }));
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
import {
  QSTASH_RECOVERY_PRODUCTION_URL,
  QSTASH_RECOVERY_SCHEDULE_ID,
  QStashRecoveryAuthenticationError,
  QStashRecoveryConfigurationError,
  type VerifiedQStashRecoveryContext,
} from "@/lib/research/deep-research/qstash-recovery-auth";
import { GET, POST, checkStructuralRecoveryReadiness } from "./route";

interface FakeRedisValue {
  expiresAt?: number;
  value: unknown;
}

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
    const current = this.peek<Record<string, string>>(key) ?? {};
    this.values.set(key, { value: { ...current, ...fields } });
    return Object.keys(fields).length;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const current = this.values.get(key);
    if (!current) return 0;
    current.expiresAt = Date.now() + ttlSeconds * 1_000;
    return 1;
  }

  async lpush(key: string, value: string): Promise<number> {
    const current = this.peek<string[]>(key) ?? [];
    const next = [value, ...current];
    this.values.set(key, { value: next });
    return next.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    const current = this.peek<string[]>(key) ?? [];
    this.values.set(key, { value: current.slice(start, stop + 1) });
    return "OK";
  }

  async eval(_script: string, keys: string[], args: string[]): Promise<number> {
    if (this.failNextEval) {
      this.failNextEval = false;
      throw new Error("simulated Redis release failure");
    }
    const key = keys[0];
    if (!key || this.peek<string>(key) !== args[0]) return 0;
    this.values.delete(key);
    return 1;
  }
}

const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");
const DEEP_READY_ENV = {
  LAUNCHLENS_DEEP_ENABLED: "1",
  LAUNCHLENS_DEEP_RECOVERY_SOURCE: "qstash",
  LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY:
    "current-signing-key-at-least-24-characters",
  LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY:
    "next-signing-key-at-least-24-characters",
  LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID: QSTASH_RECOVERY_SCHEDULE_ID,
  LAUNCHLENS_QSTASH_RECOVERY_URL: QSTASH_RECOVERY_PRODUCTION_URL,
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
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "LAUNCHLENS_DEEP_ENABLED",
  "LAUNCHLENS_DEEP_RECOVERY_SOURCE",
  "LAUNCHLENS_DEEP_WORKER_BASE_URL",
  "LAUNCHLENS_DEEP_WORKER_SECRET",
  "LAUNCHLENS_OPENAI_KEY",
  "LAUNCHLENS_PROVIDER",
  "LAUNCHLENS_PROVIDER_KEYRING_ENABLED",
  "LAUNCHLENS_PROVIDER_KEYRING_PROVIDER",
  "LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY",
  "LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY",
  "LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID",
  "LAUNCHLENS_QSTASH_RECOVERY_URL",
  "LAUNCHLENS_REVIEW_ANTHROPIC_KEY",
  "LAUNCHLENS_REVIEW_OPENAI_KEY",
  "LAUNCHLENS_REVIEW_PROVIDER",
  "LAUNCHLENS_SEARCH_PROVIDER",
  "OPENAI_API_KEY",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "TAVILY_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
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

function delivery(messageId = "msg_default", retried = 0): VerifiedQStashRecoveryContext {
  return {
    source: "qstash",
    scheduleId: QSTASH_RECOVERY_SCHEDULE_ID,
    messageId,
    retried,
    recoveryUrl: QSTASH_RECOVERY_PRODUCTION_URL,
    rawBody: JSON.stringify({ version: 1, kind: "deep-recovery" }),
  };
}

function makeRequest(messageId = "msg_default"): NextRequest {
  return new NextRequest(
    new Request(QSTASH_RECOVERY_PRODUCTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "upstash-message-id": messageId,
      },
      body: JSON.stringify({ version: 1, kind: "deep-recovery" }),
    }),
  );
}

function makeDeferred<T>() {
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
  mocks.authenticate.mockImplementation(async (request: Request) =>
    delivery(request.headers.get("upstash-message-id") ?? "msg_default"),
  );
  mocks.tickSchedules.mockResolvedValue(3);
  mocks.pruneStaleSessions.mockReturnValue(0);
  mocks.signal.mockResolvedValue({
    kind: "recovery_dispatched",
    sessionIds: ["session-private-1", "session-private-2"],
    failedSessionIds: ["session-private-3"],
  });
  mocks.createDeepResearchService.mockReturnValue({ signal: mocks.signal });
});

afterEach(() => {
  vi.useRealTimers();
  restoreManagedEnv();
});

describe("/api/cron/scheduler authentication", () => {
  it("marks configuration failures as non-retryable without leaking secrets", async () => {
    mocks.authenticate.mockRejectedValueOnce(
      new QStashRecoveryConfigurationError("signing_keys_missing"),
    );

    const response = await POST(makeRequest());

    expect(response.status).toBe(489);
    expect(response.headers.get("upstash-nonretryable-error")).toBe("true");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "scheduler_request_rejected",
      code: "signing_keys_missing",
    });
  });

  it("marks invalid QStash signatures as non-retryable", async () => {
    mocks.authenticate.mockRejectedValueOnce(
      new QStashRecoveryAuthenticationError("signature_invalid"),
    );
    const response = await POST(makeRequest());
    expect(response.status).toBe(489);
    await expect(response.json()).resolves.toMatchObject({
      error: "scheduler_request_rejected",
      code: "signature_invalid",
    });
  });

  it("keeps unexpected authentication details behind a generic boundary", async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error("JWT body hash secret detail"));
    const response = await POST(makeRequest());
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("scheduler_authentication_failed");
    expect(body).not.toContain("JWT body hash secret detail");
  });

  it("rejects a signed but unexpected payload contract", async () => {
    mocks.authenticate.mockResolvedValueOnce({
      ...delivery(),
      rawBody: JSON.stringify({ version: 2, kind: "deep-recovery" }),
    });
    const response = await POST(makeRequest());
    expect(response.status).toBe(489);
    await expect(response.json()).resolves.toMatchObject({
      code: "delivery_contract_invalid",
    });
  });

  it("does not expose a GET execution alias", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});

describe("/api/cron/scheduler recovery execution", () => {
  it("runs the first tick, writes source-bound heartbeat evidence, and hides session ids", async () => {
    configureDeepReadyEnv();

    const response = await POST(makeRequest("msg_first_tick"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      triggered: 3,
      deepRecovery: { kind: "recovered", dispatched: 2, failed: 1 },
      timestamp: FIXED_NOW.toISOString(),
    });
    expect(text).not.toContain("session-private");
    expect(mocks.signal).toHaveBeenCalledWith({ kind: "recover", limit: 25 });
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
    expect(redis.peek<Record<string, string>>(HEARTBEAT_META_KEY)).toMatchObject({
      requestId: "msg_first_tick",
      source: "qstash",
      scheduleId: QSTASH_RECOVERY_SCHEDULE_ID,
      destination: QSTASH_RECOVERY_PRODUCTION_URL,
      messageId: "msg_first_tick",
      attempt: "0",
      lastDispatched: "2",
      lastFailed: "1",
    });
    const history = redis.peek<string[]>(RECOVERY_HISTORY_KEY) ?? [];
    expect(JSON.parse(history[0] ?? "{}")).toMatchObject({
      ok: true,
      requestId: "msg_first_tick",
      source: "qstash",
      scheduleId: QSTASH_RECOVERY_SCHEDULE_ID,
      destination: QSTASH_RECOVERY_PRODUCTION_URL,
      messageId: "msg_first_tick",
    });
  });

  it("accepts the managed keyring as the only model credential source", async () => {
    configureDeepReadyEnv();
    delete process.env.OPENAI_API_KEY;
    delete process.env.LAUNCHLENS_REVIEW_OPENAI_KEY;
    process.env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED = "1";
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "openai";

    const response = await POST(makeRequest("msg_keyring"));

    expect(response.status).toBe(200);
    expect(mocks.signal).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale heartbeat instead of self-gating recovery", async () => {
    configureDeepReadyEnv();
    redis.seed(HEARTBEAT_KEY, "2026-07-15T00:00:00.000Z");

    const response = await POST(makeRequest("msg_stale"));

    expect(response.status).toBe(200);
    expect(mocks.signal).toHaveBeenCalledTimes(1);
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
  });

  it("records retryable failure evidence but never returns the upstream error", async () => {
    configureDeepReadyEnv();
    const failure = new Error("provider unavailable: private account detail");
    failure.name = "ProviderUnavailableError";
    mocks.signal.mockRejectedValueOnce(failure);

    const response = await POST(makeRequest("msg_failed"));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain("scheduler_tick_failed");
    expect(text).not.toContain("private account detail");
    expect(redis.peek<Record<string, string>>(HEARTBEAT_META_KEY)).toMatchObject({
      requestId: "msg_failed",
      source: "qstash",
      lastErrorCode: "ProviderUnavailableError",
    });
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBeUndefined();
  });

  it("deduplicates a successfully committed QStash message id", async () => {
    configureDeepReadyEnv();

    const first = await POST(makeRequest("msg_redelivery"));
    const duplicate = await POST(makeRequest("msg_redelivery"));

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      ok: true,
      deduped: true,
    });
    expect(mocks.signal).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable busy response without exposing the lock holder", async () => {
    configureDeepReadyEnv();
    const entered = makeDeferred<void>();
    const releaseSignal = makeDeferred<{
      kind: string;
      sessionIds: string[];
      failedSessionIds: string[];
    }>();
    mocks.signal.mockImplementationOnce(async () => {
      entered.resolve();
      return releaseSignal.promise;
    });

    const ownerPromise = POST(makeRequest("msg_owner"));
    await entered.promise;
    const duplicate = await POST(makeRequest("msg_overlap"));
    const duplicateText = await duplicate.text();

    expect(duplicate.status).toBe(503);
    expect(duplicateText).toContain("scheduler_busy");
    expect(duplicateText).not.toContain("msg_owner");
    releaseSignal.resolve({
      kind: "recovery_dispatched",
      sessionIds: ["one"],
      failedSessionIds: [],
    });
    expect((await ownerPromise).status).toBe(200);
  });

  it("self-heals an abandoned single-flight lock after its TTL", async () => {
    configureDeepReadyEnv();
    redis.failNextEval = true;

    expect((await POST(makeRequest("msg_abandoned"))).status).toBe(200);
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBe("msg_abandoned");

    const beforeExpiry = await POST(makeRequest("msg_before_expiry"));
    expect(beforeExpiry.status).toBe(503);
    expect(mocks.signal).toHaveBeenCalledTimes(1);

    vi.setSystemTime(
      new Date(FIXED_NOW.getTime() + DEFAULT_LOCK_TTL_SECONDS * 1_000 + 1),
    );
    const afterExpiry = await POST(makeRequest("msg_after_expiry"));
    expect(afterExpiry.status).toBe(200);
    expect(mocks.signal).toHaveBeenCalledTimes(2);
    expect(redis.peek(HEARTBEAT_LOCK_KEY)).toBeUndefined();
  });

  it("writes scheduler evidence without exposing structural dependency details", async () => {
    configureDeepReadyEnv();
    delete process.env.TAVILY_API_KEY;

    const response = await POST(makeRequest("msg_structural"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deepRecovery: { kind: "structural-blocked" },
    });
    expect(mocks.signal).not.toHaveBeenCalled();
    expect(redis.peek(HEARTBEAT_KEY)).toBe(FIXED_NOW.toISOString());
  });
});

describe("checkStructuralRecoveryReadiness", () => {
  const FULL_ENV = { ...DEEP_READY_ENV };

  it("reports ready when every structural prerequisite is present", () => {
    expect(checkStructuralRecoveryReadiness(FULL_ENV)).toEqual({
      ready: true,
      missing: [],
    });
  });

  it("accepts standard QStash signing-key names as a fallback", () => {
    expect(checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY: "",
      LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY: "",
      QSTASH_CURRENT_SIGNING_KEY:
        "standard-current-signing-key-at-least-24-characters",
      QSTASH_NEXT_SIGNING_KEY:
        "standard-next-signing-key-at-least-24-characters",
    })).toEqual({ ready: true, missing: [] });
  });

  it("accepts the managed keyring as provider and reviewer source", () => {
    expect(checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      OPENAI_API_KEY: "",
      LAUNCHLENS_REVIEW_OPENAI_KEY: "",
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
    })).toEqual({ ready: true, missing: [] });
  });

  it.each([
    ["source", { LAUNCHLENS_DEEP_RECOVERY_SOURCE: "github" }, "qstash-source"],
    ["signing keys", { LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY: "" }, "qstash-signing-keys"],
    ["schedule id", { LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID: "other" }, "qstash-schedule-id"],
    ["destination", { LAUNCHLENS_QSTASH_RECOVERY_URL: "https://other.example/api/cron/scheduler" }, "qstash-recovery-url"],
    ["worker origin", { LAUNCHLENS_DEEP_WORKER_BASE_URL: "" }, "worker-origin"],
    ["retrieval", { TAVILY_API_KEY: "" }, "retrieval-key"],
    ["redis", { UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" }, "redis"],
  ])("fails closed when %s is invalid", (_label, override, expected) => {
    const result = checkStructuralRecoveryReadiness({ ...FULL_ENV, ...override });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain(expected);
  });

  it("rejects mock retrieval and a missing reviewer", () => {
    const result = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_SEARCH_PROVIDER: "mock",
      LAUNCHLENS_REVIEW_OPENAI_KEY: "",
      OPENAI_API_KEY: "",
    });
    expect(result.missing).toContain("retrieval-forced-mock");
    expect(result.missing).toContain("reviewer-key");
  });

  it("uses KV_REST_API_* as the Redis authority fallback", () => {
    expect(checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kv-token",
    })).toEqual({ ready: true, missing: [] });
  });
});
