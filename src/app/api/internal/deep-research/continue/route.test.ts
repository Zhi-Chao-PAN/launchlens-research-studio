import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scheduled: [] as Array<() => Promise<void> | void>,
  signal: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => {
      state.scheduled.push(callback);
    }),
  };
});

vi.mock("@/lib/research/deep-research/runtime", () => ({
  createDeepResearchService: () => ({ signal: state.signal }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const secret = "worker-secret-at-least-24-characters";

function request(suppliedSecret: string, body: unknown = { sessionId: "abc123" }) {
  return new NextRequest("https://studio.example/api/internal/deep-research/continue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-launchlens-deep-worker-secret": suppliedSecret,
      "x-vercel-id": "iad1::worker-1",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.LAUNCHLENS_DEEP_WORKER_SECRET = secret;
  state.scheduled.length = 0;
  state.signal.mockReset().mockResolvedValue({ kind: "committed" });
});

afterEach(() => {
  delete process.env.LAUNCHLENS_DEEP_WORKER_SECRET;
});

describe("Deep Research internal continuation route", () => {
  it("acknowledges quickly and runs the durable stage through after()", async () => {
    const response = await POST(request(secret));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, sessionId: "abc123" });
    expect(state.signal).not.toHaveBeenCalled();
    expect(state.scheduled).toHaveLength(1);

    await state.scheduled[0]();
    expect(state.signal).toHaveBeenCalledWith({
      kind: "continue",
      sessionId: "abc123",
      workerId: "iad1::worker-1",
    });
  });

  it("rejects unauthorized and malformed work without scheduling", async () => {
    expect((await POST(request("wrong-secret"))).status).toBe(401);
    expect((await POST(request(secret, { sessionId: "../bad" }))).status).toBe(400);
    expect(state.scheduled).toHaveLength(0);
  });
});
