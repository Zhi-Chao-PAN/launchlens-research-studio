import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import { createDeepWorkPlan, type DeepRunRecordV1 } from "./model";

const redis = vi.hoisted(() => ({
  eval: vi.fn(),
}));
const redisState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/lib/research/redis-client", () => ({
  getRedis: () => (redisState.enabled ? redis : null),
}));

import { RedisDeepRunRepository } from "./redis-repository";

const createdSessionIds: string[] = [];

function record(): DeepRunRecordV1 {
  const session = createResearchSession("redis adapter contract", [], undefined, {
    mode: "deep",
  });
  createdSessionIds.push(session.id);
  return {
    version: 1,
    sessionId: session.id,
    revision: 1,
    lifecycle: "active",
    currentWorkIndex: 0,
    work: createDeepWorkPlan(),
    session,
    createdAt: 1_000,
    updatedAt: 1_000,
    nextWakeAt: 1_000,
    totalAttempts: 1,
    executionProfile: {
      generationProviderId: "openai",
      retrievalProviderId: "tavily",
      reviewerProviderId: "openai",
    },
  };
}

afterEach(() => {
  redisState.enabled = false;
  redis.eval.mockReset();
  for (const id of createdSessionIds.splice(0)) deleteSession(id);
});

describe("RedisDeepRunRepository Upstash response contract", () => {
  it("accepts automatically deserialized Lua JSON from claim, commit, and delete", async () => {
    const repository = new RedisDeepRunRepository();
    const initial = record();
    redisState.enabled = true;
    const lease = {
      token: "lease-token",
      workerId: "worker-1",
      fencingEpoch: 1,
      expiresAt: 2_000,
    };

    redis.eval.mockResolvedValueOnce({ kind: "claimed", record: initial, lease });
    await expect(repository.claim({
      sessionId: initial.sessionId,
      workerId: lease.workerId,
      token: lease.token,
      now: 1_000,
      leaseMs: 1_000,
    })).resolves.toMatchObject({ kind: "claimed", lease });

    const committed = structuredClone(initial);
    committed.currentWorkIndex = 1;
    redis.eval.mockResolvedValueOnce({ kind: "committed", record: committed });
    await expect(repository.commit({
      sessionId: initial.sessionId,
      expectedRevision: initial.revision,
      lease,
      next: committed,
    })).resolves.toMatchObject({
      kind: "committed",
      record: { currentWorkIndex: 1 },
    });

    committed.lifecycle = "completed";
    redis.eval.mockResolvedValueOnce({ kind: "deleted", record: committed });
    await expect(repository.deleteTerminal(initial.sessionId)).resolves.toMatchObject({
      kind: "deleted",
      record: { lifecycle: "completed" },
    });
  });

  it("still accepts raw cjson strings from compatible Redis clients", async () => {
    const repository = new RedisDeepRunRepository();
    const initial = record();
    redisState.enabled = true;
    redis.eval.mockResolvedValueOnce(JSON.stringify({ kind: "not_due", record: initial }));

    await expect(repository.claim({
      sessionId: initial.sessionId,
      workerId: "worker-1",
      token: "lease-token",
      now: 999,
      leaseMs: 1_000,
    })).resolves.toMatchObject({ kind: "not_due" });
  });
});
