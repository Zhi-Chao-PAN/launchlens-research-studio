// Research run persistence layer.
//
// Stores completed research runs to disk so they survive server restarts
// and can be browsed via the history page.
//
// Storage structure:
//   LAUNCHLENS_STORAGE_DIR/research/
//     runs/
//       <runId>.json   -full run metadata + result
//
// If LAUNCHLENS_STORAGE_DIR is not set, runs are stored in-memory only
// (best-effort, doesn't survive restarts).

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ResearchModeId } from "./research-modes";
import {
  isValidResearchRunId,
  resolveResearchRunFilePath,
} from "./run-id";
import type {
  AgentEvidenceLedgerEntry,
  AgentId,
  AgentOutput,
  AgentState,
  EvidenceLedger,
  ValidationLedger,
} from "@/lib/schema/research-schema";

const STORAGE_DIR = process.env.LAUNCHLENS_STORAGE_DIR || "";
const MAX_MEMORY_RUNS = 50; // in-memory cap when no storage dir

export interface ResearchDossierAgent {
  output?: AgentOutput;
  evidence?: AgentEvidenceLedgerEntry;
  resolvedProviderId?: string;
  degraded: boolean;
  degradedReason?: AgentState["degradedReason"];
}

export interface ResearchDossier {
  version: 1;
  agents: Record<AgentId, ResearchDossierAgent>;
  evidence?: EvidenceLedger;
  /** Optional for dossiers persisted before structural validation shipped. */
  validation?: ValidationLedger;
  degraded: boolean;
}

export interface ResearchRun {
  id: string;
  query: string;
  keywords: string[];
  /** Optional for backward compatibility with runs stored before modes existed. */
  mode?: ResearchModeId;
  result: string;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  // R212: "cancelled" is now a first-class persistence status so users can
  // find interrupted runs in History. Cancelled runs carry whatever partial
  // result/agents existed at the moment of cancellation.
  status: "completed" | "failed" | "cancelled";
  agent?: string;
  error?: string;
  /** Optional so run files written before full dossier persistence still load. */
  dossier?: ResearchDossier;
}

// In-memory cache (used even with disk storage, for fast listing)
const recentRuns: ResearchRun[] = [];

function getStoragePath(): string | null {
  if (!STORAGE_DIR) return null;
  const dir = path.join(STORAGE_DIR, "research");
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch {
    return null;
  }
}

function getRunsDir(): string | null {
  const base = getStoragePath();
  if (!base) return null;
  const runsDir = path.join(base, "runs");
  try {
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true });
    }
    return runsDir;
  } catch {
    return null;
  }
}

/**
 * Generate a new run ID.
 */
export function generateRunId(): string {
  return randomUUID();
}

/**
 * Save a completed research run to storage.
 */
export function saveResearchRun(run: ResearchRun): void {
  if (!isValidResearchRunId(run.id)) return;

  // Upsert into the in-memory list (most recent first). Terminal Deep records
  // can be reconciled by both the worker and a later read; duplicate history
  // rows must not be created by those idempotent observers.
  const existingIndex = recentRuns.findIndex((item) => item.id === run.id);
  if (existingIndex >= 0) recentRuns.splice(existingIndex, 1);
  recentRuns.unshift(run);
  if (recentRuns.length > MAX_MEMORY_RUNS) {
    recentRuns.length = MAX_MEMORY_RUNS;
  }

  // Persist to disk if storage is configured
  const runsDir = getRunsDir();
  if (!runsDir) return;
  try {
    const filePath = resolveResearchRunFilePath(runsDir, run.id);
    if (!filePath) return;
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf8");
  } catch {
    // Best-effort persistence -don't fail the research run if storage fails
  }
}

/**
 * List recent research runs (most recent first).
 * @param limit Maximum number of runs to return
 */
export function listResearchRuns(limit: number = 20): ResearchRun[] {
  return recentRuns.slice(0, Math.min(limit, recentRuns.length));
}

/**
 * Get a specific research run by ID.
 * Returns null if not found.
 */
export function getResearchRun(id: string): ResearchRun | null {
  if (!isValidResearchRunId(id)) return null;

  // Check memory first
  const memMatch = recentRuns.find((r) => r.id === id);
  if (memMatch) return memMatch;

  // Check disk if storage is configured
  const runsDir = getRunsDir();
  if (!runsDir) return null;
  try {
    const filePath = resolveResearchRunFilePath(runsDir, id);
    if (!filePath) return null;
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const run = JSON.parse(data) as ResearchRun;
      // Add to memory cache
      recentRuns.unshift(run);
      if (recentRuns.length > MAX_MEMORY_RUNS) {
        recentRuns.length = MAX_MEMORY_RUNS;
      }
      return run;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Delete a research run by ID.
 * Returns true if deleted, false if not found.
 */
export function deleteResearchRun(id: string): boolean {
  if (!isValidResearchRunId(id)) return false;

  // Remove from memory
  const memIdx = recentRuns.findIndex((r) => r.id === id);
  if (memIdx >= 0) {
    recentRuns.splice(memIdx, 1);
  }

  // Remove from disk
  const runsDir = getRunsDir();
  if (!runsDir) return memIdx >= 0;
  try {
    const filePath = resolveResearchRunFilePath(runsDir, id);
    if (!filePath) return memIdx >= 0;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Best-effort
  }
  return memIdx >= 0;
}


/**
 * Search and filter research runs.
 * @param options Search options
 */
export function searchResearchRuns(options: {
  query?: string;
  status?: "completed" | "failed" | "cancelled";
  provider?: string;
  limit?: number;
  offset?: number;
}): { runs: ResearchRun[]; total: number } {
  const { query, status, provider, limit = 20, offset = 0 } = options;

  let filtered = [...recentRuns];

  if (status) {
    filtered = filtered.filter((r) => r.status === status);
  }

  if (provider) {
    filtered = filtered.filter((r) => r.provider === provider);
  }

  if (query && query.trim()) {
    const q = query.toLowerCase().trim();
    filtered = filtered.filter((r) =>
      r.query.toLowerCase().includes(q) ||
      r.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }

  const total = filtered.length;
  const runs = filtered.slice(offset, offset + limit);

  return { runs, total };
}

/**
 * Bulk import research runs.
 * Replaces the in-memory list and persists all runs to disk.
 * Returns count of imported runs.
 */
export function bulkImportRuns(runs: ResearchRun[]): number {
  const validRuns = runs.filter((run) => isValidResearchRunId(run.id));

  // Replace in-memory list (newest first)
  recentRuns.length = 0;
  const sorted = [...validRuns].sort((a, b) => b.createdAt - a.createdAt);
  for (const run of sorted.slice(0, MAX_MEMORY_RUNS)) {
    recentRuns.push(run);
  }

  // Persist all to disk if storage configured
  const runsDir = getRunsDir();
  if (runsDir) {
    try {
      for (const run of validRuns) {
        const filePath = resolveResearchRunFilePath(runsDir, run.id);
        if (!filePath) continue;
        fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf8");
      }
    } catch {
      // Best-effort
    }
  }

  return Math.min(validRuns.length, MAX_MEMORY_RUNS);
}

/**
 * Get research storage info (for diagnostics / admin).
 */
export function getResearchStorageInfo() {
  const dir = getStoragePath();
  return {
    enabled: !!dir,
    storageDir: dir,
    maxMemoryRuns: MAX_MEMORY_RUNS,
    inMemoryCount: recentRuns.length,
  };
}

/**
 * R224: aggregate dashboard stats computed server-side over the in-memory
 * run cache. Returning pre-aggregated counts lets the home dashboard fetch
 * a single tiny payload instead of pulling up to 100 full summary rows and
 * re-counting on the client (the old ?limit=500 was silently capped to 100
 * by the runs route, so totalRuns was already wrong past 100 runs).
 *
 * `sinceMs` scopes the "recent" count (defaults to 7 days).
 */
export interface DashboardStats {
  totalRuns: number;
  recentRuns: number;
  totalDurationMs: number;
  byStatus: { completed: number; failed: number; cancelled: number };
}

export function getDashboardStats(sinceMs: number = 7 * 24 * 60 * 60 * 1000): DashboardStats {
  const now = Date.now();
  const cutoff = now - sinceMs;
  const byStatus = { completed: 0, failed: 0, cancelled: 0 };
  let recentCount = 0;
  let totalDurationMs = 0;

  for (const r of recentRuns) {
    if (r.status === "completed" || r.status === "failed" || r.status === "cancelled") {
      byStatus[r.status]++;
    }
    if (r.createdAt >= cutoff) recentCount++;
    totalDurationMs += r.durationMs || 0;
  }

  return {
    totalRuns: recentRuns.length,
    recentRuns: recentCount,
    totalDurationMs,
    byStatus,
  };
}

/**
 * Delete multiple research runs by IDs.
 * Returns count of successfully deleted runs.
 */
export function bulkDeleteRuns(ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    if (deleteResearchRun(id)) {
      count++;
    }
  }
  return count;
}

/**
 * Export runs in various formats.
 */
export function exportRuns(format: "json" | "csv" | "jsonl", ids?: string[]): string {
  const runs = ids
    ? ids.map((id) => getResearchRun(id)).filter((r): r is ResearchRun => r !== null)
    : listResearchRuns(100);

  switch (format) {
    case "json":
      return JSON.stringify(runs, null, 2);
    case "jsonl":
      return runs.map((r) => JSON.stringify(r)).join("\n");
    case "csv": {
      const headers = ["id", "query", "keywords", "status", "provider", "model", "createdAt", "durationMs", "hasSources"];
      const rows = runs.map((r) => [
        r.id,
        '"' + r.query.replace(/"/g, '""') + '"',
        '"' + r.keywords.join(", ").replace(/"/g, '""') + '"',
        r.status,
        r.provider,
        r.model,
        r.createdAt,
        r.durationMs,
        r.sources ? r.sources.length : 0,
      ].join(","));
      return [headers.join(","), ...rows].join("\n");
    }
    default:
      return "";
  }
}
