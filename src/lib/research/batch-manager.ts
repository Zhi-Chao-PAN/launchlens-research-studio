/**
 * Batch research manager — queues and processes multiple research runs.
 * Uses a global singleton for cross-route state sharing.
 */

import {
  createResearchSession,
} from "@/lib/research/research-engine";
import { saveResearchRun } from "@/lib/research/storage";

export interface BatchRun {
  id: string;
  query: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
}

export interface Batch {
  id: string;
  total: number;
  completed: number;
  failed: number;
  status: "running" | "completed";
  runs: BatchRun[];
  createdAt: number;
  completedAt?: number;
  progress: number;
}

declare global {
  var __batchStore: Map<string, Batch> | undefined;
}

function getStore(): Map<string, Batch> {
  if (!global.__batchStore) {
    global.__batchStore = new Map();
  }
  return global.__batchStore;
}

function generateId(): string {
  return "batch-" + Math.random().toString(36).slice(2, 10);
}

export function createBatch(
  queries: string[],
  keywords: string[] = [],
  _options?: { provider?: string; model?: string },
): Batch {
  const id = generateId();
  const now = Date.now();

  const runs: BatchRun[] = queries.map((query) => ({
    id: "",
    query,
    status: "queued",
  }));

  const batch: Batch = {
    id,
    total: queries.length,
    completed: 0,
    failed: 0,
    status: "running",
    runs,
    createdAt: now,
    progress: 0,
  };

  getStore().set(id, batch);

  // Start processing asynchronously
  void processBatch(id, queries, keywords, _options);

  return batch;
}

export function getBatch(id: string): Batch | null {
  const batch = getStore().get(id);
  if (!batch) return null;
  
  // Compute progress
  const done = batch.completed + batch.failed;
  return {
    ...batch,
    progress: batch.total > 0 ? Math.round((done / batch.total) * 100) : 0,
  };
}

export function listBatches(limit = 20): Batch[] {
  return Array.from(getStore().values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((b) => ({
      ...b,
      progress: b.total > 0 ? Math.round(((b.completed + b.failed) / b.total) * 100) : 0,
    }));
}

async function processBatch(
  batchId: string,
  queries: string[],
  keywords: string[],
  _options?: { provider?: string; model?: string },
) {
  const store = getStore();
  const batch = store.get(batchId);
  if (!batch) return;

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    batch.runs[i].status = "running";
    batch.runs[i].startedAt = Date.now();
    store.set(batchId, { ...batch });

    try {
      const session = createResearchSession(query, keywords);

      batch.runs[i].id = session.id;

      // Poll for completion
      await waitForCompletion(session.id);

      // Get final state from storage or session
      // Check if run was saved to storage
      const finalRun = getFinalRun(session.id);
      
      if (finalRun) {
        batch.runs[i].status = finalRun.status as BatchRun["status"];
        if (finalRun.status === "completed") {
          batch.completed++;
        } else {
          batch.failed++;
        }
      } else {
        batch.runs[i].status = "completed";
        batch.completed++;
      }

      batch.runs[i].completedAt = Date.now();
    } catch {
      batch.runs[i].status = "failed";
      batch.failed++;
      batch.runs[i].completedAt = Date.now();
    }

    store.set(batchId, { ...batch });
  }

  batch.status = "completed";
  batch.completedAt = Date.now();
  store.set(batchId, { ...batch });
}

function waitForCompletion(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    const maxWait = 60000; // 60s timeout
    const start = Date.now();
    
    const check = () => {
      // Try to find the session or stored run
      const stored = getFinalRun(sessionId);
      if (stored && (stored.status === "completed" || stored.status === "failed")) {
        resolve();
        return;
      }
      
      if (Date.now() - start > maxWait) {
        resolve(); // Timeout, mark as done
        return;
      }
      
      setTimeout(check, 1000);
    };
    
    setTimeout(check, 2000); // Initial delay
  });
}

function getFinalRun(id: string): { id: string; status: string; [key: string]: unknown } | null {
  // Try storage first (server-side only)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require("./storage");
    const run = storage.getResearchRun(id);
    if (run) return run as { id: string; status: string; [key: string]: unknown };
  } catch {
    // ignore - storage module not available
  }
  
  // Try global sessions
  try {
    const sessions = (globalThis as { __researchSessions?: Map<string, { id: string; status: string; [key: string]: unknown }> }).__researchSessions;
    if (sessions && sessions.has(id)) {
      const session = sessions.get(id);
      return session || null;
    }
  } catch {
    // ignore
  }
  
  return null;
}
