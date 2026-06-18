/**
 * Batch research manager - queues and processes multiple research runs.
 * Global singleton with concurrency limits and priority queuing.
 *
 * Features:
 * - Configurable global concurrency limit (default: 3)
 * - Priority-based scheduling (high / normal / low)
 * - Per-batch concurrency override
 * - Retry on failure
 * - Progress tracking with ETA estimation
 */

import { createResearchSession } from "@/lib/research/research-engine";
import { saveResearchRun } from "@/lib/research/storage";

export type BatchPriority = "high" | "normal" | "low";

export interface BatchRun {
  id: string;
  query: string;
  status: "queued" | "running" | "completed" | "failed";
  priority: BatchPriority;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
}

export interface Batch {
  id: string;
  total: number;
  completed: number;
  failed: number;
  status: "running" | "completed" | "paused";
  runs: BatchRun[];
  createdAt: number;
  completedAt?: number;
  priority: BatchPriority;
  concurrency: number;
  retriesPerRun: number;
  eta?: number;
  avgRunDuration?: number;
  progress: number;
  /** Internal sequence number for stable sort ordering. */
  _seq: number;
  /** Agent persona to use for runs (internal). */
  _agent?: string;
}

export interface CreateBatchOptions {
  provider?: string;
  model?: string;
  agent?: string;
  priority?: BatchPriority;
  concurrency?: number;
  retriesPerRun?: number;
}

export interface ConcurrencyStats {
  globalConcurrency: number;
  globalActive: number;
  globalQueued: number;
  batchCount: number;
  activeBatchCount: number;
}

declare global {
  var __batchStore: Map<string, Batch> | undefined;
  var __globalConcurrency: number;
  var __activeRuns: number;
  var __schedulerRunning: boolean;
  var __schedulerQueue: Array<{ batchId: string; runIndex: number; priority: BatchPriority; resolve: () => void }>;
}

const DEFAULT_GLOBAL_CONCURRENCY = 3;
const DEFAULT_BATCH_CONCURRENCY = 2;
const DEFAULT_RETRIES = 1;
const MAX_GLOBAL_CONCURRENCY = 10;

/** Reset all state (for testing only). */
export function _resetBatchManager(): void {
  global.__batchStore = undefined;
  global.__activeRuns = 0;
  global.__schedulerRunning = false;
  __sequenceCounter = 0;
}

function getStore(): Map<string, Batch> {
  if (!global.__batchStore) {
    global.__batchStore = new Map();
  }
  return global.__batchStore;
}

function getGlobalConcurrency(): number {
  return (global.__globalConcurrency || DEFAULT_GLOBAL_CONCURRENCY);
}

function getActiveRuns(): number {
  return global.__activeRuns || 0;
}

function incrementActive(): number {
  global.__activeRuns = (global.__activeRuns || 0) + 1;
  return global.__activeRuns;
}

function decrementActive(): number {
  global.__activeRuns = Math.max(0, (global.__activeRuns || 0) - 1);
  return global.__activeRuns;
}

function generateId(): string {
  return "batch-" + Math.random().toString(36).slice(2, 10);
}

let __sequenceCounter = 0;
function nextSequence(): number {
  return ++__sequenceCounter;
}

const PRIORITY_ORDER: Record<BatchPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/** Set the global concurrency limit (1-10). Returns the previous value. */
export function setGlobalConcurrency(limit: number): number {
  const prev = getGlobalConcurrency();
  global.__globalConcurrency = Math.max(1, Math.min(MAX_GLOBAL_CONCURRENCY, Math.floor(limit)));
  // Wake the scheduler if we increased capacity
  if (global.__globalConcurrency > prev) {
    void runScheduler();
  }
  return prev;
}

/** Get current concurrency statistics. */
export function getConcurrencyStats(): ConcurrencyStats {
  const store = getStore();
  const activeBatches = Array.from(store.values()).filter((b) => b.status === "running");
  const queued = Array.from(store.values())
    .reduce((sum, b) => sum + b.runs.filter((r) => r.status === "queued").length, 0);

  return {
    globalConcurrency: getGlobalConcurrency(),
    globalActive: getActiveRuns(),
    globalQueued: queued,
    batchCount: store.size,
    activeBatchCount: activeBatches.length,
  };
}

/** Create a new batch of research runs. */
export function createBatch(
  queries: string[],
  keywords: string[] = [],
  options: CreateBatchOptions = {},
): Batch {
  const id = generateId();
  const now = Date.now();
  const priority = options.priority || "normal";
  const agent = options.agent || undefined;
  const concurrency = Math.min(
    options.concurrency || DEFAULT_BATCH_CONCURRENCY,
    queries.length,
    getGlobalConcurrency(),
  );
  const retriesPerRun = options.retriesPerRun ?? DEFAULT_RETRIES;

  const runs: BatchRun[] = queries.map((query) => ({
    id: "",
    query,
    status: "queued",
    priority,
    retryCount: 0,
  }));

  const batch: Batch = {
    id,
    total: queries.length,
    completed: 0,
    failed: 0,
    status: "running",
    runs,
    createdAt: now,
    _seq: nextSequence(),
    priority,
    concurrency,
    retriesPerRun,
    progress: 0,
  };

  getStore().set(id, batch);

  // Kick off batch processing
  void processBatch(id, queries, keywords, options);

  return batch;
}

/** Get a batch by ID with computed progress. */
export function getBatch(id: string): Batch | null {
  const batch = getStore().get(id);
  if (!batch) return null;

  const done = batch.completed + batch.failed;
  const progress = batch.total > 0 ? Math.round((done / batch.total) * 100) : 0;

  // Compute ETA if we have active runs
  let eta: number | undefined = undefined;
  let avgRunDuration: number | undefined = undefined;
  const completedRuns = batch.runs.filter((r) => r.startedAt && r.completedAt);
  if (completedRuns.length > 0) {
    const totalMs = completedRuns.reduce((sum, r) => sum + (r.completedAt! - r.startedAt!), 0);
    avgRunDuration = Math.round(totalMs / completedRuns.length);
    const remaining = batch.total - done;
    const effectiveConcurrency = Math.min(batch.concurrency, remaining);
    if (effectiveConcurrency > 0) {
      eta = Date.now() + Math.round((remaining * avgRunDuration) / effectiveConcurrency);
    }
  }

  return {
    ...batch,
    progress,
    eta,
    avgRunDuration,
  };
}

/** List recent batches. */
export function listBatches(limit = 20): Batch[] {
  return Array.from(getStore().values())
    .sort((a, b) => b._seq - a._seq)
    .slice(0, limit)
    .map((b) => getBatch(b.id)!);
}

/** Pause a running batch. Queued runs will not start, in-flight runs continue. */
export function pauseBatch(id: string): boolean {
  const batch = getStore().get(id);
  if (!batch || batch.status !== "running") return false;
  batch.status = "paused";
  getStore().set(id, { ...batch });
  return true;
}

/** Resume a paused batch. */
export function resumeBatch(id: string): boolean {
  const batch = getStore().get(id);
  if (!batch || batch.status !== "paused") return false;
  batch.status = "running";
  getStore().set(id, { ...batch });
  void runScheduler(); // wake scheduler
  return true;
}

/** Cancel a batch (same as pause + mark all queued as failed). */
export function cancelBatch(id: string): boolean {
  const batch = getStore().get(id);
  if (!batch) return false;
  batch.status = "paused";
  for (const run of batch.runs) {
    if (run.status === "queued") {
      run.status = "failed";
      run.error = "cancelled";
      batch.failed++;
    }
  }
  // If nothing is running, mark completed
  const running = batch.runs.filter((r) => r.status === "running").length;
  if (running === 0) {
    batch.status = "completed";
    batch.completedAt = Date.now();
  }
  getStore().set(id, { ...batch });
  return true;
}

/**
 * Global scheduler - picks the next queued run across all batches,
 * respecting global concurrency limits and priority ordering.
 */
let _schedulerTimer: NodeJS.Timeout | null = null;

function runScheduler(): void {
  // Already running an iteration
  if (global.__schedulerRunning) return;
  global.__schedulerRunning = true;

  try {
    while (tryStartOneRun()) {
      // keep starting runs until we hit concurrency limit or no more queued
    }
  } finally {
    global.__schedulerRunning = false;
  }

  // Check again shortly in case new batches arrive or runs finish
  if (_schedulerTimer) clearTimeout(_schedulerTimer);
  _schedulerTimer = setTimeout(() => {
    _schedulerTimer = null;
    if (hasQueuedRuns()) {
      void runScheduler();
    }
  }, 500);
}

function hasQueuedRuns(): boolean {
  const store = getStore();
  for (const batch of store.values()) {
    if (batch.status !== "running") continue;
    if (batch.runs.some((r) => r.status === "queued")) return true;
  }
  return false;
}

/**
 * Try to start one queued run. Returns true if a run was started,
 * false if no run could be started (concurrency full or nothing queued).
 */
function tryStartOneRun(): boolean {
  if (getActiveRuns() >= getGlobalConcurrency()) return false;

  const store = getStore();
  let best: { batchId: string; runIndex: number; priority: BatchPriority; batchCreatedAt: number } | null = null;

  for (const [batchId, batch] of store.entries()) {
    if (batch.status !== "running") continue;

    // Check per-batch concurrency
    const batchActive = batch.runs.filter((r) => r.status === "running").length;
    if (batchActive >= batch.concurrency) continue;

    // Find first queued run
    for (let i = 0; i < batch.runs.length; i++) {
      const run = batch.runs[i];
      if (run.status === "queued") {
        // Compare with best: priority first, then batch creation time (FIFO within priority)
        if (!best ||
          PRIORITY_ORDER[run.priority] < PRIORITY_ORDER[best.priority] ||
          (PRIORITY_ORDER[run.priority] === PRIORITY_ORDER[best.priority] && batch.createdAt < best.batchCreatedAt)
        ) {
          best = { batchId, runIndex: i, priority: run.priority, batchCreatedAt: batch.createdAt };
        }
        break; // only consider first queued per batch for fairness
      }
    }
  }

  if (!best) return false;

  // Start the run
  const batch = store.get(best.batchId)!
  const run = batch.runs[best.runIndex];
  run.status = "running";
  run.startedAt = Date.now();
  incrementActive();
  store.set(best.batchId, { ...batch });

  // Fire and forget
  void executeRun(best.batchId, best.runIndex).then(() => {
    decrementActive();
    void runScheduler(); // schedule next
  });

  return true;
}

async function executeRun(batchId: string, runIndex: number): Promise<void> {
  const store = getStore();
  const batch = store.get(batchId);
  if (!batch) return;
  const run = batch.runs[runIndex];

  // Find the query - use the run index to match (queries are in order)
  const query = run.query;

  let lastError: string | undefined = undefined;
  const maxAttempts = batch.retriesPerRun + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        run.retryCount = attempt;
        // Exponential backoff on retry
        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt - 1)));
      }

      const agentId = batch._agent || (batch.priority === "high" ? "analyst" : undefined);
      const session = createResearchSession(query, [], agentId);
      run.id = session.id;

      // Poll for completion
      await waitForCompletion(session.id);

      // Get final state
      const finalRun = getFinalRun(session.id);
      if (finalRun && finalRun.status === "failed") {
        throw new Error("research run failed");
      }

      // Success
      run.status = "completed";
      batch.completed++;
      run.completedAt = Date.now();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (lastError) {
    run.status = "failed";
    run.error = lastError;
    batch.failed++;
    run.completedAt = Date.now();
  }

  // Check if batch is done
  const allDone = batch.runs.every((r) => r.status === "completed" || r.status === "failed");
  if (allDone) {
    batch.status = "completed";
    batch.completedAt = Date.now();
  }

  store.set(batchId, { ...batch });
}

function waitForCompletion(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    const maxWait = 60000;
    const start = Date.now();

    const check = () => {
      const stored = getFinalRun(sessionId);
      if (stored && (stored.status === "completed" || stored.status === "failed")) {
        resolve();
        return;
      }
      if (Date.now() - start > maxWait) {
        resolve(); // timeout
        return;
      }
      setTimeout(check, 1000);
    };
    setTimeout(check, 2000);
  });
}

function getFinalRun(id: string): { id: string; status: string; [key: string]: unknown } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require("./storage");
    const run = storage.getResearchRun(id);
    if (run) return run as { id: string; status: string; [key: string]: unknown };
  } catch {
    // ignore
  }
  try {
    const sessions = (globalThis as { __researchSessions?: Map<string, { id: string; status: string; [key: string]: unknown }> }).__researchSessions;
    if (sessions && sessions.has(id)) {
      return sessions.get(id) || null;
    }
  } catch {
    // ignore
  }
  return null;
}



/* ------------------------------------------------------------------ */
/*  Extended batch utilities (round 148)                              */
/* ------------------------------------------------------------------ */

export interface BatchSummary {
  batchId: string;
  status: Batch["status"];
  total: number;
  completed: number;
  failed: number;
  queued: number;
  running: number;
  progress: number;
  createdAt: number;
  completedAt?: number;
  durationMs?: number;
  priority: BatchPriority;
  retriesPerRun: number;
  errors: string[];
}

export function summarizeBatch(batch: Batch): BatchSummary {
  const queued = batch.runs.filter((r) => r.status === "queued").length;
  const running = batch.runs.filter((r) => r.status === "running").length;
  const done = batch.completed + batch.failed;
  const progress = batch.total > 0 ? Math.round((done / batch.total) * 100) : 0;
  const durationMs = batch.completedAt && batch.createdAt
    ? batch.completedAt - batch.createdAt
    : undefined;
  const errors: string[] = [];
  batch.runs.forEach((r) => { if (r.error) errors.push(r.error); });
  return {
    batchId: batch.id,
    status: batch.status,
    total: batch.total,
    completed: batch.completed,
    failed: batch.failed,
    queued,
    running,
    progress,
    createdAt: batch.createdAt,
    completedAt: batch.completedAt,
    durationMs,
    priority: batch.priority,
    retriesPerRun: batch.retriesPerRun,
    errors,
  };
}

export function summarizeAllBatches(batches: Batch[]): {
  total: number;
  running: number;
  paused: number;
  completed: number;
  totalRuns: number;
  totalCompleted: number;
  totalFailed: number;
  aggregateProgress: number;
} {
  let running = 0, paused = 0, completed = 0;
  let totalRuns = 0, totalCompleted = 0, totalFailed = 0;
  batches.forEach((b) => {
    if (b.status === "running") running++;
    else if (b.status === "paused") paused++;
    else if (b.status === "completed") completed++;
    totalRuns += b.total;
    totalCompleted += b.completed;
    totalFailed += b.failed;
  });
  const aggregateProgress = totalRuns > 0
    ? Math.round(((totalCompleted + totalFailed) / totalRuns) * 100)
    : 0;
  return { total: batches.length, running, paused, completed, totalRuns, totalCompleted, totalFailed, aggregateProgress };
}

export function filterBatchesByStatus(batches: Batch[], status: Batch["status"]): Batch[] {
  return batches.filter((b) => b.status === status);
}

export function filterBatchesByPriority(batches: Batch[], priority: BatchPriority): Batch[] {
  return batches.filter((b) => b.priority === priority);
}

/** Compare function: high->normal->low, then createdAt ascending (FIFO). */
export function comparePriority(a: Batch, b: Batch): number {
  const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pd !== 0) return pd;
  return a.createdAt - b.createdAt;
}

export interface EstimateInput {
  total: number;
  completed: number;
  failed: number;
  avgRunDuration: number;
  concurrency: number;
}

export function estimateRemainingMs(input: EstimateInput): number | null {
  if (input.total <= 0 || input.concurrency <= 0) return null;
  const remaining = input.total - input.completed - input.failed;
  if (remaining <= 0) return 0;
  if (!input.avgRunDuration || input.avgRunDuration <= 0) return null;
  const effective = Math.min(input.concurrency, remaining);
  return Math.round((remaining * input.avgRunDuration) / effective);
}

/**
 * Mark a specific run as failed with a provided error, bumping batch failed
 * count and auto-completing the batch if nothing is left queued or running.
 */
export function failRun(batchId: string, runIndex: number, error: string): boolean {
  const store = getStore();
  const batch = store.get(batchId);
  if (!batch) return false;
  const run = batch.runs[runIndex];
  if (!run) return false;
  if (run.status === "failed" || run.status === "completed") return false;
  run.status = "failed";
  run.error = error;
  run.completedAt = Date.now();
  batch.failed++;
  const allDone = batch.runs.every((r) => r.status === "completed" || r.status === "failed");
  if (allDone) {
    batch.status = "completed";
    batch.completedAt = Date.now();
  }
  store.set(batchId, { ...batch });
  return true;
}

/** Force-mark a queued or failed run back to completed (manual override). */
export function forceCompleteRun(batchId: string, runIndex: number): boolean {
  const store = getStore();
  const batch = store.get(batchId);
  if (!batch) return false;
  const run = batch.runs[runIndex];
  if (!run) return false;
  if (run.status === "completed") return false;
  const prev = run.status;
  run.status = "completed";
  run.completedAt = Date.now();
  run.error = undefined;
  if (prev === "failed") batch.failed = Math.max(0, batch.failed - 1);
  batch.completed++;
  const allDone = batch.runs.every((r) => r.status === "completed" || r.status === "failed");
  if (allDone) {
    batch.status = "completed";
    batch.completedAt = Date.now();
  }
  store.set(batchId, { ...batch });
  return true;
}

/** Export a batch summary as a plain JSON string. */
export function exportBatchAsJson(batch: Batch): string {
  return JSON.stringify(summarizeBatch(batch), null, 2);
}

/** Export a batch as CSV: query, status, retries, error. */
export function exportBatchAsCsv(batch: Batch): string {
  const header = "query,status,retryCount,error";
  const lines: string[] = [header];
  batch.runs.forEach((r) => {
    const q = JSON.stringify(r.query);
    const err = r.error ? JSON.stringify(r.error) : "";
    lines.push([q, r.status, String(r.retryCount), err].join(","));
  });
  return lines.join("\n");
}

export function retryPolicyLabel(retries: number): string {
  if (retries <= 0) return "no-retries";
  if (retries === 1) return "single-retry";
  if (retries <= 3) return "standard";
  return "aggressive";
}

// Keep processBatch as a thin wrapper that triggers the scheduler
async function processBatch(
  batchId: string,
  _queries: string[],
  _keywords: string[],
  _options?: CreateBatchOptions,
): Promise<void> {
  // The actual processing is driven by the global scheduler
  void runScheduler();
}
