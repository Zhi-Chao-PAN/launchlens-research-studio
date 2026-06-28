import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { summarizeResearchFunnel } = vi.hoisted(() => ({
  summarizeResearchFunnel: vi.fn(),
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  summarizeResearchFunnel,
}));

import { GET } from "./route";

describe("GET /api/analytics/funnel", () => {
  it("returns aggregate-only funnel metrics for the requested window", async () => {
    summarizeResearchFunnel.mockResolvedValue({
      configured: true,
      windowDays: 14,
      started: 10,
      completed: 8,
      handoff: 4,
      completionRate: 0.8,
      handoffRate: 0.5,
    });

    const response = await GET(
      new NextRequest("https://example.test/api/analytics/funnel?days=14"),
    );

    expect(summarizeResearchFunnel).toHaveBeenCalledWith(14);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      started: 10,
      completed: 8,
      handoff: 4,
    });
  });
});
