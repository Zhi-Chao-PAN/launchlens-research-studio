// Redis-backed completed-run store for production report/history recovery.
//
// `storage.ts` intentionally keeps a simple in-memory/disk implementation for
// local dev and tests. On Vercel, however, memory is per lambda instance and
// disk is ephemeral, so a LaunchLens backlink to /research/<id> can 404 after
// an instance switch. This module mirrors completed/cancelled runs into Redis
// when configured, while degrading to no-op when Redis env vars are absent.

import type { ResearchDossier, ResearchRun } from "./storage";
import type { AgentId, ResearchSession } from "@/lib/schema/research-schema";
import { getRedis } from "./redis-client";
import { normalizeResearchMode } from "./research-modes";

const RUN_KEY = (id: string) => `rs:run:${id}`;
const RUN_INDEX_KEY = "rs:runs:index";
const DEFAULT_RUN_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MIN_RUN_RETENTION_SECONDS = 60 * 60;
const MAX_INDEX_SIZE = 200;
const DOSSIER_AGENT_IDS: readonly AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

export interface ResearchRunSearchOptions {
  query?: string;
  status?: "completed" | "failed" | "cancelled";
  provider?: string;
  limit?: number;
  offset?: number;
}

export interface ResearchRunSummary {
  id: string;
  query: string;
  keywords: string[];
  status: ResearchRun["status"];
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  hasSources: boolean;
}

interface PersistedRunIndexSummary extends ResearchRunSummary {
  /** Prevent a refreshed index TTL from keeping expired run summaries alive. */
  expiresAt: number;
}

type PersistedRunIndexEntry = string | PersistedRunIndexSummary;

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
  const updatedMs = new Date(session.updatedAt).getTime();
  const completedMs = Number.isFinite(updatedMs) && updatedMs >= createdMs
    ? updatedMs
    : Date.now();
  const durationMs = Number.isFinite(createdMs) && createdMs > 0
    ? Math.max(0, completedMs - createdMs)
    : 0;

  return {
    id: session.id,
    query: session.query,
    keywords: session.keywords,
    mode: normalizeResearchMode(session.mode),
    result: resultText,
    provider: session.providerId ?? "mock",
    model: session.providerModel ?? session.providerId ?? "default",
    createdAt: createdMs,
    durationMs,
    status,
    dossier: researchDossierFromSession(session),
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

function researchDossierFromSession(session: ResearchSession): ResearchDossier {
  const agents = {} as ResearchDossier["agents"];

  for (const agentId of DOSSIER_AGENT_IDS) {
    const state = session.agents[agentId];
    const evidence = session.evidence?.agents[agentId];
    agents[agentId] = {
      ...(state?.output ? { output: state.output } : {}),
      ...(evidence ? { evidence } : {}),
      ...(state?.resolvedProviderId ? { resolvedProviderId: state.resolvedProviderId } : {}),
      degraded: state?.degraded === true,
      ...(state?.degradedReason ? { degradedReason: state.degradedReason } : {}),
    };
  }

  return {
    version: 1,
    agents,
    ...(session.evidence ? { evidence: session.evidence } : {}),
    ...(session.validation ? { validation: session.validation } : {}),
    degraded: DOSSIER_AGENT_IDS.some((agentId) => session.agents[agentId]?.degraded === true),
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

function parseRunIndex(raw: unknown): PersistedRunIndexEntry[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is PersistedRunIndexEntry => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>;
    return (
      typeof entry.id === "string" && entry.id.length > 0 &&
      typeof entry.query === "string" &&
      Array.isArray(entry.keywords) && entry.keywords.every((keyword) => typeof keyword === "string") &&
      ["completed", "failed", "cancelled"].includes(String(entry.status)) &&
      typeof entry.provider === "string" &&
      typeof entry.model === "string" &&
      typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) &&
      typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs) &&
      typeof entry.hasSources === "boolean" &&
      typeof entry.expiresAt === "number" && Number.isFinite(entry.expiresAt)
    );
  });
}

function summarizeRun(run: ResearchRun, expiresAt: number): PersistedRunIndexSummary {
  return {
    id: run.id,
    query: run.query,
    keywords: run.keywords,
    status: run.status,
    provider: run.provider,
    model: run.model,
    createdAt: run.createdAt,
    durationMs: run.durationMs,
    hasSources: Boolean(run.sources?.length),
    expiresAt,
  };
}

function publicSummary(entry: PersistedRunIndexSummary): ResearchRunSummary {
  return {
    id: entry.id,
    query: entry.query,
    keywords: entry.keywords,
    status: entry.status,
    provider: entry.provider,
    model: entry.model,
    createdAt: entry.createdAt,
    durationMs: entry.durationMs,
    hasSources: entry.hasSources,
  };
}

function indexEntryId(entry: PersistedRunIndexEntry): string {
  return typeof entry === "string" ? entry : entry.id;
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

async function fetchRunIndex(): Promise<PersistedRunIndexEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    return parseRunIndex(await redis.get<unknown>(RUN_INDEX_KEY));
  } catch (err) {
    console.error("[run-store] fetchRunIndex failed:", err);
    return [];
  }
}

async function storeRunIndex(entries: PersistedRunIndexEntry[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(RUN_INDEX_KEY, JSON.stringify(entries.slice(0, MAX_INDEX_SIZE)), {
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

    const retentionSeconds = runRetentionSeconds();
    const now = Date.now();
    const existing = (await fetchRunIndex()).filter((entry) =>
      (typeof entry === "string" || entry.expiresAt > now) && indexEntryId(entry) !== run.id,
    );
    const next = [summarizeRun(run, now + retentionSeconds * 1000), ...existing].slice(0, MAX_INDEX_SIZE);
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
): Promise<{ runs: ResearchRunSummary[]; total: number }> {
  const { query, status, provider, limit = 20, offset = 0 } = options;
  const ids = await fetchRunIndex();
  if (ids.length === 0) return { runs: [], total: 0 };

  const now = Date.now();
  const currentEntries = ids.filter((entry) => typeof entry === "string" || entry.expiresAt > now);
  const legacyIds = currentEntries.filter((entry): entry is string => typeof entry === "string");
  const legacyRuns = await Promise.all(legacyIds.map((id) => getPersistentResearchRun(id)));
  let filtered: ResearchRunSummary[] = [
    ...currentEntries
      .filter((entry): entry is PersistedRunIndexSummary => typeof entry !== "string")
      .map(publicSummary),
    ...legacyRuns
      .filter((run): run is ResearchRun => run !== null)
      .map((run) => publicSummary(summarizeRun(run, now + runRetentionSeconds() * 1000))),
  ];

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
  await storeRunIndex(existing.filter((entry) => !cleanIds.includes(indexEntryId(entry))));
  return deleted;
}
