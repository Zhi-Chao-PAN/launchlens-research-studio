import { describe, it, expect, beforeEach } from "vitest";
import {
  clearTelemetry,
  getRecentTelemetry,
  recordTelemetry,
  summarizeTelemetry,
} from "./telemetry";

describe("telemetry ring buffer", () => {
  beforeEach(() => clearTelemetry());

  it("records and returns the most recent entries", () => {
    recordTelemetry({ ts: 1, agentId: "market-sizer", providerId: "mock", durationMs: 100, ok: true });
    recordTelemetry({ ts: 2, agentId: "channel-scout", providerId: "openai", durationMs: 200, ok: false, error: "x" });
    const recent = getRecentTelemetry();
    expect(recent.length).toBe(2);
    expect(recent[0].ts).toBe(2);
  });

  it("caps the ring buffer at 200 entries", () => {
    for (let i = 0; i < 250; i++) {
      recordTelemetry({ ts: i, agentId: "a", providerId: "mock", durationMs: 1, ok: true });
    }
    const recent = getRecentTelemetry(500);
    expect(recent.length).toBe(200);
    expect(recent[0].ts).toBe(249);
    expect(recent[recent.length - 1].ts).toBe(50);
  });

  it("summarizes success rate and provider breakdown", () => {
    recordTelemetry({ ts: 1, agentId: "market-sizer", providerId: "mock", durationMs: 100, ok: true });
    recordTelemetry({ ts: 2, agentId: "market-sizer", providerId: "mock", durationMs: 200, ok: false });
    recordTelemetry({ ts: 3, agentId: "synthesis", providerId: "openai", durationMs: 300, ok: true });
    const s = summarizeTelemetry();
    expect(s.total).toBe(3);
    expect(s.cancelled).toBe(0);
    expect(s.failed).toBe(1);
    expect(s.successRate).toBeCloseTo(2 / 3);
    expect(s.averageMs).toBe(200);
    expect(s.byProvider.mock).toEqual({ count: 2, ok: 1, cancelled: 0 });
    expect(s.byProvider.openai).toEqual({ count: 1, ok: 1, cancelled: 0 });
    expect(s.byAgent["market-sizer"].count).toBe(2);
  });

  it("excludes cancelled runs from success rate and tracks cancelled count", () => {
    recordTelemetry({ ts: 1, agentId: "market-sizer", providerId: "openai", durationMs: 50, ok: false, cancelled: true });
    recordTelemetry({ ts: 2, agentId: "market-sizer", providerId: "openai", durationMs: 150, ok: true });
    const s = summarizeTelemetry();
    expect(s.total).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.failed).toBe(0);
    // One real (non-cancelled) run, which succeeded: 1/1 = 100%.
    expect(s.successRate).toBe(1);
    expect(s.byProvider.openai.cancelled).toBe(1);
  });

  it("returns neutral summary on empty ring", () => {
    const s = summarizeTelemetry();
    expect(s.total).toBe(0);
    expect(s.successRate).toBe(1);
    expect(s.averageMs).toBe(0);
  });
});
