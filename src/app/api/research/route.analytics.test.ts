import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { recordResearchFunnelEvent } = vi.hoisted(() => ({
  recordResearchFunnelEvent: vi.fn(),
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  recordResearchFunnelEvent,
}));

import { clearRateLimits } from "@/lib/api/rate-limit";
import { POST } from "./route";

describe("POST /api/research product events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    recordResearchFunnelEvent.mockResolvedValue(true);
  });

  it("records a start milestone only after a valid session is created", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/research", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "test-csrf",
          cookie: "csrf_token=test-csrf",
        },
        body: JSON.stringify({
          query: "AI evidence workspace for product research teams",
          keywords: ["AI", "research"],
          mode: "standard",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.mode).toBe("standard");
    expect(body.modeCapabilities.availability).toBe("available");
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "research_started",
      body.sessionId,
      { mode: "standard", stage2: undefined },
    );
  });

  it("rejects an unknown mode before creating a session", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/research", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "test-csrf",
          cookie: "csrf_token=test-csrf",
        },
        body: JSON.stringify({ query: "AI research workspace", mode: "turbo" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.field).toBe("mode");
    expect(recordResearchFunnelEvent).not.toHaveBeenCalled();
  });

  it("recognizes Deep Research but refuses to fake it on the 300-second path", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/research", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "test-csrf",
          cookie: "csrf_token=test-csrf",
        },
        body: JSON.stringify({ query: "AI research workspace", mode: "deep" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "RESEARCH_MODE_UNAVAILABLE",
      field: "mode",
      mode: "deep",
      modeCapabilities: {
        availability: "preview",
        requiresAsyncExecution: true,
        maxSynchronousDurationSec: 300,
      },
    });
    expect(body.error).toMatch(/async/i);
    expect(recordResearchFunnelEvent).not.toHaveBeenCalled();
  });

  it("attaches sanitized Stage 2 context to the start milestone", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/research?stage2Participant=P01&stage2Batch=pilot-1",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": "test-csrf",
            cookie: "csrf_token=test-csrf",
          },
          body: JSON.stringify({
            query: "AI evidence workspace for product research teams",
            keywords: ["AI", "research"],
          }),
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "research_started",
      body.sessionId,
      {
        mode: "standard",
        stage2: {
          stage2Participant: "P01",
          stage2Batch: "pilot-1",
        },
      },
    );
  });
});
