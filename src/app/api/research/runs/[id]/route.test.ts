// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/research/storage", () => ({
  getResearchRun: vi.fn(() => null),
}));

const mocks = vi.hoisted(() => ({
  getPersistentResearchRun: vi.fn(),
  fetchSession: vi.fn(),
}));

vi.mock("@/lib/research/run-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/research/run-store")>()),
  getPersistentResearchRun: mocks.getPersistentResearchRun,
  storePersistentResearchRun: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/research/session-store", () => ({
  fetchSession: mocks.fetchSession,
}));

import { GET } from "./route";

function makeRequest(path: string) {
  return new NextRequest(new Request(`http://localhost${path}`));
}

describe("GET /api/research/runs/[id]", () => {
  beforeEach(() => {
    mocks.getPersistentResearchRun.mockReset();
    mocks.fetchSession.mockReset();
  });

  it("falls back to Redis-persisted completed runs when local storage misses", async () => {
    mocks.getPersistentResearchRun.mockResolvedValue({
      id: "redis-run-1",
      query: "Recovered from Redis",
      keywords: ["redis", "report"],
      result: "{\"summary\":\"ok\"}",
      provider: "minimax",
      model: "MiniMax-M3",
      createdAt: 1700000000000,
      durationMs: 12000,
      status: "completed",
      sources: [{ title: "Source", url: "https://example.com" }],
    });

    const res = await GET(makeRequest("/api/research/runs/redis-run-1"), {
      params: Promise.resolve({ id: "redis-run-1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: "redis-run-1",
      query: "Recovered from Redis",
      status: "completed",
    });
  });

  it("recovers a terminal Redis session snapshot when the run index has not been written yet", async () => {
    mocks.getPersistentResearchRun.mockResolvedValue(null);
    mocks.fetchSession.mockResolvedValue({
      id: "session-only-1",
      query: "Session only report",
      keywords: ["session"],
      providerId: "openai",
      providerModel: "MiniMax-M3",
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:01:00.000Z",
      status: "completed",
      citations: [{ title: "Source", url: "https://example.com", snippet: "Evidence", id: "s1", accessedAt: "2026-06-29T00:00:00.000Z", confidence: "high", agent: "synthesis" }],
      agents: {
        "market-sizer": { status: "done", progress: 100 },
        "competitor-analyst": { status: "done", progress: 100 },
        "pain-detective": { status: "done", progress: 100 },
        "pricing-scout": { status: "done", progress: 100 },
        "channel-scout": { status: "done", progress: 100 },
        synthesis: { status: "done", progress: 100, output: { summary: "Recovered synthesis" } },
      },
    });

    const res = await GET(makeRequest("/api/research/runs/session-only-1"), {
      params: Promise.resolve({ id: "session-only-1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: "session-only-1",
      query: "Session only report",
      provider: "openai",
      status: "completed",
    });
  });
});
