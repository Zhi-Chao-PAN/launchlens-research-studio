import { describe, expect, it } from "vitest";
import {
  computeRecoveryObservation,
  isManagedCredentialAdmissible,
  probeDeepResearchCapability,
  resolveDeepWorkerOrigin,
} from "./capability";
import {
  MIN_CONSECUTIVE_OK_FOR_HEALTHY,
  type RecoveryHeartbeat,
  type RecoveryHistoryEntry,
} from "./recovery-heartbeat";

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

/**
 * Build a rolling history of N consecutive ok ticks ending `endAgeMs`
 * before `now`. Use this for healthy / warming tests so the gate can
 * actually see a series instead of a single point.
 */
function healthyHistory(
  now: Date,
  count = MIN_CONSECUTIVE_OK_FOR_HEALTHY,
  stepMs = 5 * 60 * 1000,
  endAgeMs = 30 * 1000,
): RecoveryHistoryEntry[] {
  const out: RecoveryHistoryEntry[] = [];
  for (let i = 0; i < count; i++) {
    const age = endAgeMs + (count - 1 - i) * stepMs;
    out.push({
      ok: true,
      at: new Date(now.getTime() - age).toISOString(),
      durationMs: 200 + i,
      dispatched: 0,
      failed: 0,
      errorCode: null,
      requestId: `tick-${i}`,
    });
  }
  return out;
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
      // R1C: must hand the gate a *series* of consecutive ok ticks
      // before it can mark recovery healthy -- a single sample is not
      // evidence the cron source actually meets its cadence.
      readHistory: async () => healthyHistory(now),
      now: () => now,
    });
    expect(capability).toMatchObject({
      availability: "available",
      blockers: [],
      checkedAt: now.toISOString(),
      validationPasses: 3,
      retrieval: "required",
      recoveryState: "healthy",
    });
    expect(capability.requirements.every((item) => item.ready)).toBe(true);
  });

  it("accepts a managed keyring only after an enabled credential can be resolved", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const managedEnv = {
      ...readyEnv,
      OPENAI_API_KEY: "",
      LAUNCHLENS_REVIEW_OPENAI_KEY: "",
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
    };
    const capability = await probeDeepResearchCapability({
      env: managedEnv,
      probeRedis: async () => true,
      resolveManagedCredentials: async () => true,
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => healthyHistory(now),
      now: () => now,
    });

    expect(capability.availability).toBe("available");
    expect(capability.requirements.find((item) => item.id === "generation_provider")?.ready).toBe(true);
    expect(capability.requirements.find((item) => item.id === "semantic_reviewer")?.ready).toBe(true);
  });

  it("keeps legacy Deep provider gates ready while managed credentials are only staged", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "0",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
      },
      probeRedis: async () => true,
      resolveManagedCredentials: async () => {
        throw new Error("disabled keyrings must not replace legacy credentials");
      },
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => healthyHistory(now),
      now: () => now,
    });

    expect(capability.requirements.find((item) => item.id === "generation_provider")?.ready).toBe(true);
    expect(capability.requirements.find((item) => item.id === "semantic_reviewer")?.ready).toBe(true);
    expect(capability.blockers).not.toContain("generation_provider");
    expect(capability.blockers).not.toContain("semantic_reviewer");
  });

  it("fails the model gates closed when the managed keyring is empty or unreadable", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        OPENAI_API_KEY: "",
        LAUNCHLENS_REVIEW_OPENAI_KEY: "",
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
      },
      probeRedis: async () => true,
      resolveManagedCredentials: async () => false,
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => healthyHistory(now),
      now: () => now,
    });

    expect(capability.availability).toBe("preview");
    expect(capability.blockers).toEqual(expect.arrayContaining([
      "generation_provider",
      "semantic_reviewer",
    ]));
    expect(capability.requirements.find((item) => item.id === "generation_provider")?.detail)
      .toMatch(/managed keyring/i);
  });

  it("fails closed on an invalid managed provider even when legacy keys exist", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: {
        ...readyEnv,
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: " 1 ",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: " unsupported ",
      },
      probeRedis: async () => true,
      resolveManagedCredentials: async () => {
        throw new Error("invalid providers must not reach credential resolution");
      },
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => healthyHistory(now),
      now: () => now,
    });

    expect(capability.availability).toBe("preview");
    expect(capability.blockers).toEqual(expect.arrayContaining([
      "generation_provider",
      "semantic_reviewer",
    ]));
  });

  it("flips to delayed with recovery_freshness degradation when the heartbeat is stale", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    // History is healthy but the latest tick is 10 minutes old -- the
    // cron source has stopped firing even though previous ticks exist.
    const history = healthyHistory(now).map((e, i, arr) =>
      i === arr.length - 1
        ? { ...e, at: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }
        : e,
    );
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => ({
        lastOkAt: history[history.length - 1].at,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: 200,
        lastDispatched: 0,
        lastFailed: 0,
      }),
      readHistory: async () => history,
      now: () => now,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.degraded).toBe(true);
    expect(capability.recoveryState).toBe("delayed");
    expect(capability.blockers).toEqual([]);
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.ready).toBe(false);
    expect(freshness?.detail).toMatch(/delayed/i);
    expect(capability.lastRecoveryAt).not.toBeNull();
    expect(capability.lastRecoveryAgeMs).not.toBeNull();
    expect(capability.capabilityNotice).toMatch(/delayed|stopped firing/);
  });

  it("treats a never-observed heartbeat as configured and degrades recovery_freshness", async () => {
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
      readHistory: async () => [],
      now: () => now,
    });
    expect(capability.availability).toBe("preview");
    expect(capability.lastRecoveryAt).toBeNull();
    expect(capability.recoveryState).toBe("configured");
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.ready).toBe(false);
    expect(freshness?.detail).toMatch(/No recovery tick observed yet/);
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
    // intentionally not enforced -- it must never add its own blocker.
    expect(freshness?.detail).toMatch(/Skipped/);
    expect(capability.blockers).toContain("independent_recovery");
    expect(capability.blockers).not.toContain("recovery_freshness");
    expect(capability.degraded).toBe(false);
  });

  it("does not promote to available with only a single successful tick", async () => {
    // The whole point of Phase 1C: one cold-deploy sample is not enough
    // to call the scheduler "healthy". The gate must surface warming.
    const now = new Date("2026-07-13T00:00:00.000Z");
    const singleTick: RecoveryHistoryEntry[] = [
      {
        ok: true,
        at: new Date(now.getTime() - 30 * 1000).toISOString(),
        durationMs: 200,
        dispatched: 0,
        failed: 0,
        errorCode: null,
        requestId: "tick-solo",
      },
    ];
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => singleTick,
      now: () => now,
    });
    expect(capability.recoveryState).toBe("warming");
    expect(capability.availability).toBe("preview");
    expect(capability.degraded).toBe(false);
    // Notice + detail both reflect warming so the UI surfaces the state.
    expect(capability.capabilityNotice).toMatch(/first ticks|Preview while the series fills/i);
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.ready).toBe(false);
    expect(freshness?.detail).toMatch(/warming|consecutive/i);
  });

  it("promotes from warming to healthy once the series fills", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => healthyHistory(now), // 3 consecutive ok
      now: () => now,
    });
    expect(capability.recoveryState).toBe("healthy");
    expect(capability.recoveryObservation.consecutiveOk).toBe(
      MIN_CONSECUTIVE_OK_FOR_HEALTHY,
    );
    expect(capability.availability).toBe("available");
  });

  it("decays from healthy to delayed when the latest tick is older than the budget", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    // 8 minutes stale == 180s past the 5-min budget. Build a fully healthy
    // series (3 consecutive ticks each 5 min apart ending at "now - 30s"),
    // then push the LAST tick to `now - 8min` so the freshness check fires.
    const baseSeries = healthyHistory(now, 3, 5 * 60 * 1000, 30_000);
    const history = baseSeries.map((entry, i, arr) =>
      i === arr.length - 1
        ? { ...entry, at: new Date(now.getTime() - 8 * 60 * 1000).toISOString() }
        : entry,
    );
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => ({
        lastOkAt: history[history.length - 1].at,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: 200,
        lastDispatched: 0,
        lastFailed: 0,
      }),
      readHistory: async () => history,
      now: () => now,
    });
    expect(capability.recoveryState).toBe("delayed");
    expect(capability.availability).toBe("preview");
    expect(capability.degraded).toBe(true);
  });

  it("decays to delayed when the most recent tick failed, even if the budget is fresh", async () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const base = healthyHistory(now);
    base[base.length - 1] = {
      ...base[base.length - 1],
      ok: false,
      errorCode: "ECONNRESET",
    };
    const capability = await probeDeepResearchCapability({
      env: readyEnv,
      probeRedis: async () => true,
      readHeartbeat: async () => freshHeartbeat(now),
      readHistory: async () => base,
      now: () => now,
    });
    expect(capability.recoveryState).toBe("delayed");
    expect(capability.availability).toBe("preview");
    const freshness = capability.requirements.find(
      (r) => r.id === "recovery_freshness",
    );
    expect(freshness?.detail).toMatch(/most recent tick failed/);
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

describe("isManagedCredentialAdmissible", () => {
  const observedAt = new Date("2026-07-13T00:00:00.000Z");
  const health = {
    consecutiveFailures: 1,
    lastSuccessAt: null,
    lastFailureAt: "2026-07-12T23:59:00.000Z",
    lastFailureReason: "rate_limit" as const,
  };

  it("rejects an active or malformed cooldown and admits an expired cooldown", () => {
    expect(isManagedCredentialAdmissible({
      health: { ...health, status: "cooldown", cooldownUntil: "2026-07-13T00:01:00.000Z" },
    }, observedAt)).toBe(false);
    expect(isManagedCredentialAdmissible({
      health: { ...health, status: "cooldown", cooldownUntil: null },
    }, observedAt)).toBe(false);
    expect(isManagedCredentialAdmissible({
      health: { ...health, status: "cooldown", cooldownUntil: "2026-07-12T23:59:59.000Z" },
    }, observedAt)).toBe(true);
  });

  it("admits healthy, degraded, and not-yet-observed credentials", () => {
    for (const status of ["healthy", "degraded", "unknown"] as const) {
      expect(isManagedCredentialAdmissible({
        health: { ...health, status, cooldownUntil: null },
      }, observedAt)).toBe(true);
    }
  });
});

describe("resolveDeepWorkerOrigin", () => {
  it("normalizes a Vercel host and strips paths", () => {
    expect(resolveDeepWorkerOrigin({ VERCEL_URL: "preview.example/path" }))
      .toBe("https://preview.example");
  });

  it("always prefers the explicit worker origin", () => {
    expect(resolveDeepWorkerOrigin({
      LAUNCHLENS_DEEP_WORKER_BASE_URL: "https://worker.example/path",
      VERCEL_ENV: "preview",
      VERCEL_URL: "preview.example",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example",
    })).toBe("https://worker.example");
  });

  it("uses the deployment URL for Preview even when a production URL is present", () => {
    expect(resolveDeepWorkerOrigin({
      VERCEL_ENV: "preview",
      VERCEL_URL: "preview.example",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example",
    })).toBe("https://preview.example");
  });

  it("prefers the project production URL only in Production", () => {
    expect(resolveDeepWorkerOrigin({
      VERCEL_ENV: "production",
      VERCEL_URL: "deployment.example",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example",
    })).toBe("https://production.example");
  });

  it("does not route Preview work to Production when only a production URL is present", () => {
    expect(resolveDeepWorkerOrigin({
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example",
    })).toBeNull();
  });

  it("defaults to the deployment URL when VERCEL_ENV is unavailable", () => {
    expect(resolveDeepWorkerOrigin({
      VERCEL_URL: "deployment.example",
      VERCEL_PROJECT_PRODUCTION_URL: "production.example",
    })).toBe("https://deployment.example");
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

describe("computeRecoveryObservation", () => {
  it("returns 'configured' when the history is empty and recovery is declared", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: [],
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("configured");
    expect(obs.detail).toMatch(/No recovery tick observed yet/);
  });

  it("returns 'warming' when 1 of 3 consecutive ticks is observed", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: [
        {
          ok: true,
          at: new Date(now.getTime() - 30_000).toISOString(),
          durationMs: 100,
          dispatched: 0,
          failed: 0,
          errorCode: null,
          requestId: "t0",
        },
      ],
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("warming");
    expect(obs.consecutiveOk).toBe(1);
    expect(obs.requiredForHealthy).toBe(3);
  });

  it("returns 'healthy' when the last N ticks are ok and within the budget", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: healthyHistory(now),
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("healthy");
    expect(obs.consecutiveOk).toBe(3);
    expect(obs.maxObservedIntervalMs).toBe(300_000);
    expect(obs.cadenceSpanMs).toBe(600_000);
    expect(obs.detail).toMatch(/healthy/);
  });

  it("keeps rapid manual bursts warming even when three ticks are fresh and successful", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: healthyHistory(now, 3, 1_000, 1_000),
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("warming");
    expect(obs.minObservedIntervalMs).toBe(1_000);
    expect(obs.detail).toMatch(/manual burst/i);
  });

  it("marks a fresh tail delayed when the observed interval exceeded the SLA", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const history = healthyHistory(now, 3, 300_000, 30_000);
    history[0] = { ...history[0], at: new Date(new Date(history[1].at).getTime() - 301_000).toISOString() };
    const obs = computeRecoveryObservation({
      history,
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("delayed");
    expect(obs.maxObservedIntervalMs).toBe(301_000);
    expect(obs.detail).toMatch(/maximum interval/i);
  });

  it("returns 'delayed' when freshness budget is exceeded even with a healthy series", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const history = healthyHistory(now).map((entry, i, arr) =>
      i === arr.length - 1
        ? { ...entry, at: new Date(now.getTime() - 600_000).toISOString() }
        : entry,
    );
    const obs = computeRecoveryObservation({
      history,
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("delayed");
    expect(obs.detail).toMatch(/budget/i);
  });

  it("returns 'delayed' when the most recent tick failed", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const history = healthyHistory(now);
    history[history.length - 1] = {
      ...history[history.length - 1],
      ok: false,
      errorCode: "X",
    };
    const obs = computeRecoveryObservation({
      history,
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    expect(obs.state).toBe("delayed");
    expect(obs.detail).toMatch(/most recent tick failed/);
  });

  it("counts only consecutive ok ticks at the tail (non-tail failures reset the count)", () => {
    const history: RecoveryHistoryEntry[] = [
      { ok: true, at: "2026-07-13T00:00:00.000Z", durationMs: 0, dispatched: 0, failed: 0, errorCode: null, requestId: "a" },
      { ok: false, at: "2026-07-13T00:05:00.000Z", durationMs: 0, dispatched: 0, failed: 0, errorCode: "x", requestId: "b" },
      { ok: true, at: "2026-07-13T00:10:00.000Z", durationMs: 0, dispatched: 0, failed: 0, errorCode: null, requestId: "c" },
      { ok: true, at: "2026-07-13T00:15:00.000Z", durationMs: 0, dispatched: 0, failed: 0, errorCode: null, requestId: "d" },
    ];
    const obs = computeRecoveryObservation({
      history,
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now: new Date("2026-07-13T00:20:00.000Z"),
    });
    expect(obs.consecutiveOk).toBe(2);
    // 2 < required 3 -> warming.
    expect(obs.state).toBe("warming");
  });

  it("is unaffected by single-sample heuristic: a single tick never reaches healthy", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: [
        {
          ok: true,
          at: new Date(now.getTime() - 1000).toISOString(),
          durationMs: 200,
          dispatched: 0,
          failed: 0,
          errorCode: null,
          requestId: "solo",
        },
      ],
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: true,
      now,
    });
    // Must NOT be healthy with only one sample, no matter how fresh.
    expect(obs.state).not.toBe("healthy");
    expect(obs.state).toBe("warming");
  });

  it("returns 'configured' (skipped) when recovery is not declared, regardless of history", () => {
    const now = new Date("2026-07-13T00:00:00.000Z");
    const obs = computeRecoveryObservation({
      history: healthyHistory(now),
      heartbeat: {
        lastOkAt: null,
        lastErrorAt: null,
        lastErrorCode: null,
        lastOkDurationMs: null,
        lastDispatched: null,
        lastFailed: null,
      },
      freshnessBudgetMs: 300_000,
      recoveryDeclared: false,
      now,
    });
    expect(obs.state).toBe("configured");
    expect(obs.detail).toMatch(/not declared/i);
  });

  it("observation detail strings differ for each of the four states", () => {
    // Pin the wording so the UI copy never regresses silently.
    const samples: Array<{ state: string; expect: RegExp }> = [
      { state: "configured", expect: /No recovery tick observed/ },
      { state: "warming", expect: /warming/ },
      { state: "healthy", expect: /healthy/ },
      { state: "delayed", expect: /delayed/ },
    ];
    const now = new Date("2026-07-13T00:00:00.000Z");
    const cases: Array<{ state: string; obs: ReturnType<typeof computeRecoveryObservation> }> = [
      {
        state: "configured",
        obs: computeRecoveryObservation({
          history: [],
          heartbeat: { lastOkAt: null, lastErrorAt: null, lastErrorCode: null, lastOkDurationMs: null, lastDispatched: null, lastFailed: null },
          freshnessBudgetMs: 300_000,
          recoveryDeclared: true,
          now,
        }),
      },
      {
        state: "warming",
        obs: computeRecoveryObservation({
          history: healthyHistory(now, 1),
          heartbeat: { lastOkAt: null, lastErrorAt: null, lastErrorCode: null, lastOkDurationMs: null, lastDispatched: null, lastFailed: null },
          freshnessBudgetMs: 300_000,
          recoveryDeclared: true,
          now,
        }),
      },
      {
        state: "healthy",
        obs: computeRecoveryObservation({
          history: healthyHistory(now),
          heartbeat: { lastOkAt: null, lastErrorAt: null, lastErrorCode: null, lastOkDurationMs: null, lastDispatched: null, lastFailed: null },
          freshnessBudgetMs: 300_000,
          recoveryDeclared: true,
          now,
        }),
      },
      {
        state: "delayed",
        obs: computeRecoveryObservation({
          history: healthyHistory(now).map((e, i, arr) =>
            i === arr.length - 1
              ? { ...e, at: new Date(now.getTime() - 10 * 60 * 1000).toISOString() }
              : e,
          ),
          heartbeat: { lastOkAt: null, lastErrorAt: null, lastErrorCode: null, lastOkDurationMs: null, lastDispatched: null, lastFailed: null },
          freshnessBudgetMs: 300_000,
          recoveryDeclared: true,
          now,
        }),
      },
    ];
    for (const expected of samples) {
      const obs = cases.find((c) => c.state === expected.state)!.obs;
      expect(obs.detail).toMatch(expected.expect);
    }
  });
});
