// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getResearchRun: vi.fn(() => null),
  getPersistentResearchRun: vi.fn(),
  fetchSession: vi.fn(),
}));

vi.mock("@/lib/research/storage", () => ({
  getResearchRun: mocks.getResearchRun,
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
    mocks.getResearchRun.mockClear();
    mocks.getPersistentResearchRun.mockReset();
    mocks.fetchSession.mockReset();
  });

  it.each([
    "../../package",
    "..%2F..%2Fpackage",
    "..%5C..%5Cpackage",
  ])("rejects traversal-capable run id %s before storage access", async (id) => {
    const res = await GET(makeRequest(`/api/research/runs/${id}`), {
      params: Promise.resolve({ id: decodeURIComponent(id) }),
    });

    expect(res.status).toBe(400);
    expect(mocks.getResearchRun).not.toHaveBeenCalled();
    expect(mocks.getPersistentResearchRun).not.toHaveBeenCalled();
    expect(mocks.fetchSession).not.toHaveBeenCalled();
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
      evidence: {
        version: 1,
        agents: {
          "market-sizer": {
            agentId: "market-sizer",
            retrieval: {
              status: "retrieved",
              sourceOrigin: "agent_retrieval",
              providerId: "tavily",
              sourceCount: 1,
              sources: [{ title: "Source", url: "https://example.com", snippet: "Evidence", id: "s1", accessedAt: "2026-06-29T00:00:00.000Z", retrievedAt: "2026-06-29T00:00:00.000Z", confidence: "high", agent: "market-sizer" }],
            },
            allowlist: { policy: "strict", total: 1, matched: 1, rejected: 0, missingUrl: 0, retained: 1 },
            grounding: "grounded",
            updatedAt: "2026-06-29T00:01:00.000Z",
          },
        },
      },
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
      dossier: {
        version: 1,
        evidence: {
          agents: {
            "market-sizer": {
              retrieval: { status: "retrieved" },
              allowlist: { policy: "strict", matched: 1 },
            },
          },
        },
      },
    });
  });
});
