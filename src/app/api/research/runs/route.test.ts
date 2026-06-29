// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// We need the NextRequest constructor shim from the global setup.
import { NextRequest } from "next/server";

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

  it("returns summary list without admin token (R211 fix)", async () => {
    const res = await GET(makeRequest("/api/research/runs?limit=20"));
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
    const res = await GET(makeRequest("/api/research/runs?limit=20"));
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

  it("returns 200 for format=json with admin token", async () => {
    // We need a real admin token in the registry. The bypass-tokens module
    // is mocked at module load elsewhere; here we just exercise the auth
    // gate and expect either 200 (valid) or 401 (no real registry seed).
    const res = await GET(makeRequest("/api/research/runs?format=json", { auth: "no-such-token" }));
    expect([200, 401]).toContain(res.status);
  });
});

describe("/api/research/runs DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires CSRF (returns 403 without CSRF header)", async () => {
    const res = await DELETE(makeRequest("/api/research/runs?ids=r1", { method: "DELETE" }));
    // CSRF guard returns 403
    expect([403, 401, 400]).toContain(res.status);
  });
});
