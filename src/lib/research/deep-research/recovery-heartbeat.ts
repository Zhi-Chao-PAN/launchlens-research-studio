// R3xx: Redis-backed heartbeat for the Deep Research recovery scheduler.
//
// The capability gate used to claim bounded recovery purely from
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
//   - A rolling series of recent ticks is kept at
//     `rs:deep:recovery:history` (stored newest first, read oldest first, bounded
//     by `DEFAULT_HISTORY_MAX_ENTRIES`). The gate reads this series to
//     require a *bounded series* of consecutive successful ticks before
//     claiming `healthy` — one sample is not enough evidence that the
//     scheduler actually meets its cadence.
//
// All operations are best-effort: a missing or unreachable Redis makes
// the heartbeat unavailable, which is reported as degraded (not as a
// hard failure). This keeps the gate honest without making it a
// single-point-of-failure for the rest of the runtime.

import { getRedis } from "@/lib/research/redis-client";

export const HEARTBEAT_KEY = "rs:deep:recovery:heartbeat";
export const HEARTBEAT_META_KEY = "rs:deep:recovery:last_run_meta";
export const HEARTBEAT_LOCK_KEY = "rs:deep:recovery:tick:lock";
export const RECOVERY_HISTORY_KEY = "rs:deep:recovery:history";

export const DEFAULT_HEARTBEAT_TTL_SECONDS = 35 * 60; // 5x the 5-min cron
export const DEFAULT_LOCK_TTL_SECONDS = 240; // 4 minutes
export const DEFAULT_HISTORY_TTL_SECONDS = 24 * 60 * 60; // 24h sliding window
export const DEFAULT_HISTORY_MAX_ENTRIES = 64; // ~5.3h of 5-min ticks
/**
 * Number of consecutive successful ticks required before the capability
 * gate will mark recovery as `healthy`. With a single sample we have no
 * evidence the scheduler actually meets its cadence — it is just a cold
 * deploy that happened to fire once.
 */
export const MIN_CONSECUTIVE_OK_FOR_HEALTHY = 3;

const RELEASE_RECOVERY_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export interface RecoveryHeartbeat {
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastOkDurationMs: number | null;
  lastDispatched: number | null;
  lastFailed: number | null;
}

export interface RecoveryHistoryEntry {
  ok: boolean;
  at: string;
  durationMs: number;
  dispatched: number;
  failed: number;
  errorCode: string | null;
  requestId: string;
}

export interface ReadHeartbeatOptions {
  redis?: ReturnType<typeof getRedis>;
  now?: () => Date;
  historyLimit?: number;
  historyTtlSeconds?: number;
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
  historyTtlSeconds?: number;
  historyMaxEntries?: number;
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
  // The rolling history MUST be written even if the meta hash above
  // failed — otherwise the capability gate would not see this tick at
  // all. We isolate the failure: an exception here never throws.
  try {
    await appendRecoveryHistoryEntry(
      {
        ok: options.ok,
        at: now,
        durationMs: options.durationMs,
        dispatched: options.dispatched ?? 0,
        failed: options.failed ?? 0,
        errorCode: options.ok ? null : options.errorCode ?? "unknown",
        requestId: options.requestId,
      },
      {
        redis,
        ttlSeconds: options.historyTtlSeconds,
        maxEntries: options.historyMaxEntries,
      },
    );
  } catch {
    // Best-effort: history is observability, not authority.
  }
}

/**
 * Read the rolling history of recent recovery ticks, oldest first.
 * Length is bounded by the writer's `historyMaxEntries`.
 */
export async function readRecoveryHistory(
  options: ReadHeartbeatOptions = {},
): Promise<RecoveryHistoryEntry[]> {
  const redis = options.redis ?? getRedis();
  if (!redis) return [];
  try {
    const limit = options.historyLimit ?? DEFAULT_HISTORY_MAX_ENTRIES;
    // LPUSH stores newest entries at index 0. Pull 0..limit-1 and reverse
    // so callers receive the newest bounded window in chronological order.
    const raw = await redis.lrange<string | null>(RECOVERY_HISTORY_KEY, 0, Math.max(0, limit - 1));
    if (!Array.isArray(raw)) return [];
    const entries = raw
      .map((entry) => parseHistoryEntry(entry))
      .filter((entry): entry is RecoveryHistoryEntry => entry !== null);
    return entries.reverse();
  } catch {
    return [];
  }
}

export interface AppendHistoryEntryOptions {
  redis?: ReturnType<typeof getRedis>;
  ttlSeconds?: number;
  maxEntries?: number;
}

export async function appendRecoveryHistoryEntry(
  entry: RecoveryHistoryEntry,
  options: AppendHistoryEntryOptions = {},
): Promise<void> {
  const redis = options.redis ?? getRedis();
  if (!redis) return;
  const ttl = options.ttlSeconds ?? DEFAULT_HISTORY_TTL_SECONDS;
  const max = options.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES;
  try {
    const payload = JSON.stringify(entry);
    // LPUSH inserts at the head (newest), LTRIM trims to the most recent
    // `max` entries (indices 0..max-1). This is the idiomatic bounded
    // list pattern in Redis.
    await redis.lpush(RECOVERY_HISTORY_KEY, payload);
    await redis.ltrim(RECOVERY_HISTORY_KEY, 0, Math.max(0, max - 1));
    await redis.expire(RECOVERY_HISTORY_KEY, ttl);
  } catch {
    // Best-effort: history is observability, not authority.
  }
}

function parseHistoryEntry(raw: unknown): RecoveryHistoryEntry | null {
  let parsed: unknown = raw;
  try {
    // Upstash Redis deserializes JSON list members for typed `lrange` calls,
    // while lightweight adapters and older clients return the raw JSON text.
    // Accept both shapes at this trust boundary so production history is not
    // silently discarded just because the client chose a different decode.
    if (typeof raw === "string") parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const entry = parsed as Partial<RecoveryHistoryEntry>;
    if (typeof entry.at !== "string") return null;
    return {
      ok: entry.ok === true,
      at: entry.at,
      durationMs: typeof entry.durationMs === "number" ? entry.durationMs : 0,
      dispatched: typeof entry.dispatched === "number" ? entry.dispatched : 0,
      failed: typeof entry.failed === "number" ? entry.failed : 0,
      errorCode: typeof entry.errorCode === "string" ? entry.errorCode : null,
      requestId: typeof entry.requestId === "string" ? entry.requestId : "",
    };
  } catch {
    return null;
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
    // Compare-and-delete atomically. A separate GET/DEL can erase a new
    // holder if our lease expires between those two commands.
    await redis.eval(RELEASE_RECOVERY_LOCK_SCRIPT, [HEARTBEAT_LOCK_KEY], [requestId]);
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
