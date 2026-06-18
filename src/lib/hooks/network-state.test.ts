/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import { readState } from "@/lib/hooks/use-network-state";

describe("readState (use-network-state, round 177)", () => {
  it("defaults to online when navigator is absent (SSR)", () => {
    const s = readState(undefined, 123);
    expect(s.isOnline).toBe(true);
    expect(s.since).toBeNull();
    expect(s.downlink).toBeNull();
  });

  it("reads navigator.onLine", () => {
    const s = readState({ onLine: false } as any, 42);
    expect(s.isOnline).toBe(false);
    expect(s.since).toBe(42);
  });

  it("reads connection info when present", () => {
    const nav = { onLine: true, connection: { downlink: 10, effectiveType: "4g", rtt: 50, saveData: false } } as any;
    const s = readState(nav, 1);
    expect(s.downlink).toBe(10);
    expect(s.effectiveType).toBe("4g");
    expect(s.rtt).toBe(50);
    expect(s.saveData).toBe(false);
  });

  it("gracefully handles missing connection fields", () => {
    const s = readState({ onLine: true } as any, 1);
    expect(s.downlink).toBeNull();
    expect(s.rtt).toBeNull();
    expect(s.saveData).toBe(false);
  });
});
