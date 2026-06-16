import { describe, it, expect, beforeEach } from "vitest";
import {
  clearBreakers,
  isOpen,
  recordFailure,
  recordSuccess,
  snapshotBreakers,
} from "./circuit-breaker";

describe("circuit breaker", () => {
  beforeEach(() => clearBreakers());

  it("starts closed", () => {
    expect(isOpen("p")).toBe(false);
  });

  it("opens after threshold consecutive failures", () => {
    const cfg = { threshold: 3, cooldownMs: 1000 };
    expect(recordFailure("p", cfg)).toBe(false);
    expect(recordFailure("p", cfg)).toBe(false);
    expect(recordFailure("p", cfg)).toBe(true);
    expect(isOpen("p", cfg)).toBe(true);
  });

  it("a single success resets the failure count", () => {
    const cfg = { threshold: 3, cooldownMs: 1000 };
    recordFailure("p", cfg);
    recordFailure("p", cfg);
    recordSuccess("p");
    expect(recordFailure("p", cfg)).toBe(false);
    expect(isOpen("p", cfg)).toBe(false);
  });

  it("half-opens after cooldown elapses", () => {
    const cfg = { threshold: 2, cooldownMs: 100 };
    recordFailure("p", cfg, 1000);
    recordFailure("p", cfg, 1010);
    expect(isOpen("p", cfg, 1050)).toBe(true);
    expect(isOpen("p", cfg, 1200)).toBe(false);
  });

  it("snapshot reports per-provider state", () => {
    const cfg = { threshold: 2, cooldownMs: 1000 };
    recordFailure("a", cfg);
    recordFailure("b", cfg);
    recordFailure("b", cfg);
    const s = snapshotBreakers();
    expect(s.a).toEqual({ failures: 1, open: false, openedAt: null });
    expect(s.b.open).toBe(true);
    expect(s.b.failures).toBe(2);
  });
});
