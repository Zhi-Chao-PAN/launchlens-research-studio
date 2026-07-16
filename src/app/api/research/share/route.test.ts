import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  checkRateLimit,
  checkRateLimitForIp,
  resolveResearchRun,
  revokeShareToken,
  rotateCsrf,
  shareRepository,
  verifyCsrf,
  recordResearchFunnelEvent,
} = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, resetMs: 0 })),
  checkRateLimitForIp: vi.fn(() => ({ allowed: true, resetMs: 0 })),
  resolveResearchRun: vi.fn(),
  revokeShareToken: vi.fn(() => false),
  rotateCsrf: vi.fn((response: Response) => response),
  shareRepository: {
    create: vi.fn(),
    consume: vi.fn(),
    revokeLegacy: vi.fn(),
    revoke: vi.fn(),
    listForRun: vi.fn(),
    stats: vi.fn(),
  },
  verifyCsrf: vi.fn(() => null),
  recordResearchFunnelEvent: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/api/csrf-guard", () => ({ verifyCsrf }));
vi.mock("@/lib/api/csrf-rotate", () => ({ rotateCsrf }));
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimit, checkRateLimitForIp }));
vi.mock("@/lib/research/resolve-run", () => ({ resolveResearchRun }));
vi.mock("@/lib/research/share-repository", () => ({
  getShareRepository: () => shareRepository,
}));
vi.mock("@/lib/research/share-tokens", () => ({ revokeShareToken }));
vi.mock("@/lib/research/funnel-analytics", () => ({ recordResearchFunnelEvent }));

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

function completedRun() {
  return {
    id: "run-123",
    status: "completed",
    query: "APAC research workspace",
    keywords: ["APAC"],
    result: JSON.stringify({
      execSummary: "Promising market.",
      opportunityScore: 80,
      riskScore: 30,
      keyInsights: [],
      topThreeOpportunities: [],
      topThreeRisks: [],
      recommendedNextStep: "Interview founders.",
      citations: [],
    }),
    provider: "private",
    model: "private",
    createdAt: 1,
    durationMs: 2,
  };
}

function postRequest(body: Record<string, unknown> = { runId: "run-123" }): Request {
  return new Request("https://example.test/api/research/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
    shareRepository.create.mockResolvedValue({
      token: "share-token",
      manageToken: "manage-token",
      runId: "run-123",
      sections: ["summary", "scores", "insights", "opportunities", "risks", "nextStep", "sources"],
      createdAt: 1,
      expiresAt: null,
      views: 0,
      maxViews: null,
    });
    recordResearchFunnelEvent.mockClear();
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
    expect(shareRepository.create).not.toHaveBeenCalled();
  });

  it("creates separately managed tokens for completed reports and defaults to all sections", async () => {
    resolveResearchRun.mockResolvedValue(completedRun());

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(shareRepository.create).toHaveBeenCalledWith({
      runId: "run-123",
      manifest: {
        version: 1,
        sections: ["summary", "scores", "insights", "opportunities", "risks", "nextStep", "sources"],
      },
      report: {
        version: 1,
        query: "APAC research workspace",
        createdAt: 1,
        durationMs: 2,
        status: "completed",
        sections: {
          summary: "Promising market.",
          scores: { opportunityScore: 80, riskScore: 30 },
          insights: [],
          opportunities: [],
          risks: [],
          nextStep: "Interview founders.",
          sources: [],
        },
      },
      expiresInMs: undefined,
      maxViews: undefined,
    });
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "share_created",
      "run-123",
      { mode: undefined },
    );
    await expect(response.json()).resolves.toMatchObject({
      token: "share-token",
      manageToken: "manage-token",
    });
  });

  it("stores the creator's canonical section selection", async () => {
    resolveResearchRun.mockResolvedValue(completedRun());

    const response = await POST(postRequest({
      runId: "run-123",
      sections: ["risks", "summary", "risks"],
    }));

    expect(response.status).toBe(200);
    expect(shareRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      manifest: { version: 1, sections: ["summary", "risks"] },
      report: expect.objectContaining({
        query: "APAC research workspace",
        sections: {
          summary: "Promising market.",
          risks: [],
        },
      }),
    }));
  });

  it("rejects a share with no selected content", async () => {
    resolveResearchRun.mockResolvedValue(completedRun());

    const response = await POST(postRequest({ runId: "run-123", sections: [] }));

    expect(response.status).toBe(400);
    expect(shareRepository.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/research/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shareRepository.listForRun.mockResolvedValue([
      {
        shareId: "a".repeat(64),
        runId: "run-123",
        manifest: { version: 1, sections: ["summary"] },
        createdAt: 1,
        expiresAt: null,
        views: 2,
        maxViews: 10,
        revoked: false,
      },
    ]);
  });

  it("rejects anonymous share enumeration", async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(401);
    expect(shareRepository.listForRun).not.toHaveBeenCalled();
  });

  it("rejects bypass-only credentials", async () => {
    const response = await GET(getRequest("share-bypass"));
    expect(response.status).toBe(401);
    expect(shareRepository.listForRun).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary bearer string", async () => {
    const response = await GET(getRequest("not-a-registered-token"));
    expect(response.status).toBe(401);
    expect(shareRepository.listForRun).not.toHaveBeenCalled();
  });

  it("does not let a valid admin token bypass the pre-authentication IP limit", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetMs: 30_000 });

    const response = await GET(getRequest("share-admin"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(checkRateLimit).toHaveBeenCalledWith(
      "admin:ip:anonymous",
      { capacity: 30, refillIntervalMs: 60_000 },
    );
    expect(shareRepository.listForRun).not.toHaveBeenCalled();
  });

  it("returns only redacted share metadata to an admin", async () => {
    const response = await GET(getRequest("share-admin"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shares).toEqual([
      expect.objectContaining({
        shareId: expect.stringMatching(/^[a-f0-9]{64}$/),
        runId: "run-123",
        manifest: { version: 1, sections: ["summary"] },
      }),
    ]);
    expect(body.shares[0].token).toBeUndefined();
    expect(body.shares[0].manageTokenHash).toBeUndefined();
  });
});

describe("DELETE /api/research/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeShareToken.mockReturnValue(false);
    shareRepository.revokeLegacy.mockResolvedValue(true);
    shareRepository.revoke.mockResolvedValue(true);
  });

  it("rejects revocation with the public token alone", async () => {
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "share-capability" }),
      },
    ));
    expect(response.status).toBe(401);
    expect(shareRepository.revoke).not.toHaveBeenCalled();
  });

  it("lets the creator revoke with the independent management token", async () => {
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "share-capability", manageToken: "manage-capability" }),
      },
    ));
    expect(response.status).toBe(200);
    expect(shareRepository.revoke).toHaveBeenCalledWith("share-capability", {
      kind: "manager",
      manageToken: "manage-capability",
    });
  });

  it("lets an authenticated administrator revoke without the management token", async () => {
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer share-admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "share-capability" }),
      },
    ));
    expect(response.status).toBe(200);
    expect(revokeShareToken).toHaveBeenCalledWith("share-capability");
    expect(shareRepository.revokeLegacy).toHaveBeenCalledWith("share-capability");
    expect(shareRepository.revoke).not.toHaveBeenCalled();
  });

  it("blocks the migration path when an administrator revokes a legacy token", async () => {
    revokeShareToken.mockReturnValueOnce(true);
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer share-admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "legacy-share-capability" }),
      },
    ));

    expect(response.status).toBe(200);
    expect(shareRepository.revokeLegacy).toHaveBeenCalledWith("legacy-share-capability");
    expect(shareRepository.revoke).not.toHaveBeenCalled();
  });

  it("writes a durable tombstone when the admin instance has no local legacy state", async () => {
    revokeShareToken.mockReturnValueOnce(false);
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer share-admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "legacy-on-another-instance" }),
      },
    ));

    expect(response.status).toBe(200);
    expect(shareRepository.revokeLegacy).toHaveBeenCalledWith("legacy-on-another-instance");
  });

  it("falls back to ordinary admin revocation after the legacy window", async () => {
    shareRepository.revokeLegacy.mockResolvedValueOnce(false);
    shareRepository.revoke.mockResolvedValueOnce(true);
    const response = await DELETE(new NextRequest(
      "https://example.test/api/research/share",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer share-admin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "new-share-after-cutoff" }),
      },
    ));

    expect(response.status).toBe(200);
    expect(shareRepository.revoke).toHaveBeenCalledWith(
      "new-share-after-cutoff",
      { kind: "admin" },
    );
  });
});
