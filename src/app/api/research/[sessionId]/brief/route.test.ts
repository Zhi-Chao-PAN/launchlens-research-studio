import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResearchSession,
  hydrateSessionFromRedis,
  toLaunchLensBrief,
  recordResearchFunnelEvent,
} =
  vi.hoisted(() => ({
    getResearchSession: vi.fn(),
    hydrateSessionFromRedis: vi.fn(),
    recordResearchFunnelEvent: vi.fn(),
    toLaunchLensBrief: vi.fn((value: { status: string }) => ({
      sourceStatus: value.status,
    })),
  }));

vi.mock("@/lib/research/research-engine", () => ({
  getResearchSession,
  hydrateSessionFromRedis,
}));

vi.mock("@/lib/research/storage", () => ({
  getResearchRun: vi.fn(() => null),
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  recordResearchFunnelEvent,
}));

vi.mock("@/lib/export/brief-mapper", () => ({
  toLaunchLensBrief,
  serializeBrief: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/research/[sessionId]/brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports from the fresher Redis snapshot when local state is stale", async () => {
    getResearchSession.mockReturnValue({ id: "session123", status: "pending" });
    hydrateSessionFromRedis.mockResolvedValue({
      id: "session123",
      status: "completed",
    });

    const response = await GET(
      new NextRequest(
        "https://example.test/api/research/session123/brief",
      ),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(200);
    expect(hydrateSessionFromRedis).toHaveBeenCalledWith("session123");
    expect(toLaunchLensBrief).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "brief_exported",
      "session123",
    );
    await expect(response.json()).resolves.toEqual({
      sourceStatus: "completed",
    });
  });

  it("carries Stage 2 context into the handoff milestone", async () => {
    const stage2Tracking = {
      stage2Participant: "P01",
      stage2Batch: "pilot-1",
    };
    getResearchSession.mockReturnValue(undefined);
    hydrateSessionFromRedis.mockResolvedValue({
      id: "session123",
      status: "completed",
      stage2Tracking,
    });

    const response = await GET(
      new NextRequest(
        "https://example.test/api/research/session123/brief",
      ),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(200);
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "brief_exported",
      "session123",
      { stage2: stage2Tracking },
    );
  });
});
