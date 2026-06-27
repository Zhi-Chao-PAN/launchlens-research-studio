// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the admin-token registry so requireAdmin() lets the admin token through
// and rejects missing/invalid tokens.
vi.mock("@/lib/api/bypass-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bypass-tokens")>();
  return {
    ...actual,
    isBypassToken: () => false,
    isAdminToken: (token: string) => token === "telemetry-admin",
    extractBearerToken: (header: string | null) => {
      if (!header) return "";
      return header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
    },
    getTokenInfo: (token: string) =>
      token === "telemetry-admin"
        ? { id: "telemetry-admin", scope: "admin" as const, createdAt: Date.now() }
        : null,
    checkAdminRateLimit: () => ({ allowed: true, remaining: Infinity, resetMs: 0 }),
  };
});

import { GET } from "./route";

function makeRequest(opts: { auth?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = `Bearer ${opts.auth}`;
  return new NextRequest(new Request("http://localhost/api/telemetry", { method: "GET", headers }));
}

describe("/api/telemetry GET (R226)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without an admin token (401)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns the full operational payload with an admin token", async () => {
    const res = await GET(makeRequest({ auth: "telemetry-admin" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Core telemetry fields (pre-R226).
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("breakers");
    expect(body).toHaveProperty("recent");
    expect(body).toHaveProperty("requests");
    // R226 additions: rate-limit config + storage + dashboard stats.
    expect(body.rateLimit).toMatchObject({ capacity: expect.any(Number), refillIntervalMs: expect.any(Number) });
    expect(body.storage).toMatchObject({ enabled: expect.any(Boolean), inMemoryCount: expect.any(Number), maxMemoryRuns: expect.any(Number) });
    expect(body.dashboard).toMatchObject({ totalRuns: expect.any(Number), recentRuns: expect.any(Number), byStatus: expect.any(Object) });
  });

  it("summary has the expected shape (total, successRate, averageMs)", async () => {
    const res = await GET(makeRequest({ auth: "telemetry-admin" }));
    const body = await res.json();
    expect(body.summary).toMatchObject({
      total: expect.any(Number),
      successRate: expect.any(Number),
      averageMs: expect.any(Number),
      byProvider: expect.any(Object),
      byAgent: expect.any(Object),
    });
  });

  it("rateLimit reflects the env-tuned config", async () => {
    const { refreshResearchRateLimitConfig, getResearchRateLimitConfig } = await import("@/lib/api/rate-limit");
    const prevCap = process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY;
    process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = "7";
    refreshResearchRateLimitConfig();
    try {
      const res = await GET(makeRequest({ auth: "telemetry-admin" }));
      const body = await res.json();
      expect(body.rateLimit.capacity).toBe(7);
      expect(body.rateLimit).toEqual(getResearchRateLimitConfig());
    } finally {
      if (prevCap === undefined) delete process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY;
      else process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = prevCap;
      refreshResearchRateLimitConfig();
    }
  });
});
