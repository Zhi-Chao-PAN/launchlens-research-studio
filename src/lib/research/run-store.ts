// Redis-backed completed-run store for production report/history recovery.
//
// `storage.ts` intentionally keeps a simple in-memory/disk implementation for
// local dev and tests. On Vercel, however, memory is per lambda instance and
// disk is ephemeral, so a LaunchLens backlink to /research/<id> can 404 after
// an instance switch. This module mirrors completed/cancelled runs into Redis
// when configured, while degrading to no-op when Redis env vars are absent.

import type { ResearchRun } from "./storage";
import type { ResearchSession } from "@/lib/schema/research-schema";
import { getRedis } from "./redis-client";

const RUN_KEY = (id: string) => `rs:run:${id}`;
const RUN_INDEX_KEY = "rs:runs:index";
const DEFAULT_RUN_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MIN_RUN_RETENTION_SECONDS = 60 * 60;
const MAX_INDEX_SIZE = 200;

export interface ResearchRunSearchOptions {
  query?: string;
  status?: "completed" | "failed" | "cancelled";
  provider?: string;
  limit?: number;
  offset?: number;
}

export function researchRunFromSession(
  session: ResearchSession,
  status: ResearchRun["status"] =
    session.status === "cancelled" ? "cancelled" : session.status === "error" ? "failed" : "completed",
): ResearchRun {
  const synthesisRaw = session.agents.synthesis?.output;
  const resultText =
    typeof synthesisRaw === "string"
      ? synthesisRaw
      : synthesisRaw
        ? JSON.stringify(synthesisRaw, null, 2)
        : "";

  const createdMs = new Date(session.createdAt).getTime();
  const durationMs = createdMs ? Date.now() - createdMs : 0;

  return {
    id: session.id,
    query: session.query,
    keywords: session.keywords,
    result: resultText,
    provider: session.providerId ?? "mock",
    model: session.providerModel ?? session.providerId ?? "default",
    createdAt: createdMs,
    durationMs,
    status,
    sources:
      session.citations
        ?.slice(0, 20)
        ?.filter((citation) => citation.url)
        ?.map((citation) => ({
          title: citation.title,
          url: citation.url || "",
          snippet: citation.snippet,
        })) || [],
  };
}

function runRetentionSeconds(): number {
  const raw = process.env.LAUNCHLENS_RUN_RETENTION_SECONDS ?? process.env.LAUNCHLENS_TERMINAL_SESSION_TTL_SECONDS;
  if (!raw) return DEFAULT_RUN_RETENTION_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= MIN_RUN_RETENTION_SECONDS
    ? parsed
    : DEFAULT_RUN_RETENTION_SECONDS;
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string");
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseResearchRun(raw: unknown): ResearchRun | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as ResearchRun;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as ResearchRun;
  return null;
}

async function fetchRunIndex(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    return parseStringArray(await redis.get<unknown>(RUN_INDEX_KEY));
  } catch (err) {
    console.error("[run-store] fetchRunIndex failed:", err);
    return [];
  }
}

async function storeRunIndex(ids: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(RUN_INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX_SIZE)), {
      ex: runRetentionSeconds(),
    });
  } catch (err) {
    console.error("[run-store] storeRunIndex failed:", err);
  }
}

export async function storePersistentResearchRun(run: ResearchRun): Promise<void> {
  const redis = getRedis();
  if (!redis || !run?.id) return;
  try {
    await redis.set(RUN_KEY(run.id), JSON.stringify(run), {
      ex: runRetentionSeconds(),
    });

    const existing = await fetchRunIndex();
    const next = [run.id, ...existing.filter((id) => id !== run.id)].slice(0, MAX_INDEX_SIZE);
    await storeRunIndex(next);
  } catch (err) {
    console.error(`[run-store] storePersistentResearchRun(${run.id}) failed:`, err);
  }
}

export async function getPersistentResearchRun(id: string): Promise<ResearchRun | null> {
  const redis = getRedis();
  const cleanId = id.trim();
  if (!redis || !cleanId) return null;
  try {
    return parseResearchRun(await redis.get<unknown>(RUN_KEY(cleanId)));
  } catch (err) {
    console.error(`[run-store] getPersistentResearchRun(${cleanId}) failed:`, err);
    return null;
  }
}

export async function searchPersistentResearchRuns(
  options: ResearchRunSearchOptions = {},
): Promise<{ runs: ResearchRun[]; total: number }> {
  const { query, status, provider, limit = 20, offset = 0 } = options;
  const ids = await fetchRunIndex();
  if (ids.length === 0) return { runs: [], total: 0 };

  const loaded = await Promise.all(ids.map((id) => getPersistentResearchRun(id)));
  let filtered = loaded.filter((run): run is ResearchRun => run !== null);

  if (status) {
    filtered = filtered.filter((run) => run.status === status);
  }
  if (provider) {
    filtered = filtered.filter((run) => run.provider === provider);
  }
  if (query && query.trim()) {
    const q = query.toLowerCase().trim();
    filtered = filtered.filter((run) =>
      run.query.toLowerCase().includes(q) ||
      run.keywords.some((keyword) => keyword.toLowerCase().includes(q)),
    );
  }

  filtered.sort((a, b) => b.createdAt - a.createdAt);
  return {
    runs: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

export async function deletePersistentResearchRuns(ids: string[]): Promise<number> {
  const redis = getRedis();
  const cleanIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!redis || cleanIds.length === 0) return 0;

  let deleted = 0;
  for (const id of cleanIds) {
    try {
      deleted += await redis.del(RUN_KEY(id));
    } catch (err) {
      console.error(`[run-store] delete ${id} failed:`, err);
    }
  }

  const existing = await fetchRunIndex();
  await storeRunIndex(existing.filter((id) => !cleanIds.includes(id)));
  return deleted;
}
