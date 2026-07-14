import { afterEach, describe, expect, it, vi } from "vitest";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import type { ResearchSession } from "@/lib/schema/research-schema";
import { MemoryDeepRunRepository } from "./memory-repository";
import {
  DeepResearchService,
  DeepWorkExecutionError,
  type DeepWorkExecutor,
} from "./service";

const createdSessionIds: string[] = [];

function deepSession(label: string): ResearchSession {
  const session = createResearchSession(label, [], undefined, { mode: "deep" });
  createdSessionIds.push(session.id);
  return session;
}

const profile = {
  generationProviderId: "openai",
  retrievalProviderId: "tavily",
  reviewerProviderId: "openai",
};

function successExecutor(run?: DeepWorkExecutor["execute"]): DeepWorkExecutor {
  return {
    execute:
      run ??
      (async ({ record }) => {
        return structuredClone(record.session);
      }),
  };
}

afterEach(() => {
  for (const id of createdSessionIds.splice(0)) deleteSession(id);
});

describe("DeepResearchService", () => {
  it("starts idempotently and keeps wake-up separate from durable creation", async () => {
    const repository = new MemoryDeepRunRepository();
    const dispatch = vi.fn(async () => undefined);
    const service = new DeepResearchService({
      repository,
      executor: successExecutor(),
      dispatcher: { dispatch },
    });
    const session = deepSession("idempotent deep start");

    const first = await service.start(session, profile);
    const second = await service.start(session, profile);

    expect(first).toMatchObject({ created: true, wakeAccepted: true });
    expect(second).toMatchObject({ created: false, wakeAccepted: true });
    expect(second.record.session.status).toBe("running");
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("claims and commits exactly one fixed work unit per continuation", async () => {
    const repository = new MemoryDeepRunRepository();
    const execute = vi.fn(successExecutor().execute);
    const service = new DeepResearchService({
      repository,
      executor: { execute },
      token: () => "lease-1",
    });
    const session = deepSession("one unit");
    await service.start(session, profile);

    const result = await service.signal({
      kind: "continue",
      sessionId: session.id,
      workerId: "worker-1",
    });

    expect(result).toMatchObject({
      kind: "committed",
      record: { lifecycle: "active", currentWorkIndex: 1 },
    });
    if (result.kind !== "committed") throw new Error("expected committed result");
    expect(result.record.work[0]).toMatchObject({
      id: "specialist:pricing-scout",
      status: "done",
      attempts: 1,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("records bounded retry wait and does not execute before the due time", async () => {
    const repository = new MemoryDeepRunRepository();
    let now = Date.now();
    let calls = 0;
    const service = new DeepResearchService({
      repository,
      now: () => now,
      token: () => `lease-${calls}`,
      retryDelayMs: () => 1_000,
      executor: successExecutor(async ({ record }) => {
        calls += 1;
        if (calls === 1) {
          throw new DeepWorkExecutionError(
            "provider_rate_limited",
            true,
            "The model provider is temporarily unavailable.",
          );
        }
        return structuredClone(record.session);
      }),
    });
    const session = deepSession("retry deep stage");
    await service.start(session, profile);

    const first = await service.signal({ kind: "continue", sessionId: session.id, workerId: "w" });
    expect(first).toMatchObject({ kind: "committed", record: { currentWorkIndex: 0 } });
    if (first.kind !== "committed") throw new Error("expected committed retry result");
    expect(first.record.work[0]).toMatchObject({ status: "retry_wait", attempts: 1 });
    expect(await service.signal({ kind: "continue", sessionId: session.id, workerId: "w" }))
      .toMatchObject({ kind: "not_due" });

    now += 1_000;
    const second = await service.signal({
      kind: "continue",
      sessionId: session.id,
      workerId: "w",
    });
    expect(second).toMatchObject({ kind: "committed", record: { currentWorkIndex: 1 } });
    if (second.kind !== "committed") throw new Error("expected committed success result");
    expect(second.record.work[0]).toMatchObject({ status: "done", attempts: 2 });
  });

  it("commits a sticky error terminal for a non-retryable stage failure", async () => {
    const repository = new MemoryDeepRunRepository();
    const service = new DeepResearchService({
      repository,
      executor: successExecutor(async () => {
        throw new DeepWorkExecutionError(
          "mock_provider_forbidden",
          false,
          "Deep Research requires a real model provider.",
        );
      }),
    });
    const session = deepSession("strict failure");
    await service.start(session, profile);

    const result = await service.signal({ kind: "continue", sessionId: session.id, workerId: "w" });
    expect(result).toMatchObject({
      kind: "committed",
      wakeAccepted: false,
      record: {
        lifecycle: "error",
        session: { status: "error" },
        terminal: { status: "error", reasonCode: "mock_provider_forbidden" },
      },
    });
  });

  it("lets cancellation win when it races an in-flight worker commit", async () => {
    const repository = new MemoryDeepRunRepository();
    const session = deepSession("cancel race");
    const service = new DeepResearchService({
      repository,
      executor: successExecutor(async ({ record }) => {
        await service.signal({ kind: "cancel", sessionId: record.sessionId });
        return structuredClone(record.session);
      }),
    });
    await service.start(session, profile);

    const result = await service.signal({ kind: "continue", sessionId: session.id, workerId: "w" });
    expect(result).toMatchObject({
      kind: "terminal",
      record: { lifecycle: "cancelled", session: { status: "cancelled" } },
    });
    expect((await repository.read(session.id))?.lifecycle).toBe("cancelled");
  });

  it("keeps due work recoverable when fast dispatch fails", async () => {
    const repository = new MemoryDeepRunRepository();
    const dispatch = vi.fn(async () => {
      throw new Error("transient self-dispatch failure");
    });
    const service = new DeepResearchService({
      repository,
      executor: successExecutor(),
      dispatcher: { dispatch },
    });
    const session = deepSession("recoverable wake");

    await expect(service.start(session, profile)).resolves.toMatchObject({
      created: true,
      wakeAccepted: false,
    });
    await expect(service.signal({ kind: "recover", limit: 10 })).resolves.toMatchObject({
      kind: "recovery_dispatched",
      sessionIds: [session.id],
      failedSessionIds: [session.id],
    });
  });

  it("completes the fixed eleven-unit graph and publishes history only after the terminal commit", async () => {
    const repository = new MemoryDeepRunRepository();
    const observe = vi.fn(async () => undefined);
    const service = new DeepResearchService({
      repository,
      executor: successExecutor(),
      terminalObserver: { observe },
    });
    const session = deepSession("complete fixed graph");
    await service.start(session, profile);

    // 5 specialists + gap_fill + 3 semantic passes + synthesis + finalize = 11 units.
    let lastResult: Awaited<ReturnType<DeepResearchService["signal"]>> | undefined;
    for (let index = 0; index < 11; index++) {
      lastResult = await service.signal({
        kind: "continue",
        sessionId: session.id,
        workerId: `worker-${index}`,
      });
      if (index < 10) {
        expect(lastResult).toMatchObject({
          kind: "committed",
          record: { lifecycle: "active", currentWorkIndex: index + 1 },
        });
        expect(observe).not.toHaveBeenCalled();
      }
    }

    expect(lastResult).toMatchObject({
      kind: "committed",
      wakeAccepted: false,
      record: {
        lifecycle: "completed",
        currentWorkIndex: 11,
        session: { status: "completed" },
      },
    });
    expect((await repository.read(session.id))?.work.every((work) => work.status === "done"))
      .toBe(true);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: "completed", sessionId: session.id }),
    );
  });
});
