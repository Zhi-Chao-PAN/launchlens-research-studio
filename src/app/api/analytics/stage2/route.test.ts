import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { summarizeResearchStage2Funnel } = vi.hoisted(() => ({
  summarizeResearchStage2Funnel: vi.fn(),
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  summarizeResearchStage2Funnel,
}));

import { GET } from "./route";

describe("GET /api/analytics/stage2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Stage 2 research funnel metrics for participant/batch labels", async () => {
    summarizeResearchStage2Funnel.mockResolvedValue({
      configured: true,
      windowDays: 14,
      started: 2,
      completed: 1,
      handoff: 1,
      completionRate: 0.5,
      handoffRate: 1,
      stage2ParticipantTracked: true,
      stage2BatchTracked: true,
    });

    const response = await GET(
      new NextRequest(
        "https://example.test/api/analytics/stage2?participant=P01&batch=pilot-1&days=14",
      ),
    );

    expect(summarizeResearchStage2Funnel).toHaveBeenCalledWith(
      {
        stage2Participant: "P01",
        stage2Batch: "pilot-1",
      },
      14,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      started: 2,
      completed: 1,
      handoff: 1,
    });
  });

  it("rejects requests without a Stage 2 label", async () => {
    const response = await GET(
      new NextRequest("https://example.test/api/analytics/stage2?days=14"),
    );

    expect(response.status).toBe(400);
    expect(summarizeResearchStage2Funnel).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("stage2Participant"),
    });
  });
});
