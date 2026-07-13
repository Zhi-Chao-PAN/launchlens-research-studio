import { describe, expect, it } from "vitest";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import { MemoryDeepRunRepository } from "./memory-repository";
import { createDeepWorkPlan, type DeepRunRecordV1 } from "./model";

function record(idSuffix = "1", now = 1_000): DeepRunRecordV1 {
  const session = createResearchSession(`deep-${idSuffix}`, [], undefined, { mode: "deep" });
  return {
    version: 1,
    sessionId: session.id,
    revision: 0,
    lifecycle: "active",
    currentWorkIndex: 0,
    work: createDeepWorkPlan(),
    session,
    createdAt: now,
    updatedAt: now,
    nextWakeAt: now,
    totalAttempts: 0,
    executionProfile: {
      generationProviderId: "openai",
      retrievalProviderId: "tavily",
      reviewerProviderId: "openai",
    },
  };
}

describe("MemoryDeepRunRepository contract", () => {
  it("creates idempotently and returns isolated snapshots", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record();
    expect(await repository.create(initial)).toBe("created");
    expect(await repository.create(initial)).toBe("exists");
    const snapshot = await repository.read(initial.sessionId);
    snapshot!.work[0].status = "failed";
    expect((await repository.read(initial.sessionId))!.work[0].status).toBe("ready");
    deleteSession(initial.sessionId);
  });

  it("allows only one live lease and increments the fencing epoch after expiry", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record("lease");
    await repository.create(initial);
    const first = await repository.claim({
      sessionId: initial.sessionId,
      workerId: "w1",
      token: "t1",
      now: 1_000,
      leaseMs: 100,
    });
    expect(first.kind).toBe("claimed");
    expect(await repository.claim({
      sessionId: initial.sessionId,
      workerId: "w2",
      token: "t2",
      now: 1_050,
      leaseMs: 100,
    })).toMatchObject({ kind: "busy" });
    const reclaimed = await repository.claim({
      sessionId: initial.sessionId,
      workerId: "w2",
      token: "t2",
      now: 1_101,
      leaseMs: 100,
    });
    expect(reclaimed).toMatchObject({
      kind: "claimed",
      lease: { fencingEpoch: 2 },
      record: { totalAttempts: 2 },
    });
    deleteSession(initial.sessionId);
  });

  it("rejects stale leases and stale revisions", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record("stale");
    await repository.create(initial);
    const first = await repository.claim({
      sessionId: initial.sessionId,
      workerId: "w1",
      token: "t1",
      now: Date.now(),
      leaseMs: 10_000,
    });
    if (first.kind !== "claimed") throw new Error("expected claim");
    const staleRevisionNext = structuredClone(first.record);
    expect(await repository.commit({
      sessionId: initial.sessionId,
      expectedRevision: first.record.revision - 1,
      lease: first.lease,
      next: staleRevisionNext,
    })).toMatchObject({ kind: "revision_conflict" });

    const fakeLease = { ...first.lease, fencingEpoch: first.lease.fencingEpoch - 1 };
    expect(await repository.commit({
      sessionId: initial.sessionId,
      expectedRevision: first.record.revision,
      lease: fakeLease,
      next: staleRevisionNext,
    })).toMatchObject({ kind: "stale_lease" });
    deleteSession(initial.sessionId);
  });

  it("commits once and preserves the first terminal result", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record("terminal");
    await repository.create(initial);
    const claimed = await repository.claim({
      sessionId: initial.sessionId,
      workerId: "w",
      token: "t",
      now: Date.now(),
      leaseMs: 10_000,
    });
    if (claimed.kind !== "claimed") throw new Error("expected claim");
    const next = structuredClone(claimed.record);
    next.lifecycle = "completed";
    next.session.status = "completed";
    next.terminal = { status: "completed", committedAt: new Date().toISOString() };
    expect(await repository.commit({
      sessionId: initial.sessionId,
      expectedRevision: claimed.record.revision,
      lease: claimed.lease,
      next,
    })).toMatchObject({ kind: "committed", record: { lifecycle: "completed" } });
    expect(await repository.cancel({
      sessionId: initial.sessionId,
      now: Date.now(),
      committedAt: new Date().toISOString(),
    })).toMatchObject({ lifecycle: "completed" });
    deleteSession(initial.sessionId);
  });

  it("cancels atomically and removes the run from due recovery", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record("cancel");
    await repository.create(initial);
    expect(await repository.findDue(1_000, 10)).toContain(initial.sessionId);
    const cancelled = await repository.cancel({
      sessionId: initial.sessionId,
      now: 1_001,
      committedAt: "2026-07-13T00:00:00.000Z",
      reasonCode: "user_requested",
    });
    expect(cancelled).toMatchObject({
      lifecycle: "cancelled",
      session: { status: "cancelled" },
      terminal: { status: "cancelled", reasonCode: "user_requested" },
    });
    expect(await repository.findDue(2_000, 10)).not.toContain(initial.sessionId);
    deleteSession(initial.sessionId);
  });

  it("refuses to delete active work and deletes terminal live-state idempotently", async () => {
    const repository = new MemoryDeepRunRepository();
    const initial = record("delete-boundary");
    await repository.create(initial);

    expect(await repository.deleteTerminal(initial.sessionId)).toMatchObject({
      kind: "active",
      record: { lifecycle: "active" },
    });
    await repository.cancel({
      sessionId: initial.sessionId,
      now: 2_000,
      committedAt: "2026-07-13T00:00:00.000Z",
    });
    expect(await repository.deleteTerminal(initial.sessionId)).toMatchObject({
      kind: "deleted",
      record: { lifecycle: "cancelled" },
    });
    expect(await repository.deleteTerminal(initial.sessionId)).toEqual({ kind: "not_found" });
    deleteSession(initial.sessionId);
  });
});
