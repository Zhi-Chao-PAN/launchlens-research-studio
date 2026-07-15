import { describe, expect, it } from "vitest";
import { probeDeepResearchCapability, resolveDeepWorkerOrigin } from "./capability";
import type { RecoveryHeartbeat } from "./recovery-heartbeat";

function staleHeartbeat(now: Date): RecoveryHeartbeat {
  return {
    lastOkAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    lastErrorAt: null,
    lastErrorCode: null,
    lastOkDurationMs: 200,
    lastDispatched: 0,
    lastFailed: 0,
  };
}

function freshHeartbeat(now: Date): RecoveryHeartbeat {
  return {
    lastOkAt: new Date(now.getTime() - 30 * 1000).toISOString(),
    lastErrorAt: null,
    lastErrorCode: null,
    lastOkDurationMs: 200,
    lastDispatched: 0,
    lastFailed: 0,
  };
}

const readyEnv = {
  LAUNCHLENS_DEEP_ENABLED: "1",
  KV_REST_API_URL: "https://redis.example",
  KV_REST_API_TOKEN: "redis-token",
  LAUNCHLENS_PROVIDER: "openai",
  OPENAI_API_KEY: "model-key",
  TAVILY_API_KEY: "search-key",
  LAUNCHLENS_REVIEW_PROVIDER: "openai",
  LAUNCHLENS_REVIEW_OPENAI_KEY: "review-key",
  LAUNCHLENS_DEEP_WORKER_BASE_URL: "https://studio.example/path",
  LAUNCHLENS_DEEP_WORKER_SECRET: "worker-secret-at-least-24-characters",
  LAUNCHLENS_DEEP_RECOVERY_MODE: "cron",
  LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS: "300",
  CRON_SECRET: "cron-secret-at-least-24-characters",
};

describe("probeDeepResearchCapability", () => {
  it("is available only when every durable and strict requirement is ready", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => freshHeartbeat(now),
      now: () => now,
    });
    expect(capability).toMatchObject({
      availability: "available",
      blockers: [],
      checkedAt: now.toISOString(),
      validationPasses: 3,
      retrieval: "required",
    });
    expect(capability.requirements.every((item) => item.ready)).toBe(true);
  });

  it("flips to preview with recovery_freshness degradation when the heartbeat is stale", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => staleHeartbeat(now),
      now: () => now,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.degraded).toBe(true);
    expect(capability.blockers).toEqual([]);
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.ready).toBe(false);
    expect(freshness?.detail).toMatch(/delayed/i);
    expect(capability.lastRecoveryAt).not.toBeNull();
    expect(capability.lastRecoveryAgeMs).not.toBeNull();
    expect(capability.capabilityNotice).toMatch(/Recovery delayed|no fresh heartbeat/);
  });

  it("treats a never-observed heartbeat as stale and degrades recovery_freshness", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => ({
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      }),
      now: () => now,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.lastRecoveryAt).toBeNull();
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.ready).toBe(false);
    expect(freshness?.detail).toMatch(/No successful recovery tick/);
  });

  it("does not add recovery_freshness as a blocker when independent_recovery is not declared", async () => {
    const capability = await probeDeepResearchCapability({
      env: { ...readyEnv, LAUNCHLENS_DEEP_RECOVERY_MODE: "" },
      probeRedis: async () => true,
      readHeartbeat: async () => freshHeartbeat(new Date()),
    });
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    // When independent_recovery is not declared, recovery_freshness is
    // intentionally not enforced — it must never add its own blocker.
    expect(freshness?.detail).toMatch(/Skipped/);
    expect(capability.blockers).toContain("independent_recovery");
    expect(capability.blockers).not.toContain("recovery_freshness");
    expect(capability.degraded).toBe(false);
  });

  it("fails closed when recovery is merely daily or not independently declared", async () => {
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS: "86400",
      },
      probeRedis: async () => true,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.blockers).toContain("independent_recovery");
  });

  it("requires independent worker and cron credentials", async () => {
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        CRON_SECRET: readyEnv.LAUNCHLENS_DEEP_WORKER_SECRET,
      },
      probeRedis: async () => true,
    });
    expect(capability.blockers).toContain("independent_recovery");
  });

  it("keeps preview when Redis is configured but unreachable", async () => {
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => false,
    });
    expect(capability.blockers).toEqual(["durable_state"]);
  });

  it("never enables from provider keys alone without explicit operator opt-in", async () => {
    const capability = await probeDeepResearchCapability({
      env: { ...readyEnv, LAUNCHLENS_DEEP_ENABLED: "0" },
      probeRedis: async () => true,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.blockers).toContain("explicit_opt_in");
  });

  it("fails readiness when the configured retrieval URL is unsafe", async () => {
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        NODE_ENV: "production",
        TAVILY_BASE_URL: "http://search.example",
      },
      probeRedis: async () => true,
    });

    expect(capability.availability).toBe("preview");
    expect(capability.blockers).toContain("retrieval_provider");
  });
});

describe("resolveDeepWorkerOrigin", () => {
  it("normalizes a Vercel host and strips paths", () => {
    expect(resolveDeepWorkerOrigin({ VERCEL_URL: "preview.example/path" }))
      .toBe("https://preview.example");
  });

  it("rejects credentials and malformed URLs", () => {
    expect(resolveDeepWorkerOrigin({ LAUNCHLENS_DEEP_WORKER_BASE_URL: "https://a:b@example.com" }))
      .toBeNull();
    expect(resolveDeepWorkerOrigin({ LAUNCHLENS_DEEP_WORKER_BASE_URL: "://bad" }))
      .toBeNull();
    expect(resolveDeepWorkerOrigin({ LAUNCHLENS_DEEP_WORKER_BASE_URL: "http://example.com" }))
      .toBeNull();
    expect(resolveDeepWorkerOrigin({ LAUNCHLENS_DEEP_WORKER_BASE_URL: "http://localhost:3000" }))
      .toBe("http://localhost:3000");
  });
});
