// Client-side session snapshot cache. Stores completed research sessions
// in localStorage so users can revisit them across browser sessions and
// page refreshes (the server is in-memory and loses state on restart).

import type { AgentId, AgentOutput, ResearchSession } from "@/lib/schema/research-schema";

const STORAGE_KEY = "launchlens:sessions";
const MAX_SESSIONS = 8;

export interface CachedSession {
  id: string;
  query: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  outputs: Record<AgentId, AgentOutput | null>;
  agentStatuses: Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean }>;
  citationCount: number;
  completedAt: string;
}

function safeRead(): CachedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CachedSession[];
  } catch {
    return [];
  }
}

function safeWrite(sessions: CachedSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage quota exceeded �� drop oldest
    if (sessions.length > 1) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, Math.max(1, sessions.length - 1))));
      } catch {
        // give up
      }
    }
  }
}

export function saveSessionSnapshot(session: ResearchSession): void {
  const cached: CachedSession = {
    id: session.id,
    query: session.query,
    keywords: session.keywords,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: new Date().toISOString(),
    outputs: {} as Record<AgentId, AgentOutput | null>,
    agentStatuses: {} as Record<AgentId, { status: string; progress: number; currentStep: string; hasOutput: boolean }>,
    citationCount: session.citations.length,
  };
  for (const [id, state] of Object.entries(session.agents) as [AgentId, ResearchSession["agents"][AgentId]][]) {
    cached.outputs[id] = state.output ?? null;
    cached.agentStatuses[id] = {
      status: state.status,
      progress: state.progress,
      currentStep: state.currentStep,
      hasOutput: !!state.output,
    };
  }
  const existing = safeRead().filter((s) => s.id !== cached.id);
  safeWrite([cached, ...existing].slice(0, MAX_SESSIONS));
}

export function getCachedSession(id: string): CachedSession | undefined {
  return safeRead().find((s) => s.id === id);
}

export function listCachedSessions(): CachedSession[] {
  return safeRead();
}

export function deleteCachedSession(id: string): void {
  safeWrite(safeRead().filter((s) => s.id !== id));
}

export function clearAllCachedSessions(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Restore a cached session into the in-memory engine so the user can keep
 * interacting with it (e.g. re-run export, switch tabs). This is a best-effort
 * hydration �� if the server has its own copy, that takes precedence.
 */
export function restoreCachedSessionIntoEngine(
  engine: {
    createResearchSession: (q: string, k: string[]) => ResearchSession;
  },
  cached: CachedSession,
): ResearchSession {
  const session = engine.createResearchSession(cached.query, cached.keywords);
  // Override server-generated id with the cached one (so client URL stays stable)
  // Note: in this codebase the id is generated inside createResearchSession, so we
  // accept that the restored session has a new id. The cached outputs can still
  // be displayed via getCachedSession(id).
  return session;
}


/* ------------------------------------------------------------------ */
/*  LRU-style access tracking                                          */
/* ------------------------------------------------------------------ */

const ACCESSED_KEY = "launchlens:sessions-accessed";

interface AccessRecord {
  id: string;
  accessedAt: string;
  accessCount: number;
}

function readAccessRecords(): AccessRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCESSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccessRecords(records: AccessRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCESSED_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

export function recordSessionAccess(id: string): void {
  const records = readAccessRecords();
  const existing = records.find((r) => r.id === id);
  const now = new Date().toISOString();
  if (existing) {
    existing.accessedAt = now;
    existing.accessCount = (existing.accessCount || 0) + 1;
  } else {
    records.push({ id, accessedAt: now, accessCount: 1 });
  }
  writeAccessRecords(records);
}

export function getSessionWithLruTouch(id: string): CachedSession | undefined {
  const session = getCachedSession(id);
  if (session) {
    recordSessionAccess(id);
    const all = safeRead();
    const idx = all.findIndex((s) => s.id === id);
    if (idx > 0) {
      const [item] = all.splice(idx, 1);
      safeWrite([item, ...all]);
    }
  }
  return session;
}

export function getLeastRecentlyUsedSessions(limit?: number): CachedSession[] {
  const sessions = safeRead();
  const accessRecords = readAccessRecords();
  const accessMap = new Map(accessRecords.map((r) => [r.id, r]));

  const sorted = [...sessions].sort((a, b) => {
    const aRec = accessMap.get(a.id);
    const bRec = accessMap.get(b.id);
    if (!aRec && !bRec) return 0;
    if (!aRec) return -1;
    if (!bRec) return 1;
    return new Date(aRec.accessedAt).getTime() - new Date(bRec.accessedAt).getTime();
  });

  return limit ? sorted.slice(0, limit) : sorted;
}

export function getSessionAccessStats(id: string): { accessedAt?: string; accessCount: number } {
  const records = readAccessRecords();
  const rec = records.find((r) => r.id === id);
  return {
    accessedAt: rec?.accessedAt,
    accessCount: rec?.accessCount ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Cache hit/miss statistics                                          */
/* ------------------------------------------------------------------ */

const STATS_KEY = "launchlens:sessions-stats";

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  lastResetAt: string;
}

function readCacheStats(): CacheStats {
  if (typeof window === "undefined") {
    return { hits: 0, misses: 0, evictions: 0, lastResetAt: new Date().toISOString() };
  }
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { hits: 0, misses: 0, evictions: 0, lastResetAt: new Date().toISOString() };
    return JSON.parse(raw);
  } catch {
    return { hits: 0, misses: 0, evictions: 0, lastResetAt: new Date().toISOString() };
  }
}

function writeCacheStats(stats: CacheStats): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export function getCacheStats(): CacheStats & {
  totalSessions: number;
  hitRate: number;
  totalRequests: number;
} {
  const stats = readCacheStats();
  const totalSessions = safeRead().length;
  const totalRequests = stats.hits + stats.misses;
  const hitRate = totalRequests > 0 ? Math.round((stats.hits / totalRequests) * 10000) / 100 : 0;
  return { ...stats, totalSessions, totalRequests, hitRate };
}

export function recordCacheHit(): void {
  const stats = readCacheStats();
  stats.hits++;
  writeCacheStats(stats);
}

export function recordCacheMiss(): void {
  const stats = readCacheStats();
  stats.misses++;
  writeCacheStats(stats);
}

export function recordCacheEviction(): void {
  const stats = readCacheStats();
  stats.evictions++;
  writeCacheStats(stats);
}

export function resetCacheStats(): void {
  writeCacheStats({ hits: 0, misses: 0, evictions: 0, lastResetAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/*  Size estimation                                                    */
/* ------------------------------------------------------------------ */

export function estimateSessionSize(id: string): number {
  const session = getCachedSession(id);
  if (!session) return 0;
  try {
    return JSON.stringify(session).length;
  } catch {
    return 0;
  }
}

export function estimateTotalCacheSize(): number {
  const sessions = safeRead();
  if (sessions.length === 0) return 0;
  try {
    return JSON.stringify(sessions).length;
  } catch {
    return 0;
  }
}

export function getAverageSessionSize(): number {
  const sessions = safeRead();
  if (sessions.length === 0) return 0;
  return Math.round(estimateTotalCacheSize() / sessions.length);
}

/* ------------------------------------------------------------------ */
/*  Batch operations                                                   */
/* ------------------------------------------------------------------ */

export function getCachedSessionsBatch(ids: string[]): CachedSession[] {
  const sessions = safeRead();
  const idSet = new Set(ids);
  return sessions.filter((s) => idSet.has(s.id));
}

export function deleteCachedSessionsBatch(ids: string[]): number {
  const idSet = new Set(ids);
  const existing = safeRead();
  const toDelete = existing.filter((s) => idSet.has(s.id)).length;
  safeWrite(existing.filter((s) => !idSet.has(s.id)));
  return toDelete;
}

export function deleteSessionsOlderThan(date: Date | number): number {
  const cutoff = typeof date === "number" ? date : date.getTime();
  const existing = safeRead();
  const remaining = existing.filter(
    (s) => new Date(s.createdAt).getTime() >= cutoff
  );
  const deleted = existing.length - remaining.length;
  safeWrite(remaining);
  return deleted;
}

/* ------------------------------------------------------------------ */
/*  Eviction helpers                                                   */
/* ------------------------------------------------------------------ */

export function evictLru(targetCount: number = MAX_SESSIONS): number {
  const sessions = safeRead();
  if (sessions.length <= targetCount) return 0;
  const lru = getLeastRecentlyUsedSessions();
  const toEvict = lru.length - targetCount;
  const idsToEvict = lru.slice(0, toEvict).map((s) => s.id);
  for (let i = 0; i < toEvict; i++) {
    recordCacheEviction();
  }
  const remaining = sessions.filter((s) => !idsToEvict.includes(s.id));
  safeWrite(remaining);
  return toEvict;
}

export function evictOldest(targetCount: number = MAX_SESSIONS): number {
  const sessions = safeRead();
  if (sessions.length <= targetCount) return 0;
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const toEvict = sessions.length - targetCount;
  const remaining = sorted.slice(toEvict);
  safeWrite(remaining);
  for (let i = 0; i < toEvict; i++) {
    recordCacheEviction();
  }
  return toEvict;
}

/* ------------------------------------------------------------------ */
/*  Warmup / preload                                                   */
/* ------------------------------------------------------------------ */

export function getTopAccessedSessions(limit: number = 5): CachedSession[] {
  const records = readAccessRecords();
  const sorted = [...records]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, limit);
  const sessions = safeRead();
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  return sorted.map((r) => sessionMap.get(r.id)).filter((s): s is CachedSession => !!s);
}

export function warmCache(limit: number = 5): number {
  const top = getTopAccessedSessions(limit);
  if (top.length === 0) return 0;
  const all = safeRead();
  const topIds = new Set(top.map((s) => s.id));
  const rest = all.filter((s) => !topIds.has(s.id));
  safeWrite([...top, ...rest]);
  return top.length;
}

/* ------------------------------------------------------------------ */
/*  Pure cache helpers (round 157) — side-effect free                 */
/* ------------------------------------------------------------------ */

export interface CacheSummary {
  totalSessions: number;
  totalOutputs: number;
  totalCitations: number;
  avgCitationCount: number;
  oldestCreatedAt?: string;
  newestCreatedAt?: string;
  sessionsWithOutputs: number;
  stalenessMs: number;
  isStale: boolean;
}

const DEFAULT_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function summarizeCachedSessions(
  sessions: CachedSession[],
  nowMs: number = Date.now(),
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): CacheSummary {
  let totalOutputs = 0, totalCitations = 0, withOutputs = 0;
  let oldestMs = Infinity, newestMs = -Infinity;
  for (const s of sessions) {
    let outCount = 0;
    for (const out of Object.values(s.outputs)) if (out) { outCount++; }
    totalOutputs += outCount;
    if (outCount > 0) withOutputs++;
    totalCitations += s.citationCount || 0;
    const created = new Date(s.createdAt).getTime();
    if (Number.isFinite(created)) {
      if (created < oldestMs) oldestMs = created;
      if (created > newestMs) newestMs = created;
    }
  }
  const total = sessions.length;
  const newestAge = newestMs > -Infinity ? Math.max(0, nowMs - newestMs) : 0;
  return {
    totalSessions: total,
    totalOutputs,
    totalCitations,
    avgCitationCount: total > 0 ? Math.round((totalCitations / total) * 100) / 100 : 0,
    oldestCreatedAt: oldestMs < Infinity ? new Date(oldestMs).toISOString() : undefined,
    newestCreatedAt: newestMs > -Infinity ? new Date(newestMs).toISOString() : undefined,
    sessionsWithOutputs: withOutputs,
    stalenessMs: newestAge,
    isStale: newestAge > staleThresholdMs,
  };
}

/** Compute hit-rate summary without mutating stats. */
export function computeHitRate(stats: { hits: number; misses: number; evictions: number }): {
  totalRequests: number; hitRate: number; missRate: number; evictionRate: number;
} {
  const total = stats.hits + stats.misses;
  const base = total > 0 ? total : 1;
  return {
    totalRequests: total,
    hitRate: Math.round((stats.hits / base) * 10000) / 100,
    missRate: Math.round((stats.misses / base) * 10000) / 100,
    evictionRate: Math.round((stats.evictions / base) * 10000) / 100,
  };
}

/** Shape check for localStorage data (defensive: corrupted JSON shouldn't crash UI). */
export function isValidCachedSession(value: unknown): value is CachedSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id) return false;
  if (typeof v.query !== "string") return false;
  if (!Array.isArray(v.keywords)) return false;
  if (typeof v.createdAt !== "string" || typeof v.updatedAt !== "string") return false;
  if (!v.outputs || typeof v.outputs !== "object") return false;
  if (!v.agentStatuses || typeof v.agentStatuses !== "object") return false;
  if (typeof v.citationCount !== "number") return false;
  if (typeof v.completedAt !== "string") return false;
  return true;
}

/** Filter and sort by createdAt desc. Tolerates invalid entries. */
export function sanitizeCachedSessions(entries: unknown[]): CachedSession[] {
  return entries
    .filter(isValidCachedSession)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** CSV export of cached sessions. */
export function cachedSessionsToCsv(sessions: CachedSession[]): string {
  const header = "id,query,keywords,citationCount,outputs,createdAt,completedAt";
  const rows = sessions.map((s) => {
    const outCount = Object.values(s.outputs).filter(Boolean).length;
    return [
      s.id, JSON.stringify(s.query), JSON.stringify(s.keywords.join("|")),
      s.citationCount, outCount, s.createdAt, s.completedAt,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

/** Deep structural equality for cached sessions. */
export function cachedSessionsEqual(a: CachedSession, b: CachedSession): boolean {
  if (a.id !== b.id) return false;
  if (a.query !== b.query) return false;
  if (a.citationCount !== b.citationCount) return false;
  if (a.createdAt !== b.createdAt || a.completedAt !== b.completedAt) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  if (a.keywords.some((k, i) => k !== b.keywords[i])) return false;
  const aAgents = Object.keys(a.agentStatuses).sort().join(",");
  const bAgents = Object.keys(b.agentStatuses).sort().join(",");
  if (aAgents !== bAgents) return false;
  for (const id of Object.keys(a.agentStatuses)) {
    const x = a.agentStatuses[id], y = b.agentStatuses[id];
    if (x.status !== y.status || x.progress !== y.progress || x.hasOutput !== y.hasOutput) return false;
  }
  return true;
}

/** Find sessions whose query matches a search term (case-insensitive substring). */
export function searchCachedSessions(sessions: CachedSession[], term: string): CachedSession[] {
  const q = term.trim().toLowerCase();
  if (!q) return sessions.slice();
  return sessions.filter((s) =>
    s.query.toLowerCase().includes(q) ||
    s.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

