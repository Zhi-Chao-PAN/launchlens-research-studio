import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, checkRateLimitForIp, clearRateLimits, getResearchRateLimitConfig, refreshResearchRateLimitConfig, checkResearchRateLimit } from "./rate-limit";

vi.mock("./trusted-ips", () => ({ isTrustedIp: (ip: string) => ip === "10.0.0.1" }));

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

  it("uses default 10/60s config when none supplied", () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit("ip-default").allowed).toBe(true);
    expect(checkRateLimit("ip-default").allowed).toBe(false);
  });

  it("resetMs is bounded within (0, refillIntervalMs] on fresh window", () => {
    const cfg = { capacity: 2, refillIntervalMs: 5000 };
    const r = checkRateLimit("ip-reset", cfg, 1_000_000);
    expect(r.resetMs).toBeGreaterThan(0);
    expect(r.resetMs).toBeLessThanOrEqual(5000);
  });

  it("returns remaining = capacity - 1 after first hit", () => {
    const cfg = { capacity: 5, refillIntervalMs: 1000 };
    expect(checkRateLimit("ip-rem", cfg, 0).remaining).toBe(4);
  });

  it("does not throw or grant tokens under clock skew (now < lastRefill)", () => {
    const cfg = { capacity: 1, refillIntervalMs: 1000 };
    expect(checkRateLimit("ip-skew", cfg, 5000).allowed).toBe(true);
    const r = checkRateLimit("ip-skew", cfg, 1000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe("checkRateLimitForIp", () => {
  beforeEach(() => clearRateLimits());

  it("isolation is per IP (keyed by ip:<addr>)", () => {
    for (let i = 0; i < 10; i++) checkRateLimitForIp("1.2.3.4");
    expect(checkRateLimitForIp("1.2.3.4").allowed).toBe(false);
    expect(checkRateLimitForIp("1.2.3.5").allowed).toBe(true);
  });

  it("bypasses limits and sets bypassed=true for trusted IPs", () => {
    const cfg = { capacity: 1, refillIntervalMs: 60_000 };
    expect(checkRateLimitForIp("10.0.0.1", cfg).allowed).toBe(true);
    const second = checkRateLimitForIp("10.0.0.1", cfg);
    expect(second.allowed).toBe(true);
    expect(second.bypassed).toBe(true);
    expect(second.remaining).toBe(Infinity);
    expect(second.resetMs).toBe(0);
  });

  it("leaves bypassed unset for untrusted IPs", () => {
    expect(checkRateLimitForIp("8.8.8.8").bypassed).toBeUndefined();
  });
});

describe("clearRateLimits", () => {
  it("resets all buckets", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("k1");
    expect(checkRateLimit("k1").allowed).toBe(false);
    clearRateLimits();
    expect(checkRateLimit("k1").allowed).toBe(true);
  });
});

describe("research rate-limit env config (R225)", () => {
  beforeEach(() => {
    clearRateLimits();
    delete process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY;
    delete process.env.LAUNCHLENS_RATE_LIMIT_REFILL_MS;
    refreshResearchRateLimitConfig();
  });

  it("defaults to 10 capacity / 60000ms when env unset", () => {
    const cfg = getResearchRateLimitConfig();
    expect(cfg.capacity).toBe(10);
    expect(cfg.refillIntervalMs).toBe(60_000);
  });

  it("reads capacity + refill from env", () => {
    process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = "3";
    process.env.LAUNCHLENS_RATE_LIMIT_REFILL_MS = "5000";
    refreshResearchRateLimitConfig();
    const cfg = getResearchRateLimitConfig();
    expect(cfg.capacity).toBe(3);
    expect(cfg.refillIntervalMs).toBe(5000);
  });

  it("clamps capacity to >= 1 and refill to >= 1000ms", () => {
    process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = "0";
    process.env.LAUNCHLENS_RATE_LIMIT_REFILL_MS = "100";
    refreshResearchRateLimitConfig();
    const cfg = getResearchRateLimitConfig();
    expect(cfg.capacity).toBe(1);
    expect(cfg.refillIntervalMs).toBe(1000);
  });

  it("ignores non-numeric env values and falls back to defaults", () => {
    process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = "abc";
    process.env.LAUNCHLENS_RATE_LIMIT_REFILL_MS = "";
    refreshResearchRateLimitConfig();
    const cfg = getResearchRateLimitConfig();
    expect(cfg.capacity).toBe(10);
    expect(cfg.refillIntervalMs).toBe(60_000);
  });

  it("checkResearchRateLimit applies the env-tuned config", () => {
    process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY = "2";
    refreshResearchRateLimitConfig();
    expect(checkResearchRateLimit("99.99.99.99").allowed).toBe(true);
    expect(checkResearchRateLimit("99.99.99.99").allowed).toBe(true);
    expect(checkResearchRateLimit("99.99.99.99").allowed).toBe(false);
  });
});
