// Redis client for cross-instance session state + Pub/Sub event fan-out.
//
// On Vercel serverless, each lambda instance has its own isolated memory. The
// research engine's module-level `sessions` Map (and the `eventListeners`
// fan-out) are therefore invisible to a different instance that handles the
// SSE stream GET. This module provides a shared, cross-instance store backed
// by Upstash Redis (HTTP-based REST API — no connection pool, ideal for
// serverless).
//
// Env variables (auto-injected by Vercel when you connect an Upstash Redis or
// Vercel KV store to the project):
//   UPSTASH_REDIS_REST_URL  + UPSTASH_REDIS_REST_TOKEN   (Upstash naming)
//   KV_REST_API_URL         + KV_REST_API_TOKEN          (Vercel KV naming)
//
// We accept either pair so the operator can use whichever integration they
// wired up. If neither pair is present, `getRedis()` returns null and the
// session-store layer falls back to the legacy in-process Map behavior —
// keeping local development, tests, and a pre-Redis deployment identical to
// today. This is the key safety net: configuring Redis never makes things
// worse, and not configuring it changes nothing.

import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

/**
 * Lazily build (and cache) the Upstash Redis client from env. Returns null
 * when no Redis env pair is configured, signalling the caller to use the
 * in-process fallback. Returns null (not throws) on any construction error
 * so a misconfigured Redis never breaks the request path.
 */
export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  try {
    const url =
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      "";
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      "";

    if (!url || !token) {
      cached = null;
      return null;
    }

    cached = new Redis({ url, token });
    return cached;
  } catch (err) {
    console.error("[redis-client] failed to construct client:", err);
    cached = null;
    return null;
  }
}

/**
 * Test/diagnostic helper: is Redis configured? Exposed so the session store
 * and API diagnostics can report the active backend without touching env
 * directly.
 */
export function isRedisConfigured(): boolean {
  return getRedis() !== null;
}

/**
 * Reset the cached client. Only for tests that need to flip env between cases.
 */
export function _resetRedisCacheForTests(): void {
  cached = undefined;
}
