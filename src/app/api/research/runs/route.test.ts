// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// We need the NextRequest constructor shim from the global setup.
import { NextRequest } from "next/server";

const { verifyCsrf, rotateCsrf, checkRateLimit, checkRateLimitForIp } = vi.hoisted(() => ({
  verifyCsrf: vi.fn(() => null as Response | null),
  rotateCsrf: vi.fn((response: Response) => response),
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, resetMs: 0 })),
  checkRateLimitForIp: vi.fn(() => ({ allowed: true, remaining: 10, resetMs: 0 })),
}));

vi.mock("@/lib/api/csrf-guard", () => ({ verifyCsrf }));
vi.mock("@/lib/api/csrf-rotate", () => ({ rotateCsrf }));
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimit, checkRateLimitForIp }));

// Exercise the real requireAdmin() helper against a deterministic token
// registry: a bypass-only credential must not authorize collection access.
vi.mock("@/lib/api/bypass-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bypass-tokens")>();
  return {
    ...actual,
    extractBearerToken: (header: string | null) => {
      const match = header?.match(/^Bearer\s+(.+)$/i);
      return match ? match[1].trim() : null;
    },
    getTokenInfo: (token: string) => {
      if (token === "runs-admin") {
        return { hash: "admin-hash", scope: "admin" as const, createdAt: 1, usageCount: 0 };
      }
      if (token === "runs-bypass") {
        return { hash: "bypass-hash", scope: "bypass" as const, createdAt: 1, usageCount: 0 };
      }
      return null;
    },
    isAdminToken: (token: string) => token === "runs-admin",
    checkAdminRateLimit: () => ({ allowed: true, remaining: 10, resetMs: 0 }),
  };
});

// Mock the storage layer so we don't depend on disk/in-memory state.
vi.mock("@/lib/research/storage", () => ({
  searchResearchRuns: vi.fn(() => ({
    runs: [
      {
        id: "r1",
        query: "AI tools",
        keywords: ["ai", "tools"],
        status: "completed",
        provider: "openai",
        model: "MiniMax-M3",
        createdAt: 1700000000000,
        durationMs: 12345,
        sources: [{ id: "s1" }],
      },
    ],
    total: 1,
  })),
  getResearchStorageInfo: vi.fn(() => ({
    enabled: true,
    inMemoryCount: 1,
    maxMemoryRuns: 50,
  })),
  exportRuns: vi.fn((format: string) => `exported-${format}`),
  bulkDeleteRuns: vi.fn(() => 1),
}));

vi.mock("@/lib/research/run-store", () => ({
  searchPersistentResearchRuns: vi.fn(() =>
    Promise.resolve({
      runs: [
        {
          id: "redis-run-1",
          query: "Redis persisted research",
          keywords: ["redis", "history"],
          status: "completed",
          provider: "minimax",
          model: "MiniMax-M3",
          createdAt: 1700000001000,
          durationMs: 23456,
          sources: [{ title: "Source", url: "https://example.com" }],
        },
      ],
      total: 1,
    }),
  ),
  deletePersistentResearchRuns: vi.fn(() => Promise.resolve(0)),
}));

import { GET, DELETE } from "./route";

function makeRequest(path: string, opts: { method?: string; auth?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = `Bearer ${opts.auth}`;
  return new NextRequest(new Request(`http://localhost${path}`, { method: opts.method ?? "GET", headers }));
}

describe("/api/research/runs GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous collection enumeration", async () => {
    const res = await GET(makeRequest("/api/research/runs?limit=20"));
    expect(res.status).toBe(401);
  });

  it("rejects bypass-only credentials", async () => {
    const res = await GET(makeRequest("/api/research/runs?q=private", { auth: "runs-bypass" }));
    expect(res.status).toBe(401);
  });

  it("rejects an arbitrary bearer string", async () => {
    const res = await GET(makeRequest("/api/research/runs", { auth: "not-a-registered-token" }));
    expect(res.status).toBe(401);
  });

  it("does not let a valid admin token bypass the pre-authentication IP limit", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetMs: 30_000 });

    const res = await GET(makeRequest("/api/research/runs", { auth: "runs-admin" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(checkRateLimit).toHaveBeenCalledWith(
      "admin:ip:anonymous",
      { capacity: 30, refillIntervalMs: 60_000 },
    );
  });

  it("returns summary list with an admin token", async () => {
    const res = await GET(makeRequest("/api/research/runs?limit=20", { auth: "runs-admin" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]).toMatchObject({
      id: "redis-run-1",
      query: "Redis persisted research",
      status: "completed",
    });
    expect(body.runs[1]).toMatchObject({
      id: "r1",
      query: "AI tools",
      status: "completed",
    });
    expect(body.total).toBe(2);
    expect(body.storage).toBeDefined();
  });

  it("does not leak full sources array in summary response", async () => {
    const res = await GET(makeRequest("/api/research/runs?limit=20", { auth: "runs-admin" }));
    const body = await res.json();
    // hasSources boolean is included; raw sources array is not.
    expect(body.runs[0].hasSources).toBe(true);
    expect(body.runs[0].sources).toBeUndefined();
    expect(body.runs[1].hasSources).toBe(true);
    expect(body.runs[1].sources).toBeUndefined();
  });

  it("returns 401 for format=json export without admin token", async () => {
    const res = await GET(makeRequest("/api/research/runs?format=json"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for format=csv export without admin token", async () => {
    const res = await GET(makeRequest("/api/research/runs?format=csv"));
    expect(res.status).toBe(401);
  });

  it("returns 200 for format=json with an admin token", async () => {
    const res = await GET(makeRequest("/api/research/runs?format=json", { auth: "runs-admin" }));
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("exported-json");
  });
});

describe("/api/research/runs DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous bulk deletion before touching the store", async () => {
    const res = await DELETE(makeRequest("/api/research/runs?ids=r1", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("rejects bypass-only credentials for bulk deletion", async () => {
    const res = await DELETE(makeRequest("/api/research/runs?ids=r1", {
      method: "DELETE",
      auth: "runs-bypass",
    }));
    expect(res.status).toBe(401);
  });

  it("still requires CSRF after admin authorization", async () => {
    verifyCsrf.mockReturnValueOnce(new Response(JSON.stringify({ error: "csrf" }), { status: 403 }));
    const res = await DELETE(makeRequest("/api/research/runs?ids=r1", {
      method: "DELETE",
      auth: "runs-admin",
    }));
    expect(res.status).toBe(403);
  });

  it("deletes requested runs when both admin auth and CSRF succeed", async () => {
    const res = await DELETE(makeRequest("/api/research/runs?ids=r1", {
      method: "DELETE",
      auth: "runs-admin",
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: 1, total: 1 });
  });
});
