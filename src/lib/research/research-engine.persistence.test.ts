import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchSession } from "@/lib/schema/research-schema";

const { remoteSessions, recordResearchFunnelEvent } = vi.hoisted(() => ({
  remoteSessions: new Map<string, ResearchSession>(),
  recordResearchFunnelEvent: vi.fn(),
}));

vi.mock("@/lib/research/session-store", () => ({
  storeSession: async (session: ResearchSession) => {
    remoteSessions.set(
      session.id,
      JSON.parse(JSON.stringify(session)) as ResearchSession,
    );
  },
  fetchSession: async (id: string) => remoteSessions.get(id) ?? null,
  removeSession: async (id: string) => {
    remoteSessions.delete(id);
  },
  setCancelFlag: async () => {},
  isCancelledRemotely: async () => false,
  publishEvent: () => {},
  subscribeEvents: () => () => {},
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  recordResearchFunnelEvent,
}));

describe("completed session persistence", () => {
  beforeEach(() => {
    remoteSessions.clear();
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

  it("records completion after all research agents finish", async () => {
    const {
      createResearchSession,
      runResearchSession,
    } = await import("@/lib/research/research-engine");
    const session = createResearchSession("completed funnel run", ["funnel"]);

    await runResearchSession(session.id, { speedMultiplier: 1_000 });

    expect(session.status).toBe("completed");
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
});
