import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchSession } from "@/lib/schema/research-schema";
import type { ResearchRun } from "@/lib/research/storage";

const {
  remoteSessions,
  remoteCancelled,
  persistedRuns,
  writeTrace,
  recordResearchFunnelEvent,
  storePersistentResearchRun,
} = vi.hoisted(() => ({
  remoteSessions: new Map<string, ResearchSession>(),
  remoteCancelled: new Set<string>(),
  persistedRuns: new Map<string, ResearchRun>(),
  writeTrace: [] as string[],
  recordResearchFunnelEvent: vi.fn(),
  storePersistentResearchRun: vi.fn(async (run: ResearchRun) => {
    persistedRuns.set(run.id, JSON.parse(JSON.stringify(run)) as ResearchRun);
    writeTrace.push(`run:${run.status}:${run.dossier?.validation?.stage ?? "none"}`);
  }),
}));

vi.mock("@/lib/research/session-store", () => ({
  storeSession: async (session: ResearchSession) => {
    const snapshot = JSON.parse(JSON.stringify(session)) as ResearchSession;
    // Widen the historical race: without the engine's per-session queue this
    // pre-synthesis revision can finish after the terminal write.
    if (snapshot.validation?.stage === "pre_synthesis") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    remoteSessions.set(session.id, snapshot);
    writeTrace.push(
      `session:${snapshot.status}:${snapshot.validation?.stage ?? "none"}`,
    );
  },
  fetchSession: async (id: string) => remoteSessions.get(id) ?? null,
  removeSession: async (id: string) => {
    remoteSessions.delete(id);
  },
  setCancelFlag: async () => {},
  isCancelledRemotely: async (id: string) => remoteCancelled.has(id),
  publishEvent: () => {},
  subscribeEvents: () => () => {},
}));

vi.mock("@/lib/research/run-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research/run-store")>();
  return { ...actual, storePersistentResearchRun };
});

vi.mock("@/lib/research/funnel-analytics", () => ({
  recordResearchFunnelEvent,
}));

describe("completed session persistence", () => {
  beforeEach(() => {
    remoteSessions.clear();
    remoteCancelled.clear();
    persistedRuns.clear();
    writeTrace.length = 0;
    storePersistentResearchRun.mockClear();
    recordResearchFunnelEvent.mockReset();
    recordResearchFunnelEvent.mockResolvedValue(true);
  });

  it("keeps the durable snapshot when stale local state is pruned", async () => {
    const {
      createResearchSession,
      getResearchSession,
      getSessionRetentionMs,
      hydrateSessionFromRedis,
      pruneStaleSessions,
    } = await import("@/lib/research/research-engine");
    const { storeSession } = await import("@/lib/research/session-store");

    const session = createResearchSession("durable report", ["persistence"]);
    session.status = "completed";
    session.updatedAt = new Date(
      Date.now() - getSessionRetentionMs() - 60_000,
    ).toISOString();
    await storeSession(session);

    pruneStaleSessions();

    expect(getResearchSession(session.id)).toBeUndefined();
    await expect(hydrateSessionFromRedis(session.id)).resolves.toMatchObject({
      id: session.id,
      status: "completed",
    });
  });

  it("reads fresher remote state without replacing an active local run object", async () => {
    const {
      createResearchSession,
      getResearchSession,
      hydrateSessionFromRedis,
    } = await import("@/lib/research/research-engine");

    const local = createResearchSession("active run", ["ownership"]);
    local.status = "running";
    local.updatedAt = "2026-06-29T00:00:00.000Z";
    remoteSessions.set(local.id, {
      ...JSON.parse(JSON.stringify(local)),
      status: "completed",
      updatedAt: "2026-06-29T00:01:00.000Z",
    } as ResearchSession);

    await expect(hydrateSessionFromRedis(local.id)).resolves.toMatchObject({
      status: "completed",
    });
    expect(getResearchSession(local.id)).toBe(local);
  });

  it("replaces a pending creation snapshot with a fresher remote run", async () => {
    const {
      createResearchSession,
      getResearchSession,
      hydrateSessionFromRedis,
    } = await import("@/lib/research/research-engine");

    const local = createResearchSession("remote-owned run", ["ownership"]);
    local.updatedAt = "2026-06-29T00:00:00.000Z";
    remoteSessions.set(local.id, {
      ...JSON.parse(JSON.stringify(local)),
      status: "running",
      updatedAt: "2026-06-29T00:01:00.000Z",
    } as ResearchSession);

    await expect(hydrateSessionFromRedis(local.id)).resolves.toMatchObject({
      status: "running",
    });
    expect(getResearchSession(local.id)).not.toBe(local);
    expect(getResearchSession(local.id)?.status).toBe("running");
  });

  it("records completion after all research agents finish", async () => {
    const {
      createResearchSession,
      runResearchSession,
      subscribeToSession,
    } = await import("@/lib/research/research-engine");
    const session = createResearchSession("completed funnel run", ["funnel"]);
    let completeData: unknown;
    const unsubscribe = subscribeToSession(session.id, (event) => {
      if (event.type === "complete") {
        completeData = event.data;
        writeTrace.push("event:complete");
      }
    });

    await runResearchSession(session.id, { speedMultiplier: 1_000 });
    unsubscribe();

    expect(session.status).toBe("completed");
    expect(remoteSessions.get(session.id)).toMatchObject({
      status: "completed",
      validation: { stage: "final" },
    });
    expect(persistedRuns.get(session.id)?.dossier).toMatchObject({
      validation: { stage: "final" },
    });
    expect(completeData).toMatchObject({
      status: "completed",
      validation: { stage: "final" },
      evidence: { version: 1 },
      agents: { synthesis: { status: "done", hasOutput: true } },
    });
    const sessionWrite = writeTrace.lastIndexOf("session:completed:final");
    const runWrite = writeTrace.lastIndexOf("run:completed:final");
    const terminalEvent = writeTrace.lastIndexOf("event:complete");
    expect(sessionWrite).toBeGreaterThanOrEqual(0);
    expect(runWrite).toBeGreaterThanOrEqual(0);
    expect(terminalEvent).toBeGreaterThan(sessionWrite);
    expect(terminalEvent).toBeGreaterThan(runWrite);
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "research_completed",
      session.id,
    );
  });

  it("carries Stage 2 context through completion analytics", async () => {
    const {
      createResearchSession,
      runResearchSession,
    } = await import("@/lib/research/research-engine");
    const stage2 = { stage2Participant: "P01", stage2Batch: "pilot-1" };
    const session = createResearchSession(
      "completed stage2 funnel run",
      ["funnel"],
      undefined,
      { stage2 },
    );

    await runResearchSession(session.id, { speedMultiplier: 1_000 });

    expect(session.status).toBe("completed");
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "research_completed",
      session.id,
      { stage2 },
    );
  });

  it("checkpoints a cancelled session and partial dossier before publishing cancellation", async () => {
    const {
      awaitTerminalCheckpoint,
      cancelSession,
      createResearchSession,
      subscribeToSession,
    } = await import("@/lib/research/research-engine");
    const session = createResearchSession("cancel ordering", ["durability"]);
    session.status = "running";
    session.agents["market-sizer"].status = "done";
    session.agents["market-sizer"].output = { agent: "market-sizer" } as never;
    const unsubscribe = subscribeToSession(session.id, (event) => {
      if (event.type === "cancelled") writeTrace.push("event:cancelled");
    });

    expect(cancelSession(session.id)).toBe(true);
    await awaitTerminalCheckpoint(session.id);
    unsubscribe();

    const sessionWrite = writeTrace.lastIndexOf("session:cancelled:none");
    const runWrite = writeTrace.lastIndexOf("run:cancelled:none");
    const terminalEvent = writeTrace.lastIndexOf("event:cancelled");
    expect(sessionWrite).toBeGreaterThanOrEqual(0);
    expect(runWrite).toBeGreaterThanOrEqual(0);
    expect(terminalEvent).toBeGreaterThan(sessionWrite);
    expect(terminalEvent).toBeGreaterThan(runWrite);
    expect(persistedRuns.get(session.id)?.dossier?.agents["market-sizer"].output)
      .toBeDefined();
  });

  it("terminates Standard within its session budget and persists an honest partial dossier", async () => {
    const originalProvider = process.env.LAUNCHLENS_PROVIDER;
    const originalBudget = process.env.LAUNCHLENS_STANDARD_SESSION_BUDGET_MS;
    process.env.LAUNCHLENS_PROVIDER = "mock";
    process.env.LAUNCHLENS_STANDARD_SESSION_BUDGET_MS = "100";
    try {
      const {
        createResearchSession,
        getStandardSessionBudgetMs,
        runResearchSession,
      } = await import("@/lib/research/research-engine");
      expect(getStandardSessionBudgetMs()).toBe(100);
      const session = createResearchSession("deadline dossier", ["budget"]);
      const started = Date.now();

      await runResearchSession(session.id);

      expect(Date.now() - started).toBeLessThan(2_000);
      expect(session.status).toBe("completed");
      expect(Object.values(session.agents).some((agent) =>
        agent.error?.includes("deadline reached"),
      )).toBe(true);
      expect(Object.values(session.agents).every((agent) => !agent.degraded)).toBe(true);
      expect(remoteSessions.get(session.id)).toMatchObject({
        status: "completed",
        validation: { stage: "final" },
      });
      expect(persistedRuns.get(session.id)?.dossier?.validation?.stage).toBe("final");
    } finally {
      if (originalProvider === undefined) delete process.env.LAUNCHLENS_PROVIDER;
      else process.env.LAUNCHLENS_PROVIDER = originalProvider;
      if (originalBudget === undefined) {
        delete process.env.LAUNCHLENS_STANDARD_SESSION_BUDGET_MS;
      } else {
        process.env.LAUNCHLENS_STANDARD_SESSION_BUDGET_MS = originalBudget;
      }
    }
  });

  it("observes a cross-instance cancel flag while the Standard run is active", async () => {
    const originalProvider = process.env.LAUNCHLENS_PROVIDER;
    process.env.LAUNCHLENS_PROVIDER = "mock";
    try {
      const { createResearchSession, runResearchSession } = await import(
        "@/lib/research/research-engine"
      );
      const session = createResearchSession("remote cancellation", ["redis"]);
      const run = runResearchSession(session.id);
      setTimeout(() => remoteCancelled.add(session.id), 50);

      await run;

      expect(session.status).toBe("cancelled");
      expect(remoteSessions.get(session.id)?.status).toBe("cancelled");
      expect(persistedRuns.get(session.id)?.status).toBe("cancelled");
    } finally {
      if (originalProvider === undefined) delete process.env.LAUNCHLENS_PROVIDER;
      else process.env.LAUNCHLENS_PROVIDER = originalProvider;
    }
  });
});
