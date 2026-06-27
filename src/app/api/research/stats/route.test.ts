// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the storage layer so the route test is deterministic and isolated.
vi.mock("@/lib/research/storage", () => ({
  getDashboardStats: vi.fn(() => ({
    totalRuns: 3,
    recentRuns: 2,
    totalDurationMs: 180000,
    byStatus: { completed: 2, failed: 1, cancelled: 0 },
  })),
  getResearchStorageInfo: vi.fn(() => ({
    enabled: true,
    inMemoryCount: 3,
    maxMemoryRuns: 50,
  })),
}));

import { GET } from "./route";

function makeRequest(path: string) {
  return new NextRequest(new Request(`http://localhost${path}`, { method: "GET" }));
}

describe("/api/research/stats GET (R224)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pre-aggregated stats with a tiny payload", async () => {
    const res = await GET(makeRequest("/api/research/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRuns).toBe(3);
    expect(body.recentRuns).toBe(2);
    expect(body.totalDurationMin).toBe(3); // 180000ms = 3 min
    expect(body.byStatus).toEqual({ completed: 2, failed: 1, cancelled: 0 });
    expect(body.storage).toMatchObject({ enabled: true, inMemoryCount: 3 });
    // No `runs` array shipped — confirms the payload is aggregated, not a row list.
    expect(Array.isArray(body.runs)).toBe(false);
  });

  it("passes a sinceMs window to getDashboardStats when ?since is provided", async () => {
    const { getDashboardStats } = await import("@/lib/research/storage");
    await GET(makeRequest("/api/research/stats?since=3600000"));
    expect(getDashboardStats).toHaveBeenCalledWith(3600000);
  });

  it("clamps an out-of-range ?since to [1h, 90d]", async () => {
    const { getDashboardStats } = await import("@/lib/research/storage");
    // Too small (1 second) -> clamped to 1 hour.
    await GET(makeRequest("/api/research/stats?since=1000"));
    expect(getDashboardStats).toHaveBeenLastCalledWith(60 * 60 * 1000);

    // Too large (1 year) -> clamped to 90 days.
    await GET(makeRequest("/api/research/stats?since=31536000000"));
    expect(getDashboardStats).toHaveBeenLastCalledWith(90 * 24 * 60 * 60 * 1000);
  });

  it("defaults to a 7-day window when ?since is absent", async () => {
    const { getDashboardStats } = await import("@/lib/research/storage");
    await GET(makeRequest("/api/research/stats"));
    expect(getDashboardStats).toHaveBeenLastCalledWith(7 * 24 * 60 * 60 * 1000);
  });
});
