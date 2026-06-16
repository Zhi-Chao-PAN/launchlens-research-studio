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

export function clearRateLimits(): void {
  buckets.clear();
}
