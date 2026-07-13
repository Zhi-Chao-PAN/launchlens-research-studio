// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  awaitTerminalCheckpoint,
  cancelSession,
  getResearchSession,
  hydrateSessionFromRedis,
  trace,
} = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    awaitTerminalCheckpoint: vi.fn(async () => {
      calls.push("checkpoint");
    }),
    cancelSession: vi.fn(() => {
      calls.push("cancel");
      return true;
    }),
    getResearchSession: vi.fn(),
    hydrateSessionFromRedis: vi.fn(),
    trace: calls,
  };
});

vi.mock("@/lib/research/research-engine", () => ({
  awaitTerminalCheckpoint,
  cancelSession,
  getResearchSession,
  hydrateSessionFromRedis,
}));
vi.mock("@/lib/api/csrf-guard", () => ({ verifyCsrf: () => null }));
vi.mock("@/lib/api/csrf-rotate", () => ({ rotateCsrf: (response: Response) => response }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimitForIp: () => ({ allowed: true, resetMs: 0 }),
}));

import { POST } from "./route";

function request(): NextRequest {
  return new NextRequest("https://example.test/api/research/session123/cancel", {
    method: "POST",
  });
}

describe("POST /api/research/[sessionId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trace.length = 0;
  });

  it("rejects malformed ids before touching the session stores", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ sessionId: "../session123" }),
    });

    expect(response.status).toBe(400);
    expect(getResearchSession).not.toHaveBeenCalled();
    expect(hydrateSessionFromRedis).not.toHaveBeenCalled();
  });

  it("reconciles a pending local snapshot and awaits the terminal checkpoint", async () => {
    getResearchSession.mockReturnValue({ id: "session123", status: "pending" });
    hydrateSessionFromRedis.mockResolvedValue({ id: "session123", status: "running" });

    const response = await POST(request(), {
      params: Promise.resolve({ sessionId: "session123" }),
    });

    expect(response.status).toBe(200);
    expect(hydrateSessionFromRedis).toHaveBeenCalledWith("session123");
    expect(cancelSession).toHaveBeenCalledWith("session123");
    expect(awaitTerminalCheckpoint).toHaveBeenCalledWith("session123");
    expect(trace).toEqual(["cancel", "checkpoint"]);
  });

  it("hydrates a session that is absent on the request instance", async () => {
    getResearchSession.mockReturnValue(undefined);
    hydrateSessionFromRedis.mockResolvedValue({ id: "session123", status: "running" });

    const response = await POST(request(), {
      params: Promise.resolve({ sessionId: "session123" }),
    });

    expect(response.status).toBe(200);
    expect(cancelSession).toHaveBeenCalledWith("session123");
  });

  it("treats an already-cancelled session as an idempotent success", async () => {
    getResearchSession.mockReturnValue({ id: "session123", status: "cancelled" });

    const response = await POST(request(), {
      params: Promise.resolve({ sessionId: "session123" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      sessionId: "session123",
      status: "cancelled",
      idempotent: true,
    });
    expect(cancelSession).not.toHaveBeenCalled();
  });

  it.each(["completed", "error"])(
    "returns a conflict with the actual %s status",
    async (status) => {
      getResearchSession.mockReturnValue({ id: "session123", status });

      const response = await POST(request(), {
        params: Promise.resolve({ sessionId: "session123" }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        sessionId: "session123",
        status,
      });
      expect(cancelSession).not.toHaveBeenCalled();
    },
  );

  it("does not claim cancellation when completion wins the race", async () => {
    getResearchSession
      .mockReturnValueOnce({ id: "session123", status: "running" })
      .mockReturnValueOnce({ id: "session123", status: "completed" });
    hydrateSessionFromRedis.mockResolvedValue({ id: "session123", status: "running" });
    cancelSession.mockReturnValueOnce(false);

    const response = await POST(request(), {
      params: Promise.resolve({ sessionId: "session123" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      status: "completed",
    });
    expect(awaitTerminalCheckpoint).not.toHaveBeenCalled();
  });
});
