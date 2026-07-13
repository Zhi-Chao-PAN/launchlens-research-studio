import { describe, expect, it, vi } from "vitest";
import {
  releaseDeepResearchAdmission,
  reserveDeepResearchAdmission,
  resolveDeepAdmissionConfig,
  type DeepAdmissionOptions,
} from "./admission";

const NOW = Date.UTC(2026, 6, 14, 12, 0, 0);
const ENV = {
  LAUNCHLENS_DEEP_WORKER_SECRET: "worker-secret-that-is-long-enough",
};

function options(result: unknown): DeepAdmissionOptions & {
  redis: { eval: ReturnType<typeof vi.fn> };
} {
  return {
    now: NOW,
    env: ENV,
    redis: { eval: vi.fn().mockResolvedValue(result) },
  };
}

describe("Deep Research durable admission", () => {
  it("reserves daily and active capacity with one atomic Redis script", async () => {
    const deps = options([0, NOW + 3_600_000, 1, 1]);

    const decision = await reserveDeepResearchAdmission(
      "203.0.113.42",
      "0123456789abcdef0123456789abcdef",
      deps,
    );

    expect(decision).toMatchObject({
      allowed: true,
      reservationExpiresAt: NOW + 3_600_000,
    });
    expect(deps.redis.eval).toHaveBeenCalledTimes(1);
    const [script, keys, args] = deps.redis.eval.mock.calls[0];
    expect(script).toContain("ZREMRANGEBYSCORE");
    expect(script).toContain("INCR");
    expect(script).toContain("ZADD");
    expect(keys.join(" ")).not.toContain("203.0.113.42");
    expect(args.join(" ")).not.toContain("203.0.113.42");
    expect(keys).toHaveLength(5);
  });

  it.each([
    [1, "client_daily_limit"],
    [2, "global_daily_limit"],
    [3, "client_active_limit"],
    [4, "global_active_limit"],
  ] as const)("maps atomic rejection code %i to %s", async (code, reason) => {
    const retryAt = NOW + 45_000;
    const decision = await reserveDeepResearchAdmission(
      "198.51.100.9",
      "abcdefabcdefabcdefabcdefabcdefab",
      options([code, retryAt, 1, 1]),
    );

    expect(decision).toMatchObject({
      allowed: false,
      reason,
      retryAfterMs: 45_000,
    });
  });

  it("fails closed when Redis is absent, rejects, or returns malformed data", async () => {
    await expect(
      reserveDeepResearchAdmission("client", "session", {
        now: NOW,
        env: ENV,
        redis: null,
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "storage_unavailable" });

    const rejecting = {
      eval: vi.fn().mockRejectedValue(new Error("redis offline")),
    };
    await expect(
      reserveDeepResearchAdmission("client", "session", {
        now: NOW,
        env: ENV,
        redis: rejecting,
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "storage_unavailable" });

    await expect(
      reserveDeepResearchAdmission("client", "session", options("bad")),
    ).resolves.toMatchObject({ allowed: false, reason: "storage_unavailable" });
  });

  it("requires a strong private hashing secret before writing client identity", async () => {
    const deps = options([0, NOW + 3_600_000, 1, 1]);
    const decision = await reserveDeepResearchAdmission("client", "session", {
      ...deps,
      env: {},
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "storage_unavailable",
    });
    expect(deps.redis.eval).not.toHaveBeenCalled();
  });

  it("uses safe defaults and clamps operator overrides", () => {
    expect(resolveDeepAdmissionConfig({})).toEqual({
      perClientDailyLimit: 2,
      globalDailyLimit: 20,
      perClientActiveLimit: 1,
      globalActiveLimit: 3,
      reservationSeconds: 3_600,
    });
    expect(
      resolveDeepAdmissionConfig({
        LAUNCHLENS_DEEP_PER_CLIENT_DAILY_LIMIT: "0",
        LAUNCHLENS_DEEP_GLOBAL_DAILY_LIMIT: "999999",
        LAUNCHLENS_DEEP_PER_CLIENT_ACTIVE_LIMIT: "garbage",
        LAUNCHLENS_DEEP_GLOBAL_ACTIVE_LIMIT: "0",
        LAUNCHLENS_DEEP_RESERVATION_SECONDS: "20",
      }),
    ).toEqual({
      perClientDailyLimit: 1,
      globalDailyLimit: 10_000,
      perClientActiveLimit: 1,
      globalActiveLimit: 1,
      reservationSeconds: 300,
    });
  });

  it("releases global and per-client capacity early and tolerates release failure", async () => {
    const redis = { eval: vi.fn().mockResolvedValue(1) };
    await expect(
      releaseDeepResearchAdmission("session-id", { redis }),
    ).resolves.toBe(true);
    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toContain("client_active_key");
    expect(keys).toHaveLength(2);
    expect(args).toEqual(["session-id"]);

    await expect(
      releaseDeepResearchAdmission("session-id", {
        redis: { eval: vi.fn().mockRejectedValue(new Error("offline")) },
      }),
    ).resolves.toBe(false);
  });
});
