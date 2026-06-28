import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRedis, zsets } = vi.hoisted(() => ({
  getRedis: vi.fn(),
  zsets: new Map<string, Map<string, number>>(),
}));

vi.mock("./redis-client", () => ({
  getRedis,
}));

import {
  recordResearchFunnelEvent,
  summarizeResearchFunnel,
} from "./funnel-analytics";

function redisFake() {
  return {
    async zadd(key: string, entry: { score: number; member: string }) {
      const set = zsets.get(key) ?? new Map<string, number>();
      set.set(entry.member, entry.score);
      zsets.set(key, set);
      return 1;
    },
    async zcount(key: string, min: number, max: number | string) {
      const upper = max === "+inf" ? Number.POSITIVE_INFINITY : Number(max);
      return Array.from(zsets.get(key)?.values() ?? []).filter(
        (score) => score >= min && score <= upper,
      ).length;
    },
    async zremrangebyscore(key: string, min: number, max: number) {
      const set = zsets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const [member, score] of set) {
        if (score >= min && score <= max) {
          set.delete(member);
          removed += 1;
        }
      }
      return removed;
    },
    async expire() {
      return 1;
    },
  };
}

describe("research funnel analytics", () => {
  beforeEach(() => {
    zsets.clear();
    getRedis.mockReset();
    getRedis.mockReturnValue(redisFake());
  });

  it("counts distinct research journeys and derives completion/handoff rates", async () => {
    const now = new Date("2026-06-29T00:00:00.000Z");
    await recordResearchFunnelEvent("research_started", "session-a", now);
    await recordResearchFunnelEvent("research_completed", "session-a", now);
    await recordResearchFunnelEvent("brief_exported", "session-a", now);
    await recordResearchFunnelEvent("research_started", "session-b", now);

    await expect(summarizeResearchFunnel(30, now)).resolves.toEqual({
      configured: true,
      windowDays: 30,
      started: 2,
      completed: 1,
      handoff: 1,
      completionRate: 0.5,
      handoffRate: 1,
    });
  });

  it("degrades safely when Redis is unavailable", async () => {
    getRedis.mockReturnValue(null);

    await expect(
      recordResearchFunnelEvent("research_started", "session-a"),
    ).resolves.toBe(false);
    await expect(summarizeResearchFunnel()).resolves.toMatchObject({
      configured: false,
      started: 0,
      completed: 0,
      handoff: 0,
    });
  });
});
