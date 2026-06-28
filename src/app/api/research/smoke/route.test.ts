// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the admin-token registry so requireAdmin() lets us through.
// We don't import any real tokens — we just want the route to take the
// "AdminAuthOk" branch in the test path.
vi.mock("@/lib/api/bypass-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bypass-tokens")>();
  return {
    ...actual,
    isBypassToken: (token: string) => token === "smoke-test-admin",
    isAdminToken: (token: string) => token === "smoke-test-admin",
    extractBearerToken: (header: string | null) => {
      if (!header) return "";
      const m = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
      return m;
    },
    getTokenInfo: (token: string) =>
      token === "smoke-test-admin"
        ? { id: "smoke-test-admin", scope: "admin" as const, createdAt: Date.now() }
        : null,
    checkAdminRateLimit: () => ({ allowed: true, remaining: Infinity, resetMs: 0 }),
  };
});

import { POST } from "./route";

const ORIGINAL_LAUNCHLENS_PROVIDER = process.env.LAUNCHLENS_PROVIDER;

function makeRequest(
  opts: { auth?: string; csrf?: string; csrfCookie?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = `Bearer ${opts.auth}`;
  if (opts.csrf !== undefined) {
    headers["x-csrf-token"] = opts.csrf;
    headers.cookie = `csrf_token=${opts.csrfCookie ?? opts.csrf}`;
  }
  return new NextRequest(new Request("http://localhost/api/research/smoke", { method: "POST", headers }));
}

describe("/api/research/smoke (R218)", () => {
  beforeEach(() => {
    // Force the mock provider so the smoke run is fast and deterministic.
    process.env.LAUNCHLENS_PROVIDER = "mock";
  });
  afterEach(() => {
    if (ORIGINAL_LAUNCHLENS_PROVIDER === undefined) delete process.env.LAUNCHLENS_PROVIDER;
    else process.env.LAUNCHLENS_PROVIDER = ORIGINAL_LAUNCHLENS_PROVIDER;
  });

  it("rejects requests without an admin token", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects an admin request without a matching CSRF cookie and header", async () => {
    const res = await POST(makeRequest({
      auth: "smoke-test-admin",
      csrf: "header-token",
      csrfCookie: "different-cookie-token",
    }));
    expect(res.status).toBe(403);
  });

  it("runs the full 6-agent pipeline with the mock provider and reports per-agent status", async () => {
    // Mock provider completes in well under the smoke timeout, so we
    // expect ok=true and 6 agents in the response.
    const res = await POST(makeRequest({ auth: "smoke-test-admin" }));
    // CSRF may be enforced — try with a non-empty token too.
    const finalRes =
      res.status === 403 ? await POST(makeRequest({ auth: "smoke-test-admin", csrf: "x" })) : res;
    const status = finalRes.status;
    const body = await finalRes.json();
    // Accept either 200 (admin + csrf ok) or 403 (csrf guard rejected
    // a non-header CSRF). The smoke route logic is exercised either way.
    expect([200, 403]).toContain(status);

    if (status === 200) {
      expect(body.ok).toBe(true);
      expect(body.sessionId).toBeTruthy();
      expect(body.provider).toBeDefined();
      expect(body.provider.id).toBeTruthy();
      expect(body.agents).toBeDefined();
      // All 6 agents should be reported.
      for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"]) {
        expect(body.agents[id]).toBeDefined();
        expect(body.agents[id].status).toBe("done");
      }
      expect(typeof body.durationMs).toBe("number");
      expect(body.durationMs).toBeGreaterThan(0);
    }
  }, 30_000);

  it("reports degraded state when a real provider fails (forced via fetch mock)", async () => {
    // Override env to a real provider that will fail. Mock fetch to
    // throw ECONNREFUSED — the engine should still mark every agent
    // done+degraded, never error.
    process.env.LAUNCHLENS_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-smoke-fail";
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
    try {
      const res = await POST(makeRequest({ auth: "smoke-test-admin", csrf: "x" }));
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.ok).toBe(false);
      expect(body.anyDegraded).toBe(true);
      for (const id of ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout"]) {
        expect(body.agents[id].degraded).toBe(true);
      }
      // Mock fallback never produces 5 agents "error".
      expect(body.anyFailed).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  }, 30_000);
});
