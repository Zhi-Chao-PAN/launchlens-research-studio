import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  checkRateLimitForIp,
  createShareToken,
  getSharesForRun,
  resolveResearchRun,
  revokeShareToken,
  rotateCsrf,
  verifyCsrf,
} = vi.hoisted(() => ({
  checkRateLimitForIp: vi.fn(() => ({ allowed: true, resetMs: 0 })),
  createShareToken: vi.fn(() => ({
    token: "share-token",
    createdAt: 1,
    expiresAt: null,
    maxViews: null,
  })),
  getSharesForRun: vi.fn(),
  resolveResearchRun: vi.fn(),
  revokeShareToken: vi.fn(() => true),
  rotateCsrf: vi.fn((response: Response) => response),
  verifyCsrf: vi.fn(() => null),
}));

vi.mock("@/lib/api/csrf-guard", () => ({ verifyCsrf }));
vi.mock("@/lib/api/csrf-rotate", () => ({ rotateCsrf }));
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimitForIp }));
vi.mock("@/lib/research/resolve-run", () => ({ resolveResearchRun }));
vi.mock("@/lib/research/share-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research/share-tokens")>();
  return { ...actual, createShareToken, getSharesForRun, revokeShareToken };
});

vi.mock("@/lib/api/bypass-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bypass-tokens")>();
  return {
    ...actual,
    extractBearerToken: (header: string | null) => {
      const match = header?.match(/^Bearer\s+(.+)$/i);
      return match ? match[1].trim() : null;
    },
    getTokenInfo: (token: string) => {
      if (token === "share-admin") {
        return { hash: "admin-hash", scope: "admin" as const, createdAt: 1, usageCount: 0 };
      }
      if (token === "share-bypass") {
        return { hash: "bypass-hash", scope: "bypass" as const, createdAt: 1, usageCount: 0 };
      }
      return null;
    },
    isAdminToken: (token: string) => token === "share-admin",
    checkAdminRateLimit: () => ({ allowed: true, remaining: 10, resetMs: 0 }),
  };
});

import { DELETE, GET, POST } from "./route";

function postRequest(): Request {
  return new Request("https://example.test/api/research/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId: "run-123" }),
  });
}

function getRequest(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = `Bearer ${auth}`;
  return new NextRequest("https://example.test/api/research/share?runId=run-123", { headers });
}

describe("POST /api/research/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cancelled reports before creating a token", async () => {
    resolveResearchRun.mockResolvedValue({ id: "run-123", status: "cancelled" });

    const response = await POST(postRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Only completed research reports can be shared.",
      runId: "run-123",
      status: "cancelled",
    });
    expect(createShareToken).not.toHaveBeenCalled();
  });

  it("still creates tokens for completed reports", async () => {
    resolveResearchRun.mockResolvedValue({ id: "run-123", status: "completed" });

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(createShareToken).toHaveBeenCalledWith("run-123", {
      expiresInMs: undefined,
      maxViews: undefined,
    });
  });
});

describe("GET /api/research/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSharesForRun.mockReturnValue([
      {
        token: "secret-bearer-token",
        runId: "run-123",
        createdAt: 1,
        expiresAt: null,
        views: 2,
        maxViews: 10,
        revoked: false,
        passwordHash: "stored-password-hash",
        name: "Customer share",
      },
    ]);
  });

  it("rejects anonymous share enumeration", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(getSharesForRun).not.toHaveBeenCalled();
  });

  it("rejects bypass-only credentials", async () => {
    const response = await GET(getRequest("share-bypass"));
    expect(response.status).toBe(401);
    expect(getSharesForRun).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary bearer string", async () => {
    const response = await GET(getRequest("not-a-registered-token"));
    expect(response.status).toBe(401);
    expect(getSharesForRun).not.toHaveBeenCalled();
  });

  it("returns only redacted share metadata to an admin", async () => {
    const response = await GET(getRequest("share-admin"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shares).toEqual([
      expect.objectContaining({
        shareId: expect.stringMatching(/^[a-f0-9]{64}$/),
        runId: "run-123",
        hasPassword: true,
        name: "Customer share",
      }),
    ]);
    expect(body.shares[0].token).toBeUndefined();
    expect(body.shares[0].passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret-bearer-token");
    expect(JSON.stringify(body)).not.toContain("stored-password-hash");
  });
});

describe("DELETE /api/research/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves bearer-capability revocation without an admin credential", async () => {
    const response = await DELETE(new Request(
      "https://example.test/api/research/share?token=share-capability",
      { method: "DELETE" },
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revoked: true });
    expect(revokeShareToken).toHaveBeenCalledWith("share-capability");
  });
});
