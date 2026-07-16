import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordResearchFunnelEvent, summarizeResearchFunnel } = vi.hoisted(() => ({
  recordResearchFunnelEvent: vi.fn(),
  summarizeResearchFunnel: vi.fn(),
}));

const { requireAdmin } = vi.hoisted(() => ({
  requireAdmin: vi.fn(() => ({ ok: true, tokenHash: "admin", ip: "127.0.0.1" })),
}));

vi.mock("@/lib/research/funnel-analytics", () => ({
  recordResearchFunnelEvent,
  RESEARCH_FUNNEL_EVENTS: ["workspace_viewed", "deep_selected", "query_filled", "research_started", "research_completed", "share_created", "brief_exported"],
  summarizeResearchFunnel,
}));
vi.mock("@/lib/api/require-admin", () => ({ requireAdmin }));
vi.mock("@/lib/api/csrf-guard", () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimitForIp: vi.fn(() => ({ allowed: true, remaining: 59, resetMs: 0 })) }));

import { GET, POST } from "./route";

describe("GET /api/analytics/funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockReturnValue({ ok: true, tokenHash: "admin", ip: "127.0.0.1" });
  });

  it("returns aggregate-only funnel metrics for the requested window", async () => {
    summarizeResearchFunnel.mockResolvedValue({
      configured: true,
      windowDays: 14,
      started: 10,
      completed: 8,
      handoff: 4,
      completionRate: 0.8,
      handoffRate: 0.5,
      viewed: 12,
      deepSelected: 4,
      queryFilled: 9,
      shared: 2,
      deepSelectionRate: 0.33,
      queryFillRate: 0.75,
      startRate: 0.8,
      shareRate: 0.25,
      modes: {
        standard: { selected: 0, queryFilled: 5, started: 6, completed: 5, shared: 1, completionRate: 0.83, shareRate: 0.2 },
        deep: { selected: 4, queryFilled: 4, started: 4, completed: 3, shared: 1, completionRate: 0.75, shareRate: 0.33 },
      },
    });

    const response = await GET(
      new NextRequest("https://example.test/api/analytics/funnel?days=14"),
    );

    expect(summarizeResearchFunnel).toHaveBeenCalledWith(14);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      started: 10,
      completed: 8,
      handoff: 4,
    });
  });

  it("accepts a bounded anonymous client event without exposing its journey id", async () => {
    recordResearchFunnelEvent.mockResolvedValue(true);
    const response = await POST(
      new NextRequest("https://example.test/api/analytics/funnel", {
        method: "POST",
        body: JSON.stringify({
          event: "deep_selected",
          journeyId: "journey-1234567890",
          mode: "deep",
        }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ recorded: true });
    expect(recordResearchFunnelEvent).toHaveBeenCalledWith(
      "deep_selected",
      "journey-1234567890",
      { mode: "deep" },
    );
  });

  it("rejects malformed funnel payloads before touching Redis", async () => {
    const response = await POST(
      new NextRequest("https://example.test/api/analytics/funnel", {
        method: "POST",
        body: JSON.stringify({ event: "query_filled", journeyId: "short" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(recordResearchFunnelEvent).not.toHaveBeenCalled();
  });
});
