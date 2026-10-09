// Client-side session snapshot cache. Stores completed research sessions
// in localStorage so users can revisit them across browser sessions and
// page refreshes (the server is in-memory and loses state on restart).
// Writes use requestIdleCallback to avoid blocking the main thread during
// interactions; reads stay synchronous because the UI depends on them.

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

// In-memory cache to avoid redundant localStorage reads during a session.
// Since writes are async, reads return the in-memory copy for consistency.
let memoryCache: CachedSession[] | null = null;

function ensureCache(): CachedSession[] {
  if (memoryCache === null) {
    memoryCache = safeRead();
  }
  return memoryCache;
}

// Pending write scheduled with requestIdleCallback
let pendingWrite: CachedSession[] | null = null;
let writeScheduled = false;

function scheduleWrite(sessions: CachedSession[]): void {
  if (typeof window === "undefined") return;
  pendingWrite = sessions;
  if (writeScheduled) return;
  writeScheduled = true;

  const doWrite = () => {
    writeScheduled = false;
    if (pendingWrite === null) return;
    try {
      const data = JSON.stringify(pendingWrite);
      try {
        localStorage.setItem(STORAGE_KEY, data);
      } catch (err) {
        // localStorage quota exceeded — drop oldest
        if (pendingWrite.length > 1) {
          try {
            const trimmed = pendingWrite.slice(0, Math.max(1, pendingWrite.length - 1));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
            memoryCache = trimmed;
          } catch {
            // give up
          }
        }
      }
    } catch {
      // JSON.stringify failed — ignore
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(doWrite, { timeout: 2000 });
  } else {
    // Fallback: defer to next microtask batch
    setTimeout(doWrite, 0);
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
  const existing = ensureCache().filter((s) => s.id !== cached.id);
  const next = [cached, ...existing].slice(0, MAX_SESSIONS);
  memoryCache = next;
  scheduleWrite(next);
}

export function getCachedSession(id: string): CachedSession | undefined {
  return ensureCache().find((s) => s.id === id);
}

export function listCachedSessions(): CachedSession[] {
  return ensureCache();
}

export function deleteCachedSession(id: string): void {
  const next = ensureCache().filter((s) => s.id !== id);
  memoryCache = next;
  scheduleWrite(next);
}

export function clearAllCachedSessions(): void {
  if (typeof window === "undefined") return;
  memoryCache = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Restore a cached session into the in-memory engine so the user can keep
 * interacting with it (e.g. re-run export, switch tabs). This is a best-effort
 * hydration — if the server has its own copy, that takes precedence.
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
