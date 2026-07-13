import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  probeDeepResearchCapability: vi.fn(),
  reserveDeepResearchAdmission: vi.fn(),
  releaseDeepResearchAdmission: vi.fn(),
  startDeepResearchSession: vi.fn(),
}));

vi.mock("@/lib/research/deep-research/capability", () => ({
  probeDeepResearchCapability: mocks.probeDeepResearchCapability,
}));

vi.mock("@/lib/research/deep-research/admission", () => ({
  reserveDeepResearchAdmission: mocks.reserveDeepResearchAdmission,
  releaseDeepResearchAdmission: mocks.releaseDeepResearchAdmission,
}));

vi.mock("@/lib/research/deep-research/runtime", () => ({
  startDeepResearchSession: mocks.startDeepResearchSession,
}));

import { clearRateLimits } from "@/lib/api/rate-limit";
import { POST } from "./route";

const capability = {
  id: "deep",
  mode: "deep",
  availability: "available",
  label: "Deep Research",
  description: "Durable deep research",
  expectedDurationMinutes: { min: 15, max: 30 },
  agentFanout: 5,
  validationPasses: 3,
  requiresAsyncExecution: true,
  maxSynchronousDurationSec: 300,
  capabilityNotice: "Deep Research is available.",
  requirements: [],
};

function request(mode: "standard" | "deep" = "deep") {
  return new NextRequest("http://localhost/api/research", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": "test-csrf",
      "x-forwarded-for": "203.0.113.24",
      cookie: "csrf_token=test-csrf",
    },
    body: JSON.stringify({
      query: "Evidence-backed AI market research workspace",
      mode,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearRateLimits();
  mocks.probeDeepResearchCapability.mockResolvedValue(capability);
  mocks.reserveDeepResearchAdmission.mockResolvedValue({
    allowed: true,
    reservationExpiresAt: Date.now() + 3_600_000,
    config: {},
  });
  mocks.releaseDeepResearchAdmission.mockResolvedValue(true);
  mocks.startDeepResearchSession.mockImplementation(async (session) => ({
    record: { session: { ...session, status: "running" } },
    created: true,
    wakeAccepted: true,
  }));
});

describe("POST /api/research Deep admission", () => {
  it("starts Deep only after durable admission succeeds", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.mode).toBe("deep");
    expect(mocks.reserveDeepResearchAdmission).toHaveBeenCalledWith(
      "203.0.113.24",
      body.sessionId,
    );
    expect(mocks.startDeepResearchSession).toHaveBeenCalledTimes(1);
    expect(mocks.releaseDeepResearchAdmission).not.toHaveBeenCalled();
  });

  it("returns an actionable 429 when the client budget is exhausted", async () => {
    mocks.reserveDeepResearchAdmission.mockResolvedValue({
      allowed: false,
      reason: "client_daily_limit",
      retryAfterMs: 90_000,
      config: {},
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(body).toMatchObject({
      code: "DEEP_CLIENT_DAILY_LIMIT",
      mode: "deep",
      retryable: true,
      retryAfterMs: 90_000,
    });
    expect(mocks.startDeepResearchSession).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when durable admission storage is unavailable", async () => {
    mocks.reserveDeepResearchAdmission.mockResolvedValue({
      allowed: false,
      reason: "storage_unavailable",
      retryAfterMs: 60_000,
      config: {},
    });

    const response = await POST(request());
    await expect(response.json()).resolves.toMatchObject({
      code: "DEEP_ADMISSION_UNAVAILABLE",
      retryable: true,
    });
    expect(response.status).toBe(503);
    expect(mocks.startDeepResearchSession).not.toHaveBeenCalled();
  });

  it("releases the reservation when durable Deep creation fails", async () => {
    mocks.startDeepResearchSession.mockRejectedValue(new Error("create failed"));

    const response = await POST(request());
    const body = await response.json();
    const sessionId = mocks.startDeepResearchSession.mock.calls[0][0].id;

    expect(response.status).toBe(503);
    expect(body.code).toBe("DEEP_RESEARCH_START_FAILED");
    expect(mocks.releaseDeepResearchAdmission).toHaveBeenCalledWith(sessionId);
  });

  it("leaves Standard mode independent of the Deep admission store", async () => {
    const response = await POST(request("standard"));

    expect(response.status).toBe(201);
    expect(mocks.reserveDeepResearchAdmission).not.toHaveBeenCalled();
    expect(mocks.startDeepResearchSession).not.toHaveBeenCalled();
  });
});
