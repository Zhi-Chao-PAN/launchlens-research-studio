import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => clearRateLimits());

  it("allows requests within capacity", () => {
    const result = checkRateLimit("ip-1", { capacity: 3, refillIntervalMs: 1000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks requests once capacity is exceeded", () => {
    const cfg = { capacity: 2, refillIntervalMs: 1000 };
    expect(checkRateLimit("ip-2", cfg).allowed).toBe(true);
    expect(checkRateLimit("ip-2", cfg).allowed).toBe(true);
    const blocked = checkRateLimit("ip-2", cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("refills the bucket after the interval elapses", () => {
    const cfg = { capacity: 1, refillIntervalMs: 100 };
    const t0 = 1_000_000;
    expect(checkRateLimit("ip-3", cfg, t0).allowed).toBe(true);
    expect(checkRateLimit("ip-3", cfg, t0 + 50).allowed).toBe(false);
    expect(checkRateLimit("ip-3", cfg, t0 + 200).allowed).toBe(true);
  });

  it("isolates buckets per key", () => {
    const cfg = { capacity: 1, refillIntervalMs: 1000 };
    expect(checkRateLimit("ip-a", cfg).allowed).toBe(true);
    expect(checkRateLimit("ip-b", cfg).allowed).toBe(true);
    expect(checkRateLimit("ip-a", cfg).allowed).toBe(false);
  });
});
