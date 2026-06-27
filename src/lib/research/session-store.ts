// Cross-instance session store backed by Upstash Redis, with a transparent
// in-process fallback when Redis is not configured.
//
// The research engine originally kept all live session state in a module-level
// `sessions` Map. On Vercel serverless that Map exists per-lambda-instance,
// so a session created by the POST handler's instance is invisible to the
// instance that serves the SSE stream GET — producing the "Session expired or
// not found" error. This module externalizes that state to Redis so any
// instance can recover a session by id.
//
// Three concerns live here:
//   1. Session JSON            — key `session:<id>`, TTL = retention budget.
//   2. Cancellation flag       — key `cancel:<id>`, polled by the agent loop.
//   3. Event fan-out (Pub/Sub) — channel `events:<id>`, for SSE reconnect.
//
// When `getRedis()` is null (no env), every function degrades to no-op or
// returns null/false so the caller's in-process logic is unchanged. This is
// the safety net: tests and local dev that don't set Redis env behave
// exactly like before.

import type { ResearchEvent, ResearchSession } from "@/lib/schema/research-schema";
import { getRedis } from "./redis-client";

// Key/tag layout. Namespaced with `rs:` (research-studio) to avoid collisions
// if the same Redis instance is shared with other services.
const SESSION_KEY = (id: string) => `rs:session:${id}`;
const CANCEL_KEY = (id: string) => `rs:cancel:${id}`;
const LOCK_KEY = (id: string) => `rs:lock:${id}`;
const EVENT_CHANNEL = (id: string) => `rs:events:${id}`;

// How long a session stays recoverable in Redis. Matches the engine's
// SESSION_RETENTION_MS default (30 min). Kept here so the store owns TTL.
const SESSION_TTL_SECONDS = 30 * 60;

// Cancellation polls are cheap, but we still cache the "not cancelled" result
// locally for a short window to avoid hammering Redis on every agent step.
const CANCEL_CACHE_MS = 500;
const cancelCache = new Map<string, { value: boolean; expires: number }>();

// ---------------------------------------------------------------------------
// Session JSON store
// ---------------------------------------------------------------------------

/**
 * Persist a session to Redis (cross-instance visible). Best-effort: Redis
 * errors are swallowed and logged so they never break the run. No-op when
 * Redis is not configured (the in-process Map is the source of truth there).
 */
export async function storeSession(session: ResearchSession): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(SESSION_KEY(session.id), JSON.stringify(session), {
      ex: SESSION_TTL_SECONDS,
    });
  } catch (err) {
    console.error(`[session-store] storeSession(${session.id}) failed:`, err);
  }
}

/**
 * Read a session from Redis. Returns null when Redis is not configured (caller
 * falls back to the in-process Map), when the key is absent, or on error.
 *
 * Upstash auto-deserializes JSON-stringified values back into objects, so
 * `redis.get` may return either a string (when the stored value isn't valid
 * JSON) or a parsed object. We accept both shapes defensively.
 */
export async function fetchSession(id: string): Promise<ResearchSession | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<unknown>(SESSION_KEY(id));
    if (raw == null) return null;
    if (typeof raw === "string") return JSON.parse(raw) as ResearchSession;
    return raw as ResearchSession;
  } catch (err) {
    console.error(`[session-store] fetchSession(${id}) failed:`, err);
    return null;
  }
}

/**
 * Remove a session from Redis. Best-effort. No-op without Redis.
 */
export async function removeSession(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(SESSION_KEY(id));
    await redis.del(CANCEL_KEY(id));
    cancelCache.delete(id);
  } catch (err) {
    console.error(`[session-store] removeSession(${id}) failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// Cancellation flag
// ---------------------------------------------------------------------------

/**
 * Mark a session as cancelled in Redis so the agent loop running on another
 * instance can observe it. No-op without Redis (the in-process
 * `cancelledSessions` Set covers single-instance execution).
 */
export async function setCancelFlag(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(CANCEL_KEY(id), "1", { ex: SESSION_TTL_SECONDS });
    cancelCache.set(id, { value: true, expires: Date.now() + CANCEL_CACHE_MS });
  } catch (err) {
    console.error(`[session-store] setCancelFlag(${id}) failed:`, err);
  }
}

/**
 * Check whether a session has been cancelled. Returns false when Redis is not
 * configured (single-instance path uses the in-process Set). Results are
 * cached locally for `CANCEL_CACHE_MS` to avoid a Redis round-trip on every
 * agent step.
 *
 * Upstash auto-deserializes the stored "1" to either the string "1" or the
 * number 1 depending on payload shape; we accept both.
 */
export async function isCancelledRemotely(id: string): Promise<boolean> {
  // Local cache first.
  const cached = cancelCache.get(id);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.value;
  }

  const redis = getRedis();
  if (!redis) return false;

  try {
    const flag = await redis.get<unknown>(CANCEL_KEY(id));
    const value = flag === "1" || flag === 1;
    cancelCache.set(id, { value, expires: now + CANCEL_CACHE_MS });
    return value;
  } catch (err) {
    console.error(`[session-store] isCancelledRemotely(${id}) failed:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Execution lock (prevents two instances running the same session)
// ---------------------------------------------------------------------------

/**
 * Atomically acquire an execution lock for a session so only one instance
 * runs `runResearchSession` at a time. Returns true if this caller acquired
 * the lock. TTL bounds the lock so a crashed instance doesn't hold it
 * forever. No-op (returns true) without Redis — single-instance doesn't need
 * a lock.
 */
export async function acquireRunLock(id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    // SET NX with EX returns "OK" on success, null if the key already exists.
    const res = await redis.set(LOCK_KEY(id), "1", { nx: true, ex: SESSION_TTL_SECONDS });
    return res === "OK";
  } catch (err) {
    console.error(`[session-store] acquireRunLock(${id}) failed:`, err);
    // On Redis error, allow the run to proceed (better to run than to stall).
    return true;
  }
}

/**
 * Release the execution lock. Best-effort.
 */
export async function releaseRunLock(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(LOCK_KEY(id));
  } catch (err) {
    console.error(`[session-store] releaseRunLock(${id}) failed:`, err);
  }
}

/**
 * Check whether a session is currently locked (running on another instance).
 * Returns false when Redis is not configured (single-instance always runs
 * the session on the instance that received the request).
 *
 * Upstash auto-deserializes "1" to either the string "1" or the number 1;
 * accept both.
 */
export async function isRunLocked(id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const v = await redis.get<unknown>(LOCK_KEY(id));
    return v === "1" || v === 1;
  } catch (err) {
    console.error(`[session-store] isRunLocked(${id}) failed:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event fan-out (Pub/Sub)
// ---------------------------------------------------------------------------

/**
 * Publish an event to the session's Redis channel so SSE clients connected to
 * a *different* instance can receive it (e.g. after a reconnect). Fire-and-
 * forget: a publish failure must not break the agent loop. No-op without
 * Redis (the in-process `emitEvent` local fan-out is the sole channel).
 */
export function publishEvent(id: string, event: ResearchEvent): void {
  const redis = getRedis();
  if (!redis) return;
  // Non-awaited: publishing is best-effort and must not block the run.
  redis
    .publish(EVENT_CHANNEL(id), JSON.stringify(event))
    .catch((err) => console.error(`[session-store] publishEvent(${id}) failed:`, err));
}

/**
 * Subscribe to a session's Redis event channel. Returns an unsubscribe
 * function. No-op (returns a no-op unsub) without Redis. The provided
 * callback is invoked for each published event decoded from JSON.
 *
 * Upstash's subscribe() returns a Subscriber (EventTarget) synchronously —
 * NOT a Promise. You add a "message" listener and call .unsubscribe() to
 * tear down. The Subscriber auto-deserializes JSON payloads, so the
 * listener receives an already-parsed object.
 */
export function subscribeEvents(
  id: string,
  cb: (event: ResearchEvent) => void,
): () => void {
  const redis = getRedis();
  if (!redis) return () => {};
  // Upstash's Redis.subscribe returns a Subscriber (EventTarget). We type
  // it as a minimal interface so we don't need to import the SDK's private
  // types here.
  const sub = redis.subscribe(EVENT_CHANNEL(id)) as unknown as {
    unsubscribe: () => Promise<void> | void;
    removeAllListeners?: () => void;
    on?: (type: string, listener: (msg: unknown) => void) => void;
  } | null;
  let active = true;
  if (sub) {
    sub.on?.("message", (msg: unknown) => {
      if (!active) return;
      // Upstash passes an already-decoded JSON object on "message" events.
      // Guard for string payloads in case the SDK returns raw text.
      const event = (typeof msg === "string" ? JSON.parse(msg) : msg) as ResearchEvent;
      cb(event);
    });
    sub.on?.("error", (err: unknown) => {
      console.error(`[session-store] subscribeEvents(${id}) error:`, err);
    });
  }
  return () => {
    active = false;
    if (!sub) return;
    try {
      sub.removeAllListeners?.();
      sub.unsubscribe?.();
    } catch { /* ignore */ }
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Clear the local cancel cache (tests only). */
export function _clearCancelCacheForTests(): void {
  cancelCache.clear();
}
