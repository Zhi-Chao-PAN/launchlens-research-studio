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
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "research_started",
      body.sessionId,
    );
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
        stage2: {
          stage2Participant: "P01",
          stage2Batch: "pilot-1",
        },
      },
    );
  });
});
