import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getResearchSession,
  hydrateSessionFromRedis,
  isRedisConfigured,
  readDeepResearchRecord,
  toLaunchLensBrief,
  recordResearchFunnelEvent,
} =
  vi.hoisted(() => ({
    getResearchSession: vi.fn(),
    hydrateSessionFromRedis: vi.fn(),
    isRedisConfigured: vi.fn(() => false),
    readDeepResearchRecord: vi.fn(),
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

vi.mock("@/lib/research/redis-client", () => ({ isRedisConfigured }));

vi.mock("@/lib/research/deep-research/runtime", () => ({ readDeepResearchRecord }));

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
    isRedisConfigured.mockReturnValue(false);
  });

  it("exports from the authoritative completed Deep record", async () => {
    isRedisConfigured.mockReturnValue(true);
    readDeepResearchRecord.mockResolvedValue({
      lifecycle: "completed",
      session: { id: "session123", status: "completed", mode: "deep" },
    });
    hydrateSessionFromRedis.mockResolvedValue(undefined);
    getResearchSession.mockReturnValue(undefined);

    const response = await GET(
      new NextRequest("https://example.test/api/research/session123/brief"),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(200);
    expect(toLaunchLensBrief).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session123", mode: "deep" }),
    );
    expect(hydrateSessionFromRedis).not.toHaveBeenCalled();
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

  it("rejects export for a cancelled session without recording a handoff", async () => {
    getResearchSession.mockReturnValue(undefined);
    hydrateSessionFromRedis.mockResolvedValue({
      id: "session123",
      status: "cancelled",
    });

    const response = await GET(
      new NextRequest(
        "https://example.test/api/research/session123/brief",
      ),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        sessionId: "session123",
        status: "cancelled",
      }),
    );
    expect(toLaunchLensBrief).not.toHaveBeenCalled();
    expect(recordResearchFunnelEvent).not.toHaveBeenCalled();
  });
});
