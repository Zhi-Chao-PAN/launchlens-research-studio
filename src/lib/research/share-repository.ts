import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  normalizeStoredShareManifest,
  type PublicShareReportV1,
  type ShareManifestV1,
  type ShareSectionId,
} from "@/lib/research/share-manifest";
import { LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS } from "@/lib/research/share-compat";
import { getRedis } from "@/lib/research/redis-client";

const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const SHARE_KEY = (shareId: string) => `rs:share:v1:${shareId}`;
const LEGACY_TERMINAL_KEY = (shareId: string) => `rs:share:terminal:v1:${shareId}`;
const RUN_META_KEY = (shareId: string) => `rs:share:runmeta:v1:${shareId}`;
const RUN_INDEX_KEY = (runId: string) => `rs:share:run:${runId}`;
const GLOBAL_INDEX_KEY = "rs:share:index:v1";
const SHARE_ID_PATTERN = /^[a-f0-9]{64}$/;
const INDEX_SCAN_BATCH_SIZE = 200;

const CREATE_SHARE_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then return 0 end
redis.call("SADD", KEYS[2], ARGV[1])
redis.call("SADD", KEYS[3], ARGV[1])
redis.call("SET", KEYS[4], ARGV[3])
local ttl = tonumber(ARGV[4])
if ttl > 0 then
  redis.call("SET", KEYS[1], ARGV[2], "PX", ttl)
else
  redis.call("SET", KEYS[1], ARGV[2])
end
return 1
`;

const CONSUME_SHARE_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  redis.call("SREM", KEYS[2], ARGV[2])
  local runId = redis.call("GET", KEYS[4])
  if runId then
    redis.call("SREM", "rs:share:run:" .. tostring(runId), ARGV[2])
    redis.call("DEL", KEYS[4])
  end
  return ""
end
local share = cjson.decode(raw)
local now = tonumber(ARGV[1])
local function claim_legacy()
  if share.legacyAdopted == true or tostring(share.manageTokenHash or "") == "" then
    local ttl = tonumber(ARGV[3]) - now
    if ttl > 0 then redis.call("SET", KEYS[3], "1", "PX", ttl) end
  end
end
local function remove_terminal()
  redis.call("SREM", KEYS[2], ARGV[2])
  if share.runId ~= nil then
    redis.call("SREM", "rs:share:run:" .. tostring(share.runId), ARGV[2])
  end
  redis.call("DEL", KEYS[1], KEYS[4])
end
claim_legacy()
if share.revoked == true then remove_terminal() return "" end
if share.expiresAt ~= nil and share.expiresAt ~= cjson.null and tonumber(share.expiresAt) <= now then remove_terminal() return "" end
if share.maxViews ~= nil and share.maxViews ~= cjson.null and tonumber(share.views or 0) >= tonumber(share.maxViews) then remove_terminal() return "" end
share.views = tonumber(share.views or 0) + 1
local encoded = cjson.encode(share)
if share.maxViews ~= nil and share.maxViews ~= cjson.null and share.views >= tonumber(share.maxViews) then
  remove_terminal()
  return encoded
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl > 0 then
  redis.call("SET", KEYS[1], encoded, "PX", ttl)
elseif ttl == -1 then
  redis.call("SET", KEYS[1], encoded)
else
  return ""
end
return encoded
`;

const ADOPT_LEGACY_AND_CONSUME_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
local now = tonumber(ARGV[1])
if not raw then
  if redis.call("EXISTS", KEYS[3]) == 1 then return "" end
  local claimTtl = tonumber(ARGV[4]) - now
  if claimTtl <= 0 then return "" end
  local candidate = cjson.decode(ARGV[3])
  if candidate.revoked == true then return "" end
  if candidate.expiresAt ~= nil and candidate.expiresAt ~= cjson.null and tonumber(candidate.expiresAt) <= now then return "" end
  if candidate.maxViews ~= nil and candidate.maxViews ~= cjson.null and tonumber(candidate.views or 0) >= tonumber(candidate.maxViews) then return "" end
  redis.call("SADD", KEYS[2], ARGV[2])
  redis.call("SADD", "rs:share:run:" .. tostring(candidate.runId), ARGV[2])
  redis.call("SET", KEYS[3], "1", "PX", claimTtl)
  redis.call("SET", KEYS[4], tostring(candidate.runId))
  if candidate.expiresAt ~= nil and candidate.expiresAt ~= cjson.null then
    redis.call("SET", KEYS[1], ARGV[3], "PX", math.max(1, tonumber(candidate.expiresAt) - now))
  else
    redis.call("SET", KEYS[1], ARGV[3])
  end
  raw = ARGV[3]
end
local share = cjson.decode(raw)
redis.call("SET", KEYS[4], tostring(share.runId))
if share.legacyAdopted == true or tostring(share.manageTokenHash or "") == "" then
  local claimTtl = tonumber(ARGV[4]) - now
  if claimTtl > 0 then redis.call("SET", KEYS[3], "1", "PX", claimTtl) end
end
local function remove_terminal()
  redis.call("SREM", KEYS[2], ARGV[2])
  if share.runId ~= nil then
    redis.call("SREM", "rs:share:run:" .. tostring(share.runId), ARGV[2])
  end
  redis.call("DEL", KEYS[1], KEYS[4])
end
if share.revoked == true then remove_terminal() return "" end
if share.expiresAt ~= nil and share.expiresAt ~= cjson.null and tonumber(share.expiresAt) <= now then remove_terminal() return "" end
if share.maxViews ~= nil and share.maxViews ~= cjson.null and tonumber(share.views or 0) >= tonumber(share.maxViews) then remove_terminal() return "" end
share.views = tonumber(share.views or 0) + 1
local encoded = cjson.encode(share)
if share.maxViews ~= nil and share.maxViews ~= cjson.null and share.views >= tonumber(share.maxViews) then
  remove_terminal()
  return encoded
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl > 0 then
  redis.call("SET", KEYS[1], encoded, "PX", ttl)
elseif ttl == -1 then
  redis.call("SET", KEYS[1], encoded)
else
  return ""
end
return encoded
`;

const REVOKE_SHARE_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then
  redis.call("SREM", KEYS[2], ARGV[3])
  local runId = redis.call("GET", KEYS[4])
  if runId then
    redis.call("SREM", "rs:share:run:" .. tostring(runId), ARGV[3])
    redis.call("DEL", KEYS[4])
  end
  return 0
end
local share = cjson.decode(raw)
local isAdmin = ARGV[2] == "1"
if not isAdmin and tostring(share.manageTokenHash or "") ~= ARGV[1] then return 0 end
if share.legacyAdopted == true or tostring(share.manageTokenHash or "") == "" then
  local ttl = tonumber(ARGV[5]) - tonumber(ARGV[4])
  if ttl > 0 then redis.call("SET", KEYS[3], "1", "PX", ttl) end
end
redis.call("SREM", KEYS[2], ARGV[3])
if share.runId ~= nil then
  redis.call("SREM", "rs:share:run:" .. tostring(share.runId), ARGV[3])
end
redis.call("DEL", KEYS[1], KEYS[4])
return 1
`;

const REVOKE_LEGACY_SHARE_SCRIPT = `
local ttl = tonumber(ARGV[3]) - tonumber(ARGV[2])
if ttl > 0 then redis.call("SET", KEYS[3], "1", "PX", ttl) end
local raw = redis.call("GET", KEYS[1])
if raw then
  local share = cjson.decode(raw)
  if share.runId ~= nil then
    redis.call("SREM", "rs:share:run:" .. tostring(share.runId), ARGV[1])
  end
end
local storedRunId = redis.call("GET", KEYS[4])
if storedRunId then
  redis.call("SREM", "rs:share:run:" .. tostring(storedRunId), ARGV[1])
end
redis.call("SREM", KEYS[2], ARGV[1])
redis.call("DEL", KEYS[1], KEYS[4])
if raw or ttl > 0 then return 1 end
return 0
`;

interface StoredShareRecordV1 {
  version: 1;
  shareId: string;
  runId: string;
  manifest: ShareManifestV1;
  /** Missing only on legacy records created before snapshot-backed sharing. */
  report?: PublicShareReportV1;
  manageTokenHash: string;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
  revoked: boolean;
  /** Marks records imported from the pre-Redis plaintext token store. */
  legacyAdopted?: boolean;
}

export interface CreateShareRecordInput {
  runId: string;
  manifest: ShareManifestV1;
  report: PublicShareReportV1;
  expiresInMs?: number;
  maxViews?: number;
}

/** One-time input used to move a legacy plaintext-token record behind the
 * hashed-capability repository without resetting its view budget. */
export interface AdoptLegacyShareInput {
  token: string;
  runId: string;
  manifest: ShareManifestV1;
  report: PublicShareReportV1;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
}

export interface CreatedShareRecord {
  token: string;
  manageToken: string;
  runId: string;
  sections: ShareSectionId[];
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
}

export interface ConsumedShareRecord {
  runId: string;
  manifest: ShareManifestV1;
  /** Legacy records omit the snapshot and are resolved by the public route. */
  report?: PublicShareReportV1;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
}

export interface ShareManagementView extends Omit<ConsumedShareRecord, "report"> {
  shareId: string;
  revoked: boolean;
}

export type ShareRevocationAuthority =
  | { kind: "manager"; manageToken: string }
  | { kind: "admin" };

export interface ShareRepositoryStats {
  total: number;
  active: number;
  totalViews: number;
}

export interface ShareRepository {
  create(input: CreateShareRecordInput): Promise<CreatedShareRecord>;
  consume(token: string): Promise<ConsumedShareRecord | null>;
  adoptLegacyAndConsume(input: AdoptLegacyShareInput): Promise<ConsumedShareRecord | null>;
  /** Permanently blocks an already-validated legacy token during the compatibility window. */
  revokeLegacy(token: string): Promise<boolean>;
  revoke(token: string, authority: ShareRevocationAuthority): Promise<boolean>;
  listForRun(runId: string): Promise<ShareManagementView[]>;
  stats(): Promise<ShareRepositoryStats>;
}

export class ShareRepositoryUnavailableError extends Error {
  constructor(message = "Share storage is unavailable.") {
    super(message);
    this.name = "ShareRepositoryUnavailableError";
  }
}

/** Local-development adapter. Production selects the Redis adapter below. */
export class MemoryShareRepository implements ShareRepository {
  private readonly records = new Map<string, StoredShareRecordV1>();
  private readonly legacyClaims = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async create(input: CreateShareRecordInput): Promise<CreatedShareRecord> {
    validateCreateInput(input);
    const report = requirePublicReportSnapshot(input.report, input.manifest);
    const token = randomBytes(12).toString("base64url");
    const manageToken = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const record: StoredShareRecordV1 = {
      version: 1,
      shareId: hashCapability(token),
      runId: input.runId.trim(),
      manifest: cloneManifest(input.manifest),
      report,
      manageTokenHash: hashCapability(manageToken),
      createdAt,
      expiresAt: input.expiresInMs === undefined ? null : createdAt + input.expiresInMs,
      views: 0,
      maxViews: input.maxViews ?? null,
      revoked: false,
    };
    this.records.set(record.shareId, record);
    return createdView(record, token, manageToken);
  }

  async consume(token: string): Promise<ConsumedShareRecord | null> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return null;
    const record = this.records.get(shareId);
    if (!record) return null;
    const now = this.now();
    if (isLegacyAdopted(record)) this.claimLegacy(shareId, now);
    if (!isConsumable(record, now)) {
      this.records.delete(shareId);
      return null;
    }

    // No await occurs between the check and increment, so this transition is
    // atomic within the single-process development adapter.
    record.views += 1;
    const consumed = consumedView(record);
    if (record.maxViews !== null && record.views >= record.maxViews) {
      this.records.delete(shareId);
    } else {
      this.records.set(shareId, record);
    }
    return consumed;
  }

  async adoptLegacyAndConsume(input: AdoptLegacyShareInput): Promise<ConsumedShareRecord | null> {
    const candidate = legacyRecord(input);
    const now = this.now();
    let record = this.records.get(candidate.shareId);
    if (!record) {
      if (this.hasLegacyClaim(candidate.shareId, now)) return null;
      if (!isConsumable(candidate, now) || !this.claimLegacy(candidate.shareId, now)) return null;
      record = candidate;
      this.records.set(candidate.shareId, record);
    } else if (isLegacyAdopted(record)) {
      this.claimLegacy(candidate.shareId, now);
    }

    // Keep the claim, consume check, increment, and terminal deletion in one
    // synchronous transition so concurrent callers cannot reopen stale input.
    if (!isConsumable(record, now)) {
      this.records.delete(candidate.shareId);
      return null;
    }
    record.views += 1;
    const consumed = consumedView(record);
    if (record.maxViews !== null && record.views >= record.maxViews) {
      this.records.delete(candidate.shareId);
    } else {
      this.records.set(candidate.shareId, record);
    }
    return consumed;
  }

  async revokeLegacy(token: string): Promise<boolean> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return false;
    const now = this.now();
    const existed = this.records.delete(shareId);
    const claimed = this.claimLegacy(shareId, now);
    return existed || claimed;
  }

  async revoke(token: string, authority: ShareRevocationAuthority): Promise<boolean> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return false;
    const record = this.records.get(shareId);
    if (!record) return false;
    if (authority.kind === "manager") {
      const candidate = hashCapability(authority.manageToken);
      if (!safeHashEqual(candidate, record.manageTokenHash)) return false;
    }
    if (isLegacyAdopted(record)) this.claimLegacy(shareId, this.now());
    this.records.delete(shareId);
    return true;
  }

  async listForRun(runId: string): Promise<ShareManagementView[]> {
    this.pruneTerminalRecords();
    return [...this.records.values()]
      .filter((record) => record.runId === runId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(managementView);
  }

  async stats(): Promise<ShareRepositoryStats> {
    this.pruneTerminalRecords();
    const records = [...this.records.values()];
    const now = this.now();
    return {
      total: records.length,
      active: records.filter((record) => isConsumable(record, now)).length,
      totalViews: records.reduce((sum, record) => sum + record.views, 0),
    };
  }

  private pruneTerminalRecords(): void {
    const now = this.now();
    for (const [shareId, record] of this.records) {
      if (!isConsumable(record, now)) {
        if (isLegacyAdopted(record)) this.claimLegacy(shareId, now);
        this.records.delete(shareId);
      }
    }
    for (const [shareId, expiresAt] of this.legacyClaims) {
      if (expiresAt <= now) this.legacyClaims.delete(shareId);
    }
  }

  private hasLegacyClaim(shareId: string, now: number): boolean {
    const expiresAt = this.legacyClaims.get(shareId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= now) {
      this.legacyClaims.delete(shareId);
      return false;
    }
    return true;
  }

  private claimLegacy(shareId: string, now: number): boolean {
    if (now >= LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS) return false;
    this.legacyClaims.set(shareId, LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS);
    return true;
  }
}

/** Cross-instance production adapter backed by Upstash/Vercel Redis. */
export class RedisShareRepository implements ShareRepository {
  constructor(private readonly now: () => number = Date.now) {}

  async create(input: CreateShareRecordInput): Promise<CreatedShareRecord> {
    validateCreateInput(input);
    const report = requirePublicReportSnapshot(input.report, input.manifest);
    const redis = requireRedis();
    const createdAt = this.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      const token = randomBytes(12).toString("base64url");
      const manageToken = randomBytes(32).toString("base64url");
      const record: StoredShareRecordV1 = {
        version: 1,
        shareId: hashCapability(token),
        runId: input.runId.trim(),
        manifest: cloneManifest(input.manifest),
        report,
        manageTokenHash: hashCapability(manageToken),
        createdAt,
        expiresAt: input.expiresInMs === undefined ? null : createdAt + input.expiresInMs,
        views: 0,
        maxViews: input.maxViews ?? null,
        revoked: false,
      };
      const ttlMs = record.expiresAt === null ? 0 : Math.max(1, record.expiresAt - createdAt);
      try {
        const stored = await redis.eval<[string, string, string, string], unknown>(
          CREATE_SHARE_SCRIPT,
          [
            SHARE_KEY(record.shareId),
            GLOBAL_INDEX_KEY,
            RUN_INDEX_KEY(record.runId),
            RUN_META_KEY(record.shareId),
          ],
          [record.shareId, JSON.stringify(record), record.runId, String(ttlMs)],
        );
        if (stored !== 1 && stored !== "1") continue;
        return createdView(record, token, manageToken);
      } catch (error) {
        throw unavailable(error);
      }
    }
    throw new ShareRepositoryUnavailableError("Unable to allocate a unique share capability.");
  }

  async consume(token: string): Promise<ConsumedShareRecord | null> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return null;
    const redis = requireRedis();
    try {
      const raw = await redis.eval<[string, string, string], unknown>(
        CONSUME_SHARE_SCRIPT,
        [
          SHARE_KEY(shareId),
          GLOBAL_INDEX_KEY,
          LEGACY_TERMINAL_KEY(shareId),
          RUN_META_KEY(shareId),
        ],
        [String(this.now()), shareId, String(LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS)],
      );
      const record = parseStoredShareRecord(raw);
      return record ? consumedView(record) : null;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async adoptLegacyAndConsume(input: AdoptLegacyShareInput): Promise<ConsumedShareRecord | null> {
    const record = legacyRecord(input);
    const redis = requireRedis();
    try {
      const raw = await redis.eval<[string, string, string, string], unknown>(
        ADOPT_LEGACY_AND_CONSUME_SCRIPT,
        [
          SHARE_KEY(record.shareId),
          GLOBAL_INDEX_KEY,
          LEGACY_TERMINAL_KEY(record.shareId),
          RUN_META_KEY(record.shareId),
        ],
        [
          String(this.now()),
          record.shareId,
          JSON.stringify(record),
          String(LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS),
        ],
      );
      const consumed = parseStoredShareRecord(raw);
      return consumed ? consumedView(consumed) : null;
    } catch (error) {
      throw unavailable(error);
    }
  }

  async revokeLegacy(token: string): Promise<boolean> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return false;
    const redis = requireRedis();
    const now = this.now();
    try {
      const result = await redis.eval<[string, string, string], unknown>(
        REVOKE_LEGACY_SHARE_SCRIPT,
        [
          SHARE_KEY(shareId),
          GLOBAL_INDEX_KEY,
          LEGACY_TERMINAL_KEY(shareId),
          RUN_META_KEY(shareId),
        ],
        [shareId, String(now), String(LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS)],
      );
      return result === 1 || result === "1";
    } catch (error) {
      throw unavailable(error);
    }
  }

  async revoke(token: string, authority: ShareRevocationAuthority): Promise<boolean> {
    const shareId = shareIdForPublicToken(token);
    if (!shareId) return false;
    const redis = requireRedis();
    const managerHash = authority.kind === "manager"
      ? managerHashForToken(authority.manageToken)
      : "";
    if (managerHash === null) return false;
    try {
      const now = this.now();
      const result = await redis.eval<[string, string, string, string, string], unknown>(
        REVOKE_SHARE_SCRIPT,
        [
          SHARE_KEY(shareId),
          GLOBAL_INDEX_KEY,
          LEGACY_TERMINAL_KEY(shareId),
          RUN_META_KEY(shareId),
        ],
        [
          managerHash,
          authority.kind === "admin" ? "1" : "0",
          shareId,
          String(now),
          String(LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS),
        ],
      );
      return result === 1 || result === "1";
    } catch (error) {
      throw unavailable(error);
    }
  }

  async listForRun(runId: string): Promise<ShareManagementView[]> {
    const redis = requireRedis();
    try {
      const records = await scanIndexedRecords(redis, RUN_INDEX_KEY(runId), this.now(), runId);
      return records
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(managementView);
    } catch (error) {
      throw unavailable(error);
    }
  }

  async stats(): Promise<ShareRepositoryStats> {
    const redis = requireRedis();
    try {
      const now = this.now();
      const records = await scanIndexedRecords(redis, GLOBAL_INDEX_KEY, now);
      return {
        total: records.length,
        active: records.filter((record) => isConsumable(record, now)).length,
        totalViews: records.reduce((sum, record) => sum + record.views, 0),
      };
    } catch (error) {
      throw unavailable(error);
    }
  }
}

const memoryRepository = new MemoryShareRepository();
const redisRepository = new RedisShareRepository();

/** Select the durable adapter when Redis is configured, otherwise local Map. */
export function getShareRepository(): ShareRepository {
  return hasRedisCredentials() ? redisRepository : memoryRepository;
}

type RedisClient = NonNullable<ReturnType<typeof getRedis>>;

/**
 * Read a Redis set in bounded pages and fetch each page with one MGET. Stale
 * members are removed in one pipeline per page, preventing an expired share
 * from turning the two secondary indexes into ever-growing tombstone sets.
 */
async function scanIndexedRecords(
  redis: RedisClient,
  indexKey: string,
  now: number,
  expectedRunId?: string,
): Promise<StoredShareRecordV1[]> {
  const records = new Map<string, StoredShareRecordV1>();
  let cursor = "0";

  do {
    const [nextCursor, members] = await redis.sscan(
      indexKey,
      cursor,
      { count: INDEX_SCAN_BATCH_SIZE },
    );
    cursor = String(nextCursor);
    const rawIds = members.map(String);
    const shareIds = rawIds.filter((shareId) => SHARE_ID_PATTERN.test(shareId));
    const invalidIds = rawIds.filter((shareId) => !SHARE_ID_PATTERN.test(shareId));
    const includeRunMetadata = expectedRunId === undefined;
    const keysToFetch = [
      ...shareIds.map(SHARE_KEY),
      ...(includeRunMetadata ? shareIds.map(RUN_META_KEY) : []),
    ];
    const rawValues = keysToFetch.length > 0
      ? await redis.mget<unknown[]>(...keysToFetch)
      : [];
    const rawRecords = rawValues.slice(0, shareIds.length);
    const rawRunIds = includeRunMetadata ? rawValues.slice(shareIds.length) : [];

    const removals = new Map<string, Set<string>>();
    const keysToDelete = new Set<string>();
    const metadataToRepair = new Map<string, string>();
    const removeFrom = (key: string, shareId: string) => {
      const ids = removals.get(key) ?? new Set<string>();
      ids.add(shareId);
      removals.set(key, ids);
    };

    for (const invalidId of invalidIds) removeFrom(indexKey, invalidId);

    for (let index = 0; index < shareIds.length; index += 1) {
      const shareId = shareIds[index];
      const parsed = parseStoredShareRecord(rawRecords[index]);
      if (!parsed || parsed.shareId && parsed.shareId !== shareId) {
        removeFrom(indexKey, shareId);
        if (expectedRunId !== undefined) {
          removeFrom(GLOBAL_INDEX_KEY, shareId);
          removeFrom(RUN_INDEX_KEY(expectedRunId), shareId);
        } else if (typeof rawRunIds[index] === "string" && rawRunIds[index]) {
          removeFrom(RUN_INDEX_KEY(String(rawRunIds[index])), shareId);
        }
        keysToDelete.add(SHARE_KEY(shareId));
        keysToDelete.add(RUN_META_KEY(shareId));
        continue;
      }

      const record = parsed.shareId ? parsed : { ...parsed, shareId };
      if (expectedRunId !== undefined && record.runId !== expectedRunId) {
        // The record is valid but was accidentally indexed under another run.
        removeFrom(indexKey, shareId);
        continue;
      }
      if (!isConsumable(record, now)) {
        removeFrom(GLOBAL_INDEX_KEY, shareId);
        removeFrom(RUN_INDEX_KEY(record.runId), shareId);
        keysToDelete.add(SHARE_KEY(shareId));
        keysToDelete.add(RUN_META_KEY(shareId));
        continue;
      }
      if (includeRunMetadata && rawRunIds[index] !== record.runId) {
        if (typeof rawRunIds[index] === "string" && rawRunIds[index]) {
          removeFrom(RUN_INDEX_KEY(String(rawRunIds[index])), shareId);
        }
        metadataToRepair.set(shareId, record.runId);
      }
      records.set(shareId, record);
    }

    if (removals.size > 0 || keysToDelete.size > 0 || metadataToRepair.size > 0) {
      const pipeline = redis.pipeline();
      for (const [key, ids] of removals) pipeline.srem(key, ...ids);
      for (const [shareId, runId] of metadataToRepair) {
        pipeline.set(RUN_META_KEY(shareId), runId);
        pipeline.sadd(RUN_INDEX_KEY(runId), shareId);
      }
      if (keysToDelete.size > 0) pipeline.del(...keysToDelete);
      await pipeline.exec();
    }
  } while (cursor !== "0");

  return [...records.values()];
}

function legacyRecord(input: AdoptLegacyShareInput): StoredShareRecordV1 {
  const shareId = shareIdForPublicToken(input.token);
  const runId = typeof input.runId === "string" ? input.runId.trim() : "";
  if (!shareId || !runId) throw new TypeError("a valid legacy share token and runId are required");
  if (!Number.isFinite(input.createdAt) || input.createdAt < 0) {
    throw new TypeError("legacy createdAt must be a non-negative timestamp");
  }
  if (
    input.expiresAt !== null &&
    (!Number.isFinite(input.expiresAt) || input.expiresAt < 0)
  ) {
    throw new TypeError("legacy expiresAt must be null or a non-negative timestamp");
  }
  if (!Number.isInteger(input.views) || input.views < 0) {
    throw new TypeError("legacy views must be a non-negative integer");
  }
  if (
    input.maxViews !== null &&
    (!Number.isInteger(input.maxViews) || input.maxViews < 1)
  ) {
    throw new TypeError("legacy maxViews must be null or a positive integer");
  }
  if (!input.manifest || input.manifest.version !== 1 || input.manifest.sections.length === 0) {
    throw new TypeError("a valid legacy share manifest is required");
  }

  return {
    version: 1,
    shareId,
    runId,
    manifest: cloneManifest(input.manifest),
    report: requirePublicReportSnapshot(input.report, input.manifest),
    // Legacy links never had a separate management capability. Keeping this
    // empty means only an authenticated administrator can revoke after import.
    manageTokenHash: "",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    views: input.views,
    maxViews: input.maxViews,
    revoked: false,
    legacyAdopted: true,
  };
}

function validateCreateInput(input: CreateShareRecordInput): void {
  if (!input.runId || !input.runId.trim()) throw new TypeError("runId is required");
  if (!input.manifest || input.manifest.version !== 1 || input.manifest.sections.length === 0) {
    throw new TypeError("a valid share manifest is required");
  }
  if (!input.report) throw new TypeError("a public report snapshot is required");
  if (
    input.expiresInMs !== undefined &&
    (typeof input.expiresInMs !== "number" || !Number.isFinite(input.expiresInMs) || input.expiresInMs <= 0)
  ) {
    throw new TypeError("expiresInMs must be a positive finite number");
  }
  if (
    input.maxViews !== undefined &&
    (!Number.isInteger(input.maxViews) || input.maxViews < 1)
  ) {
    throw new TypeError("maxViews must be a positive integer");
  }
}

function createdView(
  record: StoredShareRecordV1,
  token: string,
  manageToken: string,
): CreatedShareRecord {
  return {
    token,
    manageToken,
    runId: record.runId,
    sections: [...record.manifest.sections],
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    views: record.views,
    maxViews: record.maxViews,
  };
}

function consumedView(record: StoredShareRecordV1): ConsumedShareRecord {
  return {
    runId: record.runId,
    manifest: cloneManifest(record.manifest),
    ...(record.report
      ? { report: requirePublicReportSnapshot(record.report, record.manifest) }
      : {}),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    views: record.views,
    maxViews: record.maxViews,
  };
}

function managementView(record: StoredShareRecordV1): ShareManagementView {
  return {
    shareId: record.shareId,
    runId: record.runId,
    manifest: cloneManifest(record.manifest),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    views: record.views,
    maxViews: record.maxViews,
    revoked: record.revoked,
  };
}

function cloneManifest(manifest: ShareManifestV1): ShareManifestV1 {
  return { version: 1, sections: [...manifest.sections] };
}

/**
 * Rebuild the snapshot through a strict allowlist. Besides isolating the
 * stored value from caller mutation, this prevents accidental persistence of
 * raw run/provider/model fields if an internal caller bypasses the mapper's
 * TypeScript type.
 */
function requirePublicReportSnapshot(
  input: unknown,
  manifest: ShareManifestV1,
): PublicShareReportV1 {
  const report = normalizePublicReportSnapshot(input, manifest);
  if (!report) throw new TypeError("a valid public report snapshot is required");
  return report;
}

function normalizePublicReportSnapshot(
  input: unknown,
  manifest: ShareManifestV1,
): PublicShareReportV1 | null {
  const source = asRecord(input);
  const sourceSections = asRecord(source?.sections);
  if (
    !source || source.version !== 1 || source.status !== "completed" ||
    typeof source.query !== "string" ||
    typeof source.createdAt !== "number" || !Number.isFinite(source.createdAt) || source.createdAt < 0 ||
    typeof source.durationMs !== "number" || !Number.isFinite(source.durationMs) || source.durationMs < 0 ||
    !sourceSections
  ) {
    return null;
  }

  const sections: PublicShareReportV1["sections"] = {};
  for (const section of manifest.sections) {
    if (section === "summary") {
      if (typeof sourceSections.summary !== "string") return null;
      sections.summary = sourceSections.summary;
    } else if (section === "scores") {
      const scores = asRecord(sourceSections.scores);
      if (!scores || !isScore(scores.opportunityScore) || !isScore(scores.riskScore)) return null;
      sections.scores = {
        opportunityScore: scores.opportunityScore,
        riskScore: scores.riskScore,
      };
    } else if (section === "insights") {
      const insights = cloneInsights(sourceSections.insights);
      if (!insights) return null;
      sections.insights = insights;
    } else if (section === "opportunities") {
      const opportunities = cloneOpportunities(sourceSections.opportunities);
      if (!opportunities) return null;
      sections.opportunities = opportunities;
    } else if (section === "risks") {
      const risks = cloneRisks(sourceSections.risks);
      if (!risks) return null;
      sections.risks = risks;
    } else if (section === "nextStep") {
      if (typeof sourceSections.nextStep !== "string") return null;
      sections.nextStep = sourceSections.nextStep;
    } else if (section === "sources") {
      const sources = cloneSources(sourceSections.sources);
      if (!sources) return null;
      sections.sources = sources;
    }
  }

  return {
    version: 1,
    query: source.query,
    createdAt: source.createdAt,
    durationMs: source.durationMs,
    status: "completed",
    sections,
  };
}

function cloneInsights(value: unknown): PublicShareReportV1["sections"]["insights"] | null {
  if (!Array.isArray(value)) return null;
  const result: NonNullable<PublicShareReportV1["sections"]["insights"]> = [];
  for (const item of value) {
    const source = asRecord(item);
    if (
      !source || typeof source.insight !== "string" ||
      !Array.isArray(source.supportingAgents) ||
      !source.supportingAgents.every((agent) => typeof agent === "string") ||
      source.confidence !== "high" && source.confidence !== "medium" && source.confidence !== "low"
    ) return null;
    result.push({
      insight: source.insight,
      supportingAgents: [...source.supportingAgents] as string[],
      confidence: source.confidence,
    });
  }
  return result;
}

function cloneOpportunities(value: unknown): PublicShareReportV1["sections"]["opportunities"] | null {
  if (!Array.isArray(value)) return null;
  const result: NonNullable<PublicShareReportV1["sections"]["opportunities"]> = [];
  for (const item of value) {
    const source = asRecord(item);
    if (
      !source || typeof source.title !== "string" ||
      typeof source.description !== "string" || typeof source.rationale !== "string"
    ) return null;
    result.push({ title: source.title, description: source.description, rationale: source.rationale });
  }
  return result;
}

function cloneRisks(value: unknown): PublicShareReportV1["sections"]["risks"] | null {
  if (!Array.isArray(value)) return null;
  const result: NonNullable<PublicShareReportV1["sections"]["risks"]> = [];
  for (const item of value) {
    const source = asRecord(item);
    if (
      !source || typeof source.title !== "string" ||
      typeof source.description !== "string" || typeof source.mitigation !== "string"
    ) return null;
    result.push({ title: source.title, description: source.description, mitigation: source.mitigation });
  }
  return result;
}

function cloneSources(value: unknown): PublicShareReportV1["sections"]["sources"] | null {
  if (!Array.isArray(value)) return null;
  const result: NonNullable<PublicShareReportV1["sections"]["sources"]> = [];
  for (const item of value) {
    const source = asRecord(item);
    if (
      !source || typeof source.title !== "string" || typeof source.url !== "string" ||
      source.snippet !== undefined && typeof source.snippet !== "string"
    ) return null;
    result.push({
      title: source.title,
      url: source.url,
      ...(typeof source.snippet === "string" ? { snippet: source.snippet } : {}),
    });
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isConsumable(record: StoredShareRecordV1, now: number): boolean {
  if (record.revoked) return false;
  if (record.expiresAt !== null && now >= record.expiresAt) return false;
  if (record.maxViews !== null && record.views >= record.maxViews) return false;
  return true;
}

function isLegacyAdopted(record: StoredShareRecordV1): boolean {
  // Empty management hashes identify records imported by the first migration
  // release, before the explicit marker was added.
  return record.legacyAdopted === true || record.manageTokenHash === "";
}

function shareIdForPublicToken(token: string): string | null {
  if (typeof token !== "string" || !PUBLIC_TOKEN_PATTERN.test(token)) return null;
  return hashCapability(token);
}

function hashCapability(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function managerHashForToken(token: string): string | null {
  if (typeof token !== "string" || !PUBLIC_TOKEN_PATTERN.test(token)) return null;
  return hashCapability(token);
}

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new ShareRepositoryUnavailableError();
  return redis;
}

function hasRedisCredentials(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
  );
}

function unavailable(error: unknown): ShareRepositoryUnavailableError {
  if (error instanceof ShareRepositoryUnavailableError) return error;
  console.error("[share-repository] Redis operation failed:", error);
  return new ShareRepositoryUnavailableError();
}

function parseStoredShareRecord(raw: unknown): StoredShareRecordV1 | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.runId !== "string" || !record.runId ||
    typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt) ||
    typeof record.views !== "number" || !Number.isFinite(record.views) || record.views < 0 ||
    record.expiresAt !== null && record.expiresAt !== undefined &&
      (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) ||
    record.maxViews !== null && record.maxViews !== undefined &&
      (typeof record.maxViews !== "number" || !Number.isInteger(record.maxViews) || record.maxViews < 1)
  ) {
    return null;
  }
  try {
    const manifest = normalizeStoredShareManifest(record.manifest);
    const report = record.report === undefined
      ? undefined
      : normalizePublicReportSnapshot(record.report, manifest);
    if (record.report !== undefined && !report) return null;
    return {
      version: 1,
      shareId: typeof record.shareId === "string" ? record.shareId : "",
      runId: record.runId,
      manifest,
      ...(report ? { report } : {}),
      manageTokenHash: typeof record.manageTokenHash === "string" ? record.manageTokenHash : "",
      createdAt: record.createdAt,
      expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : null,
      views: Math.floor(record.views),
      maxViews: typeof record.maxViews === "number" ? record.maxViews : null,
      revoked: record.revoked === true,
      ...(record.legacyAdopted === true ? { legacyAdopted: true } : {}),
    };
  } catch {
    return null;
  }
}
