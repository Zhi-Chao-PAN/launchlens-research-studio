import { beforeEach, describe, expect, it, vi } from "vitest";

const { isRedisConfigured, readDeepResearchRecord } = vi.hoisted(() => ({
  isRedisConfigured: vi.fn(() => false),
  readDeepResearchRecord: vi.fn(),
}));

vi.mock("@/lib/research/redis-client", () => ({
  getRedis: vi.fn(() => null),
  isRedisConfigured,
}));
vi.mock("@/lib/research/deep-research/runtime", () => ({ readDeepResearchRecord }));

import { GET } from "./route";
import {
  createResearchSession,
  deleteSession,
} from "@/lib/research/research-engine";

describe("research session stream terminal snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRedisConfigured.mockReturnValue(false);
  });

  it("includes final outputs, evidence, validation, and timestamps on complete", async () => {
    const session = createResearchSession("terminal SSE", ["ordering"]);
    session.status = "completed";
    session.updatedAt = "2026-07-13T10:05:00.000Z";
    session.agents.synthesis.status = "done";
    session.agents.synthesis.progress = 100;
    session.agents.synthesis.output = {
      agent: "synthesis",
      execSummary: "Final snapshot",
      citations: [],
    } as never;
    session.validation = {
      version: 1,
      generatedAt: session.updatedAt,
      stage: "final",
    } as never;

    try {
      const response = await GET(
        new Request(`http://localhost/api/research/${session.id}/stream`),
        { params: Promise.resolve({ sessionId: session.id }) },
      );
      const body = await response.text();
      const match = /event: complete\ndata: (.+)\n\n/.exec(body);

      expect(match).not.toBeNull();
      const payload = JSON.parse(match![1]);
      expect(payload).toMatchObject({
        status: "completed",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        validation: { stage: "final" },
        evidence: { version: 1 },
        agents: {
          synthesis: {
            status: "done",
            progress: 100,
            hasOutput: true,
            output: { execSummary: "Final snapshot" },
          },
        },
      });
    } finally {
      deleteSession(session.id);
    }
  });

  it("returns retryable 503 instead of permanent not-found when Redis authority fails", async () => {
    isRedisConfigured.mockReturnValue(true);
    readDeepResearchRecord.mockRejectedValue(new Error("redis unavailable"));

    const response = await GET(
      new Request("http://localhost/api/research/0123456789abcdef0123456789abcdef/stream"),
      { params: Promise.resolve({ sessionId: "0123456789abcdef0123456789abcdef" }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "DEEP_STATE_UNAVAILABLE",
      retryable: true,
    });
  });

  it("rotates a Deep observer stream before the serverless timeout window", async () => {
    vi.useFakeTimers();
    isRedisConfigured.mockReturnValue(true);
    readDeepResearchRecord.mockResolvedValue(null);
    const session = createResearchSession(
      "deep observer rotation",
      [],
      undefined,
      { mode: "deep" },
    );

    try {
      const response = await GET(
        new Request(`http://localhost/api/research/${session.id}/stream`),
        { params: Promise.resolve({ sessionId: session.id }) },
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      await vi.advanceTimersByTimeAsync(240_000);
      let next = "";
      for (let index = 0; index < 64 && !next.includes("event: reconnect"); index += 1) {
        const chunk = await reader.read();
        if (chunk.done) break;
        next += decoder.decode(chunk.value, { stream: true });
      }

      expect(next).toContain("event: state");
      expect(next).toContain("event: reconnect");
    } finally {
      deleteSession(session.id);
      vi.useRealTimers();
    }
  });
});
