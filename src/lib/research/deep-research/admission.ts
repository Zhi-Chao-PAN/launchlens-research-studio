import { createHmac } from "node:crypto";
import { getRedis } from "@/lib/research/redis-client";

const KEY_PREFIX = "rs:deep:admission";
const GLOBAL_ACTIVE_KEY = `${KEY_PREFIX}:active:global`;
const CLIENT_ACTIVE_KEY = (clientHash: string) =>
  `${KEY_PREFIX}:active:client:${clientHash}`;
const RESERVATION_KEY = (sessionId: string) =>
  `${KEY_PREFIX}:reservation:${sessionId}`;
const GLOBAL_DAILY_KEY = (utcDay: string) =>
  `${KEY_PREFIX}:daily:${utcDay}:global`;
const CLIENT_DAILY_KEY = (utcDay: string, clientHash: string) =>
  `${KEY_PREFIX}:daily:${utcDay}:client:${clientHash}`;

const DEFAULTS = Object.freeze({
  perClientDailyLimit: 2,
  globalDailyLimit: 20,
  perClientActiveLimit: 1,
  globalActiveLimit: 3,
  reservationSeconds: 3_600,
});

const ADMIT_SCRIPT = `
local now = tonumber(ARGV[1])
local expires_at = tonumber(ARGV[2])
local daily_ttl_seconds = tonumber(ARGV[3])
local per_client_daily_limit = tonumber(ARGV[4])
local global_daily_limit = tonumber(ARGV[5])
local per_client_active_limit = tonumber(ARGV[6])
local global_active_limit = tonumber(ARGV[7])
local session_id = ARGV[8]
local reservation_ttl_ms = tonumber(ARGV[9])

redis.call("ZREMRANGEBYSCORE", KEYS[3], "-inf", now)
redis.call("ZREMRANGEBYSCORE", KEYS[4], "-inf", now)

local existing_client_key = redis.call("GET", KEYS[5])
if existing_client_key then
  local existing_expiry = redis.call("ZSCORE", KEYS[3], session_id)
  if existing_expiry then
    return { 0, tonumber(existing_expiry), 0, 0 }
  end
  redis.call("DEL", KEYS[5])
end

local client_daily = tonumber(redis.call("GET", KEYS[2]) or "0")
if client_daily >= per_client_daily_limit then
  return { 1, tonumber(ARGV[10]), client_daily, 0 }
end

local global_daily = tonumber(redis.call("GET", KEYS[1]) or "0")
if global_daily >= global_daily_limit then
  return { 2, tonumber(ARGV[10]), client_daily, global_daily }
end

local client_active = tonumber(redis.call("ZCARD", KEYS[4]))
if client_active >= per_client_active_limit then
  local oldest = redis.call("ZRANGE", KEYS[4], 0, 0, "WITHSCORES")
  return { 3, tonumber(oldest[2] or expires_at), client_active, 0 }
end

local global_active = tonumber(redis.call("ZCARD", KEYS[3]))
if global_active >= global_active_limit then
  local oldest = redis.call("ZRANGE", KEYS[3], 0, 0, "WITHSCORES")
  return { 4, tonumber(oldest[2] or expires_at), client_active, global_active }
end

redis.call("ZADD", KEYS[3], expires_at, session_id)
redis.call("ZADD", KEYS[4], expires_at, session_id)
local global_latest = redis.call("ZREVRANGE", KEYS[3], 0, 0, "WITHSCORES")
local client_latest = redis.call("ZREVRANGE", KEYS[4], 0, 0, "WITHSCORES")
redis.call("PEXPIREAT", KEYS[3], tonumber(global_latest[2]) + 60000)
redis.call("PEXPIREAT", KEYS[4], tonumber(client_latest[2]) + 60000)
redis.call("SET", KEYS[5], KEYS[4], "PX", reservation_ttl_ms + 60000)

local next_client_daily = redis.call("INCR", KEYS[2])
local next_global_daily = redis.call("INCR", KEYS[1])
redis.call("EXPIRE", KEYS[2], daily_ttl_seconds)
redis.call("EXPIRE", KEYS[1], daily_ttl_seconds)

return { 0, expires_at, next_client_daily, next_global_daily }
`;

const RELEASE_SCRIPT = `
local client_active_key = redis.call("GET", KEYS[2])
local removed = redis.call("ZREM", KEYS[1], ARGV[1])
if client_active_key then
  redis.call("ZREM", client_active_key, ARGV[1])
  redis.call("DEL", KEYS[2])
end
return removed
`;

interface DeepAdmissionRedis {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export interface DeepAdmissionConfig {
  perClientDailyLimit: number;
  globalDailyLimit: number;
  perClientActiveLimit: number;
  globalActiveLimit: number;
  reservationSeconds: number;
}

export type DeepAdmissionRejectionReason =
  | "client_daily_limit"
  | "global_daily_limit"
  | "client_active_limit"
  | "global_active_limit"
  | "storage_unavailable";

export type DeepAdmissionDecision =
  | {
      allowed: true;
      reservationExpiresAt: number;
      config: DeepAdmissionConfig;
    }
  | {
      allowed: false;
      reason: DeepAdmissionRejectionReason;
      retryAfterMs: number;
      config: DeepAdmissionConfig;
    };

export interface DeepAdmissionOptions {
  env?: Readonly<Record<string, string | undefined>>;
  now?: number;
  redis?: DeepAdmissionRedis | null;
}

/**
 * Atomically reserves one costly Deep start across every serverless instance.
 * The daily counters cap spend; expiring sorted sets cap simultaneous work and
 * self-heal when a worker dies before the terminal observer can release them.
 */
export async function reserveDeepResearchAdmission(
  clientIdentity: string,
  sessionId: string,
  options: DeepAdmissionOptions = {},
): Promise<DeepAdmissionDecision> {
  const env = options.env ?? process.env;
  const config = resolveDeepAdmissionConfig(env);
  const now = options.now ?? Date.now();
  const redis =
    options.redis === undefined
      ? (getRedis() as unknown as DeepAdmissionRedis | null)
      : options.redis;
  const hashSecret =
    env.LAUNCHLENS_DEEP_ADMISSION_HASH_SECRET ||
    env.LAUNCHLENS_DEEP_WORKER_SECRET ||
    "";

  // Deep's capability gate already requires Redis and a strong worker secret,
  // but this boundary must remain safe even if it is called independently.
  if (!redis || hashSecret.length < 24) {
    return unavailable(config);
  }

  const clientHash = createHmac("sha256", hashSecret)
    .update(clientIdentity || "anonymous")
    .digest("hex")
    .slice(0, 32);
  const date = new Date(now);
  const utcDay = date.toISOString().slice(0, 10);
  const nextUtcDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  );
  const dailyTtlSeconds = Math.max(
    60,
    Math.ceil((nextUtcDay - now) / 1_000) + 3_600,
  );
  const reservationExpiresAt = now + config.reservationSeconds * 1_000;

  try {
    const raw = await redis.eval(
      ADMIT_SCRIPT,
      [
        GLOBAL_DAILY_KEY(utcDay),
        CLIENT_DAILY_KEY(utcDay, clientHash),
        GLOBAL_ACTIVE_KEY,
        CLIENT_ACTIVE_KEY(clientHash),
        RESERVATION_KEY(sessionId),
      ],
      [
        String(now),
        String(reservationExpiresAt),
        String(dailyTtlSeconds),
        String(config.perClientDailyLimit),
        String(config.globalDailyLimit),
        String(config.perClientActiveLimit),
        String(config.globalActiveLimit),
        sessionId,
        String(config.reservationSeconds * 1_000),
        String(nextUtcDay),
      ],
    );
    const result = parseScriptResult(raw);
    if (!result) return unavailable(config);

    const [code, retryAt] = result;
    if (code === 0) {
      return {
        allowed: true,
        reservationExpiresAt: Math.max(now, retryAt),
        config,
      };
    }

    const reason = codeToReason(code);
    if (!reason) return unavailable(config);
    return {
      allowed: false,
      reason,
      retryAfterMs: Math.max(1_000, retryAt - now),
      config,
    };
  } catch {
    return unavailable(config);
  }
}

/** Best-effort early release; the reservation TTL is the durable fallback. */
export async function releaseDeepResearchAdmission(
  sessionId: string,
  options: Pick<DeepAdmissionOptions, "redis"> = {},
): Promise<boolean> {
  const redis =
    options.redis === undefined
      ? (getRedis() as unknown as DeepAdmissionRedis | null)
      : options.redis;
  if (!redis) return false;
  try {
    const raw = await redis.eval(
      RELEASE_SCRIPT,
      [GLOBAL_ACTIVE_KEY, RESERVATION_KEY(sessionId)],
      [sessionId],
    );
    return Number(raw) > 0;
  } catch {
    return false;
  }
}

export function resolveDeepAdmissionConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DeepAdmissionConfig {
  return {
    perClientDailyLimit: boundedInteger(
      env.LAUNCHLENS_DEEP_PER_CLIENT_DAILY_LIMIT,
      DEFAULTS.perClientDailyLimit,
      1,
      100,
    ),
    globalDailyLimit: boundedInteger(
      env.LAUNCHLENS_DEEP_GLOBAL_DAILY_LIMIT,
      DEFAULTS.globalDailyLimit,
      1,
      10_000,
    ),
    perClientActiveLimit: boundedInteger(
      env.LAUNCHLENS_DEEP_PER_CLIENT_ACTIVE_LIMIT,
      DEFAULTS.perClientActiveLimit,
      1,
      10,
    ),
    globalActiveLimit: boundedInteger(
      env.LAUNCHLENS_DEEP_GLOBAL_ACTIVE_LIMIT,
      DEFAULTS.globalActiveLimit,
      1,
      100,
    ),
    reservationSeconds: boundedInteger(
      env.LAUNCHLENS_DEEP_RESERVATION_SECONDS,
      DEFAULTS.reservationSeconds,
      300,
      21_600,
    ),
  };
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
  return Math.min(max, Math.max(min, Number.parseInt(raw, 10)));
}

function parseScriptResult(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const values = raw.slice(0, 4).map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  while (values.length < 4) values.push(0);
  return values as [number, number, number, number];
}

function codeToReason(code: number): Exclude<
  DeepAdmissionRejectionReason,
  "storage_unavailable"
> | null {
  switch (code) {
    case 1:
      return "client_daily_limit";
    case 2:
      return "global_daily_limit";
    case 3:
      return "client_active_limit";
    case 4:
      return "global_active_limit";
    default:
      return null;
  }
}

function unavailable(config: DeepAdmissionConfig): DeepAdmissionDecision {
  return {
    allowed: false,
    reason: "storage_unavailable",
    retryAfterMs: 60_000,
    config,
  };
}
