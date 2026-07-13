import { getRedis } from "@/lib/research/redis-client";
import type { ResearchSession } from "@/lib/schema/research-schema";
import type { DeepRunLease, DeepRunRecordV1 } from "./model";
import {
  DeepRunRepositoryUnavailableError,
  type DeepRunClaimResult,
  type DeepRunCommitResult,
  type DeepRunDeleteResult,
  type DeepRunRepository,
} from "./repository";

const RUN_KEY = (id: string) => `rs:deep:run:${id}`;
const LEASE_KEY = (id: string) => `rs:deep:lease:${id}`;
const FENCE_KEY = (id: string) => `rs:deep:fence:${id}`;
const SESSION_KEY = (id: string) => `rs:session:${id}`;
const DUE_KEY = "rs:deep:due";
const ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;
const TERMINAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CREATE_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])
redis.call("ZADD", KEYS[3], ARGV[4], ARGV[5])
return 1
`;

const CLAIM_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ kind = "not_found" }) end
local job = cjson.decode(raw)
if job.lifecycle ~= "active" then
  return cjson.encode({ kind = "terminal", record = job })
end
local now = tonumber(ARGV[1])
if tonumber(job.nextWakeAt or 0) > now then
  return cjson.encode({ kind = "not_due", record = job })
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return cjson.encode({ kind = "busy", record = job })
end
local fence = redis.call("INCR", KEYS[3])
local lease = {
  token = ARGV[2],
  workerId = ARGV[3],
  fencingEpoch = fence,
  expiresAt = now + tonumber(ARGV[4])
}
local leaseRaw = cjson.encode(lease)
local acquired = redis.call("SET", KEYS[2], leaseRaw, "PX", ARGV[4], "NX")
if not acquired then
  return cjson.encode({ kind = "busy", record = job })
end
local index = tonumber(job.currentWorkIndex) + 1
local work = job.work[index]
if work then
  work.status = "running"
  work.attempts = tonumber(work.attempts or 0) + 1
  work.startedAt = now
  work.nextAttemptAt = nil
  job.totalAttempts = tonumber(job.totalAttempts or 0) + 1
end
job.revision = tonumber(job.revision) + 1
job.updatedAt = now
redis.call("SET", KEYS[1], cjson.encode(job), "PX", ARGV[5])
return cjson.encode({ kind = "claimed", record = job, lease = lease })
`;

const COMMIT_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ kind = "not_found" }) end
local current = cjson.decode(raw)
if current.lifecycle ~= "active" then
  return cjson.encode({ kind = "terminal", record = current })
end
local leaseRaw = redis.call("GET", KEYS[2])
if not leaseRaw then
  return cjson.encode({ kind = "stale_lease", record = current })
end
local lease = cjson.decode(leaseRaw)
if lease.token ~= ARGV[1] or lease.workerId ~= ARGV[2] or tonumber(lease.fencingEpoch) ~= tonumber(ARGV[3]) then
  return cjson.encode({ kind = "stale_lease", record = current })
end
if tonumber(current.revision) ~= tonumber(ARGV[4]) then
  return cjson.encode({ kind = "revision_conflict", record = current })
end
  local next = cjson.decode(ARGV[5])
  next.revision = tonumber(ARGV[4]) + 1
  local ttl = next.lifecycle == "active" and tonumber(ARGV[7]) or tonumber(ARGV[8])
  local projected = cjson.decode(ARGV[6])
  local existingSessionRaw = redis.call("GET", KEYS[3])
if existingSessionRaw then
  local existingSession = cjson.decode(existingSessionRaw)
  local existingTerminal = existingSession.status == "completed" or existingSession.status == "cancelled" or existingSession.status == "error"
  local incomingTerminal = projected.status == "completed" or projected.status == "cancelled" or projected.status == "error"
  if existingTerminal and (not incomingTerminal or existingSession.status ~= projected.status) then
      return cjson.encode({ kind = "terminal", record = current })
    end
  end
  redis.call("SET", KEYS[1], cjson.encode(next), "PX", ttl)
  redis.call("SET", KEYS[3], ARGV[6], "PX", ttl)
if next.lifecycle == "active" then
  redis.call("ZADD", KEYS[4], next.nextWakeAt, next.sessionId)
else
  redis.call("ZREM", KEYS[4], next.sessionId)
end
redis.call("DEL", KEYS[2])
return cjson.encode({ kind = "committed", record = next })
`;

const CANCEL_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return "" end
local job = cjson.decode(raw)
if job.lifecycle ~= "active" then return cjson.encode(job) end
job.lifecycle = "cancelled"
job.revision = tonumber(job.revision) + 1
job.updatedAt = tonumber(ARGV[1])
job.nextWakeAt = tonumber(ARGV[1])
job.terminal = { status = "cancelled", committedAt = ARGV[2] }
if ARGV[3] ~= "" then job.terminal.reasonCode = ARGV[3] end
job.session.status = "cancelled"
job.session.updatedAt = ARGV[2]
local index = tonumber(job.currentWorkIndex) + 1
if job.work[index] and job.work[index].status ~= "done" then
  job.work[index].status = "cancelled"
end
local encoded = cjson.encode(job)
redis.call("SET", KEYS[1], encoded, "PX", ARGV[4])
redis.call("SET", KEYS[2], cjson.encode(job.session), "PX", ARGV[4])
redis.call("ZREM", KEYS[3], job.sessionId)
redis.call("DEL", KEYS[4])
return encoded
`;

const RELEASE_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local lease = cjson.decode(raw)
if lease.token ~= ARGV[1] or lease.workerId ~= ARGV[2] or tonumber(lease.fencingEpoch) ~= tonumber(ARGV[3]) then
  return 0
end
return redis.call("DEL", KEYS[1])
`;

const FIND_DUE_SCRIPT = `
return redis.call("ZRANGEBYSCORE", KEYS[1], "-inf", ARGV[1], "LIMIT", 0, ARGV[2])
`;

const DELETE_TERMINAL_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return cjson.encode({ kind = "not_found" }) end
local job = cjson.decode(raw)
if job.lifecycle == "active" then
  return cjson.encode({ kind = "active", record = job })
end
redis.call("DEL", KEYS[1], KEYS[2], KEYS[3], KEYS[4])
redis.call("ZREM", KEYS[5], job.sessionId)
return cjson.encode({ kind = "deleted", record = job })
`;

export class RedisDeepRunRepository implements DeepRunRepository {
  private redis() {
    const redis = getRedis();
    if (!redis) throw new DeepRunRepositoryUnavailableError();
    return redis;
  }

  async create(record: DeepRunRecordV1): Promise<"created" | "exists"> {
    try {
      const created = await this.redis().eval<
        [string, string, string, string, string],
        number
      >(
        CREATE_SCRIPT,
        [RUN_KEY(record.sessionId), SESSION_KEY(record.sessionId), DUE_KEY],
        [
          JSON.stringify(record),
          JSON.stringify(record.session),
          String(ACTIVE_TTL_MS),
          String(record.nextWakeAt),
          record.sessionId,
        ],
      );
      return created === 1 ? "created" : "exists";
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to create durable Deep Research state.");
    }
  }

  async read(sessionId: string): Promise<DeepRunRecordV1 | null> {
    try {
      const raw = await this.redis().get<unknown>(RUN_KEY(sessionId));
      return parseRecord(raw);
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to read durable Deep Research state.");
    }
  }

  async claim(input: {
    sessionId: string;
    workerId: string;
    token: string;
    now: number;
    leaseMs: number;
  }): Promise<DeepRunClaimResult> {
    try {
      const raw = await this.redis().eval<
        [string, string, string, string, string],
        unknown
      >(
        CLAIM_SCRIPT,
        [RUN_KEY(input.sessionId), LEASE_KEY(input.sessionId), FENCE_KEY(input.sessionId)],
        [String(input.now), input.token, input.workerId, String(input.leaseMs), String(ACTIVE_TTL_MS)],
      );
      return parseClaimResult(raw);
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to claim durable Deep Research work.");
    }
  }

  async commit(input: {
    sessionId: string;
    expectedRevision: number;
    lease: DeepRunLease;
    next: DeepRunRecordV1;
  }): Promise<DeepRunCommitResult> {
    try {
      const raw = await this.redis().eval<
        [string, string, string, string, string, string, string, string],
        unknown
      >(
        COMMIT_SCRIPT,
        [RUN_KEY(input.sessionId), LEASE_KEY(input.sessionId), SESSION_KEY(input.sessionId), DUE_KEY],
        [
          input.lease.token,
          input.lease.workerId,
          String(input.lease.fencingEpoch),
          String(input.expectedRevision),
          JSON.stringify(input.next),
          JSON.stringify(input.next.session),
          String(ACTIVE_TTL_MS),
          String(TERMINAL_TTL_MS),
        ],
      );
      return parseCommitResult(raw);
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to commit durable Deep Research work.");
    }
  }

  async cancel(input: {
    sessionId: string;
    now: number;
    committedAt: string;
    reasonCode?: string;
  }): Promise<DeepRunRecordV1 | null> {
    try {
      const raw = await this.redis().eval<[string, string, string, string], string>(
        CANCEL_SCRIPT,
        [RUN_KEY(input.sessionId), SESSION_KEY(input.sessionId), DUE_KEY, LEASE_KEY(input.sessionId)],
        [input.now.toString(), input.committedAt, input.reasonCode || "", String(TERMINAL_TTL_MS)],
      );
      return raw ? parseRecord(raw) : null;
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to cancel durable Deep Research work.");
    }
  }

  async release(sessionId: string, lease: DeepRunLease): Promise<boolean> {
    try {
      const deleted = await this.redis().eval<[string, string, string], number>(
        RELEASE_SCRIPT,
        [LEASE_KEY(sessionId)],
        [lease.token, lease.workerId, String(lease.fencingEpoch)],
      );
      return deleted === 1;
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to release durable Deep Research lease.");
    }
  }

  async findDue(now: number, limit: number): Promise<string[]> {
    try {
      return await this.redis().eval<[string, string], string[]>(
        FIND_DUE_SCRIPT,
        [DUE_KEY],
        [String(now), String(Math.max(0, Math.min(100, limit)))],
      );
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to recover due Deep Research work.");
    }
  }

  async deleteTerminal(sessionId: string): Promise<DeepRunDeleteResult> {
    try {
      const raw = await this.redis().eval<[], unknown>(
        DELETE_TERMINAL_SCRIPT,
        [
          RUN_KEY(sessionId),
          LEASE_KEY(sessionId),
          FENCE_KEY(sessionId),
          SESSION_KEY(sessionId),
          DUE_KEY,
        ],
        [],
      );
      return parseEvalJsonResult<DeepRunDeleteResult>(raw);
    } catch (error) {
      if (error instanceof DeepRunRepositoryUnavailableError) throw error;
      throw new DeepRunRepositoryUnavailableError("Failed to delete terminal Deep Research state.");
    }
  }
}

function parseRecord(raw: unknown): DeepRunRecordV1 | null {
  if (!raw) return null;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return value as DeepRunRecordV1;
}

function parseClaimResult(raw: unknown): DeepRunClaimResult {
  return parseEvalJsonResult<DeepRunClaimResult>(raw);
}

function parseCommitResult(raw: unknown): DeepRunCommitResult {
  return parseEvalJsonResult<DeepRunCommitResult>(raw);
}

/**
 * Upstash deserializes JSON-looking Lua return values by default. Keep the
 * repository compatible with both that object form and raw Redis clients that
 * return the cjson string unchanged.
 */
function parseEvalJsonResult<T>(raw: unknown): T {
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}

/** Compile-time assertion that the projection remains a ResearchSession. */
const _researchSessionProjection: (record: DeepRunRecordV1) => ResearchSession =
  (record) => record.session;
void _researchSessionProjection;
