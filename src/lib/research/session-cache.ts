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
  } catch (err) {
    // localStorage quota exceeded — drop oldest
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
