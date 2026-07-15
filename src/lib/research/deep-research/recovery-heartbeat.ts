// R3xx: Redis-backed heartbeat for the Deep Research recovery scheduler.
//
// The capability gate used to claim "at most 300s recovery" purely from
// the LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS env var. That value is
// declarative; nothing in the runtime actually verified the cron
// trigger was still firing. This module replaces the declaration with
// an observation:
//   - Every successful /api/cron/scheduler call writes
//     `rs:deep:recovery:heartbeat` to Redis (lastOkAt) and a meta hash
//     with the run's outcome.
//   - The capability gate reads that heartbeat; if it is older than the
//     declared max delay, the gate reports `recovery_freshness` as
//     degraded so the UI can show "Recovery delayed" instead of a false
//     "available".
//
// All operations are best-effort: a missing or unreachable Redis makes
// the heartbeat unavailable, which is reported as degraded (not as a
// hard failure). This keeps the gate honest without making it a
// single-point-of-failure for the rest of the runtime.

import { getRedis } from "@/lib/research/redis-client";

export const HEARTBEAT_KEY = "rs:deep:recovery:heartbeat";
export const HEARTBEAT_META_KEY = "rs:deep:recovery:last_run_meta";
export const HEARTBEAT_LOCK_KEY = "rs:deep:recovery:tick:lock";

export const DEFAULT_HEARTBEAT_TTL_SECONDS = 35 * 60; // 5x the 5-min cron
export const DEFAULT_LOCK_TTL_SECONDS = 240; // 4 minutes

export interface RecoveryHeartbeat {
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastOkDurationMs: number | null;
  lastDispatched: number | null;
  lastFailed: number | null;
}

export interface ReadHeartbeatOptions {
  redis?: ReturnType<typeof getRedis>;
  now?: () => Date;
}

export async function readRecoveryHeartbeat(
  options: ReadHeartbeatOptions = {},
): Promise<RecoveryHeartbeat> {
  const redis = options.redis ?? getRedis();
  if (!redis) return emptyHeartbeat();
  try {
    const [ts, meta] = await Promise.all([
      redis.get<string | null>(HEARTBEAT_KEY),
      redis.hgetall<Record<string, string | null>>(HEARTBEAT_META_KEY),
    ]);
    return {
      lastOkAt: typeof ts === "string" ? ts : null,
      lastErrorAt: typeof meta?.lastErrorAt === "string" ? meta.lastErrorAt : null,
      lastErrorCode: typeof meta?.lastErrorCode === "string" ? meta.lastErrorCode : null,
      lastOkDurationMs: numberOrNull(meta?.lastOkDurationMs),
      lastDispatched: numberOrNull(meta?.lastDispatched),
      lastFailed: numberOrNull(meta?.lastFailed),
    };
  } catch {
    return emptyHeartbeat();
  }
}

export function emptyHeartbeat(): RecoveryHeartbeat {
  return {
    lastOkAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    lastOkDurationMs: null,
    lastDispatched: null,
    lastFailed: null,
  };
}

export interface WriteHeartbeatOptions {
  ok: boolean;
  requestId: string;
  durationMs: number;
  dispatched?: number;
  failed?: number;
  errorCode?: string;
  ttlSeconds?: number;
  redis?: ReturnType<typeof getRedis>;
  now?: () => Date;
}

export async function writeRecoveryHeartbeat(
  options: WriteHeartbeatOptions,
): Promise<void> {
  const redis = options.redis ?? getRedis();
  if (!redis) return;
  const now = (options.now ?? (() => new Date()))().toISOString();
  const ttl = options.ttlSeconds ?? DEFAULT_HEARTBEAT_TTL_SECONDS;
  try {
    if (options.ok) {
      await redis.set(HEARTBEAT_KEY, now, { ex: ttl });
    }
    const meta: Record<string, string> = {
      requestId: options.requestId,
      lastDispatched: String(options.dispatched ?? 0),
      lastFailed: String(options.failed ?? 0),
      lastOkDurationMs: String(options.durationMs),
    };
    if (options.ok) {
      meta.lastOkAt = now;
    } else {
      meta.lastErrorAt = now;
      meta.lastErrorCode = options.errorCode ?? "unknown";
    }
    await redis.hset(HEARTBEAT_META_KEY, meta);
    await redis.expire(HEARTBEAT_META_KEY, ttl);
  } catch {
    // Best-effort: heartbeat is observability, not authority.
  }
}

export interface AcquireLockOptions {
  requestId: string;
  ttlSeconds?: number;
  redis?: ReturnType<typeof getRedis>;
}

export interface AcquireLockResult {
  acquired: boolean;
  heldBy: string | null;
}

/**
 * Single-flight lock for the recovery tick. Returns `acquired: true` for
 * the first caller; subsequent concurrent calls observe the lock held
 * by another request id and return `acquired: false`. The TTL bounds
 * the worst case where the holder crashes mid-tick.
 */
export async function acquireRecoveryLock(
  options: AcquireLockOptions,
): Promise<AcquireLockResult> {
  const redis = options.redis ?? getRedis();
  if (!redis) return { acquired: true, heldBy: null };
  const ttl = options.ttlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;
  try {
    // Upstash `set ... nx ex` is atomic; if it returns "OK" we got the
    // lock, otherwise the previous holder is still running.
    const result = await (redis as unknown as {
      set: (key: string, value: string, opts: { nx: boolean; ex: number }) => Promise<unknown>;
    }).set(HEARTBEAT_LOCK_KEY, options.requestId, { nx: true, ex: ttl });
    if (result === "OK") return { acquired: true, heldBy: null };
    const heldBy = await redis.get<string | null>(HEARTBEAT_LOCK_KEY);
    return { acquired: false, heldBy: heldBy ?? null };
  } catch {
    // On Redis error, fail open so the recovery tick can still attempt
    // to run; the durable per-session lease inside DeepResearchService
    // remains the authoritative duplicate-execution guard.
    return { acquired: true, heldBy: null };
  }
}

export async function releaseRecoveryLock(
  requestId: string,
  options: { redis?: ReturnType<typeof getRedis> } = {},
): Promise<void> {
  const redis = options.redis ?? getRedis();
  if (!redis) return;
  try {
    // Only release if we still own the lock.
    const current = await redis.get<string | null>(HEARTBEAT_LOCK_KEY);
    if (current === requestId) {
      await redis.del(HEARTBEAT_LOCK_KEY);
    }
  } catch {
    // Best-effort: TTL also releases the lock if we crash.
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
