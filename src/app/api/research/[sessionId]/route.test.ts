import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchSession } from "@/lib/schema/research-schema";

const { getResearchSession, hydrateSessionFromRedis } = vi.hoisted(() => ({
  getResearchSession: vi.fn(),
  hydrateSessionFromRedis: vi.fn(),
}));

vi.mock("@/lib/research/research-engine", () => ({
  getResearchSession,
  hydrateSessionFromRedis,
  deleteSession: vi.fn(() => true),
}));

vi.mock("@/lib/research/storage", () => ({
  getResearchRun: vi.fn(() => null),
}));

import { GET } from "./route";

function session(status: ResearchSession["status"], updatedAt: string): ResearchSession {
  return {
    id: "session123",
    query: "cross-instance state",
    keywords: ["redis"],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt,
    status,
    agents: {} as ResearchSession["agents"],
    citations: [],
  };
}

describe("GET /api/research/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers a fresher Redis snapshot over a stale local pending session", async () => {
    getResearchSession.mockReturnValue(
      session("pending", "2026-06-29T00:00:00.000Z"),
    );
    hydrateSessionFromRedis.mockResolvedValue(
      session("running", "2026-06-29T00:01:00.000Z"),
    );

    const response = await GET(
      new NextRequest("https://example.test/api/research/session123"),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(hydrateSessionFromRedis).toHaveBeenCalledWith("session123");
    expect(body.status).toBe("running");
    expect(body.updatedAt).toBe("2026-06-29T00:01:00.000Z");
  });
});
