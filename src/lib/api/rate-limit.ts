import { isTrustedIp } from "./trusted-ips";
// Per-key token bucket rate limiter.
// Default: 10 requests per 60 seconds per IP. Used by the research POST
// endpoint to prevent runaway cost on real providers. Memory-only and
// process-local; a future round can swap in Redis if horizontal scale
// becomes a concern.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  capacity: number;
  refillIntervalMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  capacity: 10,
  refillIntervalMs: 60_000,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {},
  now: number = Date.now(),
): RateLimitResult {
  const cfg: RateLimitConfig = {
    capacity: config.capacity ?? DEFAULT_CONFIG.capacity,
    refillIntervalMs: config.refillIntervalMs ?? DEFAULT_CONFIG.refillIntervalMs,
  };
  const bucket = buckets.get(key) ?? { tokens: cfg.capacity, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= cfg.refillIntervalMs) {
    bucket.tokens = cfg.capacity;
    bucket.lastRefill = now;
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: bucket.tokens,
      resetMs: cfg.refillIntervalMs - (now - bucket.lastRefill),
    };
  }
  buckets.set(key, bucket);
  return {
    allowed: false,
    remaining: 0,
    resetMs: cfg.refillIntervalMs - (now - bucket.lastRefill),
  };
}

/**
 * Check rate limit for an IP, with trusted IP bypass.
 * Returns { allowed: true, bypassed: true } for trusted IPs.
 */
export function checkRateLimitForIp(
  ip: string,
  config?: Partial<RateLimitConfig>,
  now: number = Date.now(),
): RateLimitResult & { bypassed?: boolean } {
  if (ip && isTrustedIp(ip)) {
    return { allowed: true, remaining: Infinity, resetMs: 0, bypassed: true };
  }
  return checkRateLimit(`ip:${ip}`, config, now);
}

/**
 * R225: env-driven rate-limit config for the research POST endpoint.
 *
 * Operators can tune the throttle without a code change by setting:
 *   LAUNCHLENS_RATE_LIMIT_CAPACITY     (default 10) — requests per window
 *   LAUNCHLENS_RATE_LIMIT_REFILL_MS    (default 60000) — window length in ms
 *
 * Values are parsed once at module load and clamped to sane bounds
 * (capacity >= 1, refill >= 1000ms) so a misconfigured env can't disable
 * rate limiting entirely or set a sub-second window. Callers that don't
 * pass an explicit config fall back to these tuned defaults instead of the
 * bare DEFAULT_CONFIG.
 */
function parseRateLimitEnv(): RateLimitConfig {
  const capStr = process.env.LAUNCHLENS_RATE_LIMIT_CAPACITY;
  const refillStr = process.env.LAUNCHLENS_RATE_LIMIT_REFILL_MS;
  const rawCapacity = capStr ? Number(capStr) : NaN;
  const rawRefill = refillStr ? Number(refillStr) : NaN;
  return {
    capacity: Number.isFinite(rawCapacity)
      ? Math.max(1, Math.floor(rawCapacity))
      : DEFAULT_CONFIG.capacity,
    refillIntervalMs: Number.isFinite(rawRefill)
      ? Math.max(1000, Math.floor(rawRefill))
      : DEFAULT_CONFIG.refillIntervalMs,
  };
}

let RESEARCH_CONFIG: RateLimitConfig = parseRateLimitEnv();

/** Read-only access to the tuned research rate-limit config (for diagnostics). */
export function getResearchRateLimitConfig(): Readonly<RateLimitConfig> {
  return RESEARCH_CONFIG;
}

/**
 * Re-read env and refresh the cached research config. Exposed for tests
 * that change process.env after module load; not needed at runtime.
 */
export function refreshResearchRateLimitConfig(): Readonly<RateLimitConfig> {
  RESEARCH_CONFIG = parseRateLimitEnv();
  return RESEARCH_CONFIG;
}

/**
 * R225: check the research endpoint rate limit using the env-tuned config.
 * Equivalent to checkRateLimitForIp(ip, getResearchRateLimitConfig()).
 */
export function checkResearchRateLimit(
  ip: string,
  now: number = Date.now(),
): RateLimitResult & { bypassed?: boolean } {
  return checkRateLimitForIp(ip, RESEARCH_CONFIG, now);
}

export function clearRateLimits(): void {
  buckets.clear();
}
