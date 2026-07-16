import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AdoptLegacyShareInput } from "@/lib/research/share-repository";

const {
  checkRateLimitForIp,
  readLegacyPublicRunShare,
  repository,
  resolveResearchRun,
  synchronizeLegacyPublicShareViews,
} = vi.hoisted(() => ({
  checkRateLimitForIp: vi.fn(() => ({ allowed: true, resetMs: 0 })),
  readLegacyPublicRunShare: vi.fn(),
  repository: {
    create: vi.fn(),
    consume: vi.fn(),
    adoptLegacyAndConsume: vi.fn(),
    revoke: vi.fn(),
    listForRun: vi.fn(),
    stats: vi.fn(),
  },
  resolveResearchRun: vi.fn(),
  synchronizeLegacyPublicShareViews: vi.fn(),
}));

vi.mock("@/lib/research/share-repository", () => ({
  getShareRepository: () => repository,
}));
vi.mock("@/lib/research/resolve-run", () => ({ resolveResearchRun }));
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimitForIp }));
vi.mock("@/lib/research/share-tokens", () => ({
  readLegacyPublicRunShare,
  synchronizeLegacyPublicShareViews,
}));

import { GET } from "./route";

function request() {
  return new NextRequest("https://example.test/api/research/share/public_token");
}

function context(token = "public_token") {
  return { params: Promise.resolve({ token }) };
}

function completedRun() {
  return {
    id: "private-run-id",
    query: "APAC research workspace",
    keywords: ["APAC"],
    result: JSON.stringify({
      execSummary: "Private unless selected.",
      opportunityScore: 80,
      riskScore: 30,
      keyInsights: [{ insight: "Private insight", supportingAgents: [], confidence: "high" }],
      topThreeOpportunities: [{ title: "Private opportunity", description: "Private", rationale: "Private" }],
      topThreeRisks: [{ title: "Trust", description: "Evidence matters.", mitigation: "Cite sources." }],
      recommendedNextStep: "Private next step",
      launchlensBrief: "Private launch brief",
      citations: [{ title: "Private source", url: "https://example.com/private" }],
    }),
    sources: [{ title: "Raw private source", url: "https://private.example" }],
    provider: "private-provider",
    model: "private-model",
    createdAt: 10,
    durationMs: 20,
    status: "completed",
    dossier: { private: true },
  };
}

function publicSnapshot() {
  return {
    version: 1 as const,
    query: "APAC research workspace",
    createdAt: 10,
    durationMs: 20,
    status: "completed" as const,
    sections: {
      risks: [{ title: "Trust", description: "Evidence matters.", mitigation: "Cite sources." }],
    },
  };
}

function legacyShare() {
  return {
    runId: "private-run-id",
    manifest: { version: 1, sections: ["risks"] },
    createdAt: 1,
    expiresAt: null,
    views: 1,
    maxViews: null,
  };
}

describe("GET /api/research/share/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitForIp.mockReturnValue({ allowed: true, resetMs: 0 });
    readLegacyPublicRunShare.mockReturnValue(null);
    repository.consume.mockResolvedValue({ ...legacyShare(), report: publicSnapshot() });
    resolveResearchRun.mockResolvedValue(completedRun());
  });

  it("returns only the selected allowlisted projection and never echoes capabilities", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.report).toEqual({
      version: 1,
      query: "APAC research workspace",
      createdAt: 10,
      durationMs: 20,
      status: "completed",
      sections: {
        risks: [{ title: "Trust", description: "Evidence matters.", mitigation: "Cite sources." }],
      },
    });
    expect(body.share).toEqual({
      views: 1,
      maxViews: null,
      expiresAt: null,
      sections: ["risks"],
    });
    expect(JSON.stringify(body)).not.toContain("private-run-id");
    expect(JSON.stringify(body)).not.toContain("Private launch brief");
    expect(JSON.stringify(body)).not.toContain("private-provider");
    expect(body.share.token).toBeUndefined();
    expect(resolveResearchRun).not.toHaveBeenCalled();
  });

  it("keeps returning the creation-time snapshot after the source run changes or expires", async () => {
    resolveResearchRun.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ report: publicSnapshot() });
    expect(resolveResearchRun).not.toHaveBeenCalled();
  });

  it("does not resolve a report when the capability is missing, expired, revoked, or maxed", async () => {
    repository.consume.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(resolveResearchRun).not.toHaveBeenCalled();
  });

  it("projects and atomically migrates an eligible plaintext legacy token", async () => {
    repository.consume.mockResolvedValue(null);
    readLegacyPublicRunShare.mockReturnValue({
      run: completedRun(),
      share: {
        runId: "private-run-id",
        createdAt: 1,
        expiresAt: null,
        views: 4,
        maxViews: 10,
      },
    });
    repository.adoptLegacyAndConsume.mockImplementation(async (input: AdoptLegacyShareInput) => ({
      runId: input.runId,
      manifest: input.manifest,
      report: input.report,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      views: 5,
      maxViews: input.maxViews,
    }));

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    const migration = repository.adoptLegacyAndConsume.mock.calls[0][0];
    expect(migration).toMatchObject({
      token: "public_token",
      runId: "private-run-id",
      views: 4,
      maxViews: 10,
    });
    expect(migration.manifest.sections).toEqual([
      "summary", "scores", "insights", "opportunities", "risks", "nextStep", "sources",
    ]);
    expect(JSON.stringify(migration.report)).not.toContain("private-provider");
    expect(JSON.stringify(migration.report)).not.toContain("private-model");
    expect(JSON.stringify(migration.report)).not.toContain("private-run-id");
    expect(synchronizeLegacyPublicShareViews).toHaveBeenCalledWith("public_token", 5);
    expect(JSON.stringify(await response.json())).not.toContain("private-provider");
  });

  it("returns not found when the referenced report has expired", async () => {
    repository.consume.mockResolvedValue(legacyShare());
    resolveResearchRun.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
  });

  it("resolves the run only for a legacy record without a snapshot", async () => {
    repository.consume.mockResolvedValue(legacyShare());

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(resolveResearchRun).toHaveBeenCalledWith("private-run-id");
    await expect(response.json()).resolves.toMatchObject({ report: publicSnapshot() });
  });

  it("fails closed when durable share storage is unavailable", async () => {
    repository.consume.mockRejectedValue(Object.assign(new Error("down"), {
      name: "ShareRepositoryUnavailableError",
    }));

    const response = await GET(request(), context());

    expect(response.status).toBe(503);
    expect(resolveResearchRun).not.toHaveBeenCalled();
  });

  it("rate limits public capability consumption before spending a view", async () => {
    checkRateLimitForIp.mockReturnValue({ allowed: false, resetMs: 12_000 });

    const response = await GET(request(), context());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(repository.consume).not.toHaveBeenCalled();
  });
});
