import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchSession } from "@/lib/schema/research-schema";
import { buildResearchValidation } from "@/lib/research/validation-ledger";

const {
  deleteSession,
  deleteTerminalDeepResearchSession,
  getResearchSession,
  hydrateSessionFromRedis,
  isRedisConfigured,
  readDeepResearchRecord,
  resolveResearchRun,
} = vi.hoisted(() => ({
  deleteSession: vi.fn(() => true),
  deleteTerminalDeepResearchSession: vi.fn(),
  getResearchSession: vi.fn(),
  hydrateSessionFromRedis: vi.fn(),
  isRedisConfigured: vi.fn(() => false),
  readDeepResearchRecord: vi.fn(),
  resolveResearchRun: vi.fn(),
}));

vi.mock("@/lib/research/research-engine", () => ({
  getResearchSession,
  hydrateSessionFromRedis,
  deleteSession,
}));

vi.mock("@/lib/research/resolve-run", () => ({ resolveResearchRun }));

vi.mock("@/lib/research/redis-client", () => ({
  isRedisConfigured,
}));

vi.mock("@/lib/research/deep-research/runtime", () => ({
  deleteTerminalDeepResearchSession,
  readDeepResearchRecord,
}));

import { DELETE, GET } from "./route";

function deleteRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.test/api/research/session123", {
    method: "DELETE",
    headers: {
      cookie: "csrf_token=test-csrf-token",
      "x-csrf-token": "test-csrf-token",
      ...headers,
    },
  });
}

function session(status: ResearchSession["status"], updatedAt: string): ResearchSession {
  return {
    id: "session123",
    query: "cross-instance state",
    keywords: ["redis"],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt,
    status,
    agents: {} as ResearchSession["agents"],
    citations: [],
  };
}

describe("GET /api/research/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRedisConfigured.mockReturnValue(false);
    resolveResearchRun.mockResolvedValue(null);
  });

  it("recognizes history persisted by another instance after live-state eviction", async () => {
    getResearchSession.mockReturnValue(undefined);
    hydrateSessionFromRedis.mockResolvedValue(undefined);
    resolveResearchRun.mockResolvedValue({ id: "session123" });

    const response = await GET(
      new NextRequest("https://example.test/api/research/session123"),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      sessionId: "session123",
      persistedRunId: "session123",
    });
  });

  it("prefers a fresher Redis snapshot over a stale local pending session", async () => {
    getResearchSession.mockReturnValue(
      session("pending", "2026-06-29T00:00:00.000Z"),
    );
    hydrateSessionFromRedis.mockResolvedValue(
      session("running", "2026-06-29T00:01:00.000Z"),
    );

    const response = await GET(
      new NextRequest("https://example.test/api/research/session123"),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(hydrateSessionFromRedis).toHaveBeenCalledWith("session123");
    expect(body.status).toBe("running");
    expect(body.updatedAt).toBe("2026-06-29T00:01:00.000Z");
  });

  it("returns the optional evidence ledger without breaking legacy sessions", async () => {
    const recovered = session("completed", "2026-06-29T00:02:00.000Z");
    recovered.evidence = {
      version: 1,
      agents: {
        "market-sizer": {
          agentId: "market-sizer",
          retrieval: {
            status: "not_configured",
            sourceOrigin: "none",
            sourceCount: 0,
            sources: [],
          },
          allowlist: {
            policy: "compatible",
            total: 1,
            matched: 0,
            rejected: 0,
            missingUrl: 0,
            retained: 1,
          },
          grounding: "ungrounded",
          updatedAt: recovered.updatedAt,
        },
      },
    };
    recovered.validation = buildResearchValidation(recovered, recovered.updatedAt);
    hydrateSessionFromRedis.mockResolvedValue(recovered);

    const response = await GET(
      new NextRequest("https://example.test/api/research/session123"),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      evidence: {
        version: 1,
        agents: {
          "market-sizer": {
            retrieval: { status: "not_configured" },
            grounding: "ungrounded",
          },
        },
      },
      validation: {
        version: 1,
        stage: "pre_synthesis",
        protocol: { executedPasses: 1, deepMultiPassExecuted: false },
        semanticValidation: { status: "not_run" },
      },
    });
  });
});

describe("DELETE /api/research/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRedisConfigured.mockReturnValue(true);
  });

  it("refuses to orphan an active Deep worker", async () => {
    getResearchSession.mockReturnValue({ ...session("running", "2026-07-13T00:00:00.000Z"), mode: "deep" });
    deleteTerminalDeepResearchSession.mockResolvedValue({
      kind: "active",
      record: { lifecycle: "active" },
    });

    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "DEEP_RUN_ACTIVE" });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("deletes terminal Deep live-state while preserving its history dossier", async () => {
    deleteTerminalDeepResearchSession.mockResolvedValue({
      kind: "deleted",
      record: { lifecycle: "completed" },
    });

    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      deleted: "session123",
      preservedHistory: true,
    });
    expect(deleteSession).toHaveBeenCalledWith("session123");
  });

  it("fails closed when Deep authority cannot be reached", async () => {
    getResearchSession.mockReturnValue({ ...session("running", "2026-07-13T00:00:00.000Z"), mode: "deep" });
    deleteTerminalDeepResearchSession.mockRejectedValue(new Error("redis down"));

    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "DEEP_STATE_UNAVAILABLE" });
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary Bearer token without a valid CSRF proof", async () => {
    const response = await DELETE(
      deleteRequest({
        authorization: "Bearer not-a-real-bypass-token",
        cookie: "",
        "x-csrf-token": "",
      }),
      { params: Promise.resolve({ sessionId: "session123" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "csrf_failed" });
    expect(deleteTerminalDeepResearchSession).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
  });
});
