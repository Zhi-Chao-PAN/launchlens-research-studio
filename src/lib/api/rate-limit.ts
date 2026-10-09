// Per-key token bucket rate limiter.
// Default: 10 tokens, refilling at 10/60s (~0.167/sec). Used by the research
// POST endpoint to prevent runaway cost on real providers.
// True token bucket: tokens refill continuously at a steady rate rather than
// resetting on a fixed window boundary. This avoids the "double burst" problem
// where a client could exhaust capacity at the end of one window and immediately
// get a full refill at the next boundary. Memory-only and process-local.

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

  const refillRate = cfg.capacity / cfg.refillIntervalMs; // tokens per ms

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: cfg.capacity, lastRefill: now };
  }

  // Continuous refill: add tokens proportional to elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const newTokens = elapsed * refillRate;
    bucket.tokens = Math.min(cfg.capacity, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    // Time until one more token is available (or full refill, whichever is less)
    const msToNextToken = bucket.tokens < cfg.capacity
      ? Math.ceil((1 - (bucket.tokens - Math.floor(bucket.tokens))) / refillRate)
      : 0;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetMs: msToNextToken,
    };
  }

  buckets.set(key, bucket);
  // Time until at least one token refills
  const msToNextToken = Math.ceil((1 - bucket.tokens) / refillRate);
  return {
    allowed: false,
    remaining: 0,
    resetMs: Math.max(0, msToNextToken),
  };
}

export function clearRateLimits(): void {
  buckets.clear();
}