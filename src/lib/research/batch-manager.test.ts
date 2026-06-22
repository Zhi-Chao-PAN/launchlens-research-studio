import { describe, it, expect, beforeEach } from "vitest";
import {
  createBatch,
  getBatch,
  listBatches,
  setGlobalConcurrency,
  getConcurrencyStats,
  pauseBatch,
  resumeBatch,
  cancelBatch,
  _resetBatchManager,
} from "@/lib/research/batch-manager";

describe("batch-manager", () => {
  beforeEach(() => {
    _resetBatchManager();
    (globalThis as any).__globalConcurrency = 3;
  });

  describe("createBatch", () => {
    it("creates a batch with given queries", () => {
      const batch = createBatch(["q1", "q2", "q3"], []);
      expect(batch.id).toBeTruthy();
      expect(batch.total).toBe(3);
      expect(batch.runs.length).toBe(3);
      expect(batch.status).toBe("running");
    });

    it("defaults to normal priority", () => {
      const batch = createBatch(["q"], []);
      expect(batch.priority).toBe("normal");
      expect(batch.runs[0].priority).toBe("normal");
    });

    it("supports high priority", () => {
      const batch = createBatch(["q"], [], { priority: "high" });
      expect(batch.priority).toBe("high");
      expect(batch.runs[0].priority).toBe("high");
    });

    it("supports low priority", () => {
      const batch = createBatch(["q"], [], { priority: "low" });
      expect(batch.priority).toBe("low");
    });

    it("respects concurrency setting", () => {
      const batch = createBatch(["q1","q2","q3","q4","q5"], [], { concurrency: 2 });
      expect(batch.concurrency).toBe(2);
    });

    it("caps concurrency at query count", () => {
      const batch = createBatch(["q1"], [], { concurrency: 10 });
      expect(batch.concurrency).toBe(1);
    });

    it("has default retries", () => {
      const batch = createBatch(["q"], []);
      expect(batch.retriesPerRun).toBe(1);
    });

    it("supports custom retries", () => {
      const batch = createBatch(["q"], [], { retriesPerRun: 3 });
      expect(batch.retriesPerRun).toBe(3);
    });

    it("keeps excess runs queued when above concurrency", () => {
      // Global concurrency 3, batch concurrency 2, 5 queries = at least 3 queued
      const batch = createBatch(["q1", "q2", "q3", "q4", "q5"], [], { concurrency: 5 });
      const queued = batch.runs.filter((r) => r.status === "queued").length;
      const running = batch.runs.filter((r) => r.status === "running").length;
      // At most globalConcurrency (3) can be running globally
      expect(running + queued).toBe(5);
      expect(running).toBeLessThanOrEqual(3);
      expect(queued).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getBatch", () => {
    it("returns null for unknown batch", () => {
      expect(getBatch("nope")).toBeNull();
    });

    it("returns batch with computed progress", () => {
      const batch = createBatch(["q"], []);
      const retrieved = getBatch(batch.id)!;
      expect(retrieved.id).toBe(batch.id);
      expect(typeof retrieved.progress).toBe("number");
    });
  });

  describe("listBatches", () => {
    it("returns empty list initially", () => {
      expect(listBatches().length).toBe(0);
    });

    it("returns newest first (stable order)", () => {
      const a = createBatch(["q1"], []);
      const b = createBatch(["q2"], []);
      const c = createBatch(["q3"], []);
      const list = listBatches();
      expect(list[0].id).toBe(c.id);
      expect(list[1].id).toBe(b.id);
      expect(list[2].id).toBe(a.id);
    });

    it("respects limit", () => {
      for (let i = 0; i < 10; i++) createBatch(["q"+i], []);
      expect(listBatches(3).length).toBe(3);
    });
  });

  describe("concurrency control", () => {
    it("getConcurrencyStats has expected shape", () => {
      const s = getConcurrencyStats();
      expect(s).toHaveProperty("globalConcurrency");
      expect(s).toHaveProperty("globalActive");
      expect(s).toHaveProperty("globalQueued");
      expect(s).toHaveProperty("batchCount");
      expect(s).toHaveProperty("activeBatchCount");
    });

    it("setGlobalConcurrency changes the limit", () => {
      const prev = setGlobalConcurrency(5);
      expect(prev).toBe(3);
      expect(getConcurrencyStats().globalConcurrency).toBe(5);
    });

    it("clamps concurrency to valid range", () => {
      setGlobalConcurrency(100);
      expect(getConcurrencyStats().globalConcurrency).toBe(10);
      setGlobalConcurrency(0);
      expect(getConcurrencyStats().globalConcurrency).toBe(1);
    });
  });

  describe("batch lifecycle", () => {
    it("pauseBatch pauses a running batch", () => {
      const batch = createBatch(["q"], []);
      expect(pauseBatch(batch.id)).toBe(true);
      expect(getBatch(batch.id)!.status).toBe("paused");
    });

    it("pauseBatch returns false for nonexistent", () => {
      expect(pauseBatch("nope")).toBe(false);
    });

    it("resumeBatch resumes a paused batch", () => {
      const batch = createBatch(["q"], []);
      pauseBatch(batch.id);
      expect(resumeBatch(batch.id)).toBe(true);
      expect(getBatch(batch.id)!.status).toBe("running");
    });

    it("cancelBatch marks queued runs cancelled and counts separately", async () => {
      const batch = createBatch(["q1","q2","q3"], []);
      // Pause first so scheduler doesn't pick up runs (keeps them queued).
      pauseBatch(batch.id);
      // Yield a microtick to let any in-flight scheduler tick complete.
      await new Promise((r) => setTimeout(r, 50));
      expect(cancelBatch(batch.id)).toBe(true);
      const fresh = getBatch(batch.id)!;
      const statuses = fresh.runs.map((r) => r.status).sort();
      // After 50ms with concurrency 3 at least some runs are already running
      // and some are still queued; cancelBatch flips queued to cancelled
      // immediately, and running runs will become cancelled as soon as their
      // current backoff/polling sleep aborts. For this unit test we just verify
      // the counter is incremented and queued runs are cancelled.
      const queuedAtCancel = fresh.runs.filter((r) => r.status === "cancelled").length;
      expect(queuedAtCancel).toBeGreaterThan(0);
      expect(fresh.failed).toBe(0);
      expect(fresh.cancelled + fresh.completed).toBeGreaterThanOrEqual(queuedAtCancel);
      const summary = summarizeBatch(fresh);
      expect(summary.cancelled).toBe(fresh.cancelled);
      expect(summary.failed).toBe(0);
      // Cancelled runs don't pollute the errors list (real errors only).
      expect(summary.errors.every((e) => e !== "cancelled")).toBe(true);
    });
  });

  describe("BatchRun structure", () => {
    it("has retryCount field", () => {
      const batch = createBatch(["q"], []);
      expect(batch.runs[0].retryCount).toBe(0);
    });

    it("has priority field on each run", () => {
      const batch = createBatch(["q1", "q2"], [], { priority: "high" });
      expect(batch.runs[0].priority).toBe("high");
      expect(batch.runs[1].priority).toBe("high");
    });
  });
});
import {
  summarizeBatch,
  summarizeAllBatches,
  filterBatchesByStatus,
  filterBatchesByPriority,
  comparePriority,
  estimateRemainingMs,
  failRun,
  forceCompleteRun,
  exportBatchAsJson,
  exportBatchAsCsv,
  retryPolicyLabel,
} from '@/lib/research/batch-manager';

describe('batch-manager extensions (round 148)', () => {
  beforeEach(() => { _resetBatchManager(); (globalThis as any).__globalConcurrency = 3; });

  it('summarizeBatch counts queued/running and computes progress', () => {
    const b = createBatch(['a','b','c','d'], []);
    const s2 = summarizeBatch(b);
    expect(s2.batchId).toBe(b.id);
    expect(s2.total).toBe(4);
    expect(s2.completed + s2.failed + s2.queued + s2.running).toBe(4);
    expect(typeof s2.progress).toBe('number');
    expect(s2.errors).toEqual([]);
    expect(s2.priority).toBe('normal');
    expect(s2.retriesPerRun).toBe(1);
  });

  it('summarizeBatch collects errors and duration when complete', () => {
    const b = createBatch(['a','b'], []);
    expect(failRun(b.id, 0, 'boom')).toBe(true);
    expect(failRun(b.id, 1, 'bang')).toBe(true);
    const done = getBatch(b.id)!;
    const s2 = summarizeBatch(done);
    expect(s2.failed).toBe(2);
    expect(s2.status).toBe('completed');
    expect(s2.errors).toContain('boom');
    expect(s2.errors).toContain('bang');
    expect(s2.durationMs).toBeGreaterThanOrEqual(0);
    expect(s2.completedAt).toBeTypeOf('number');
  });

  it('failRun returns false for nonexistent/terminal runs', () => {
    expect(failRun('missing', 0, 'x')).toBe(false);
    const b = createBatch(['a'], []);
    failRun(b.id, 0, 'x');
    expect(failRun(b.id, 0, 'again')).toBe(false);
    expect(failRun(b.id, 99, 'x')).toBe(false);
  });

  it('forceCompleteRun flips a failed run to completed', () => {
    const b = createBatch(['a','b'], []);
    failRun(b.id, 0, 'bad');
    const after = getBatch(b.id)!;
    expect(after.failed).toBeGreaterThanOrEqual(1);
    expect(forceCompleteRun(b.id, 0)).toBe(true);
    const done = getBatch(b.id)!;
    expect(done.completed).toBeGreaterThanOrEqual(1);
    expect(done.runs[0].status).toBe('completed');
    expect(done.runs[0].error).toBeUndefined();
  });

  it('forceCompleteRun is idempotent and safe for bad indices', () => {
    const b = createBatch(['a'], []);
    failRun(b.id, 0, 'bad');
    forceCompleteRun(b.id, 0);
    expect(forceCompleteRun(b.id, 0)).toBe(false);
    expect(forceCompleteRun(b.id, 99)).toBe(false);
  });

  it('summarizeAllBatches aggregates across batches', () => {
    (globalThis as any).__globalConcurrency = 10;
    const a = createBatch(['a1','a2'], [], { priority: 'high' });
    const b = createBatch(['b1'], []);
    pauseBatch(b.id);
    const c = createBatch(['c1','c2'], []);
    failRun(c.id, 0, 'oops');
    failRun(c.id, 1, 'oops');
    const all = [getBatch(a.id)!, getBatch(b.id)!, getBatch(c.id)!];
    const agg = summarizeAllBatches(all);
    expect(agg.total).toBe(3);
    expect(agg.paused).toBe(1);
    expect(agg.totalRuns).toBe(5);
    expect(agg.totalFailed).toBe(2);
    expect(agg.aggregateProgress).toBeGreaterThanOrEqual(0);
    expect(agg.aggregateProgress).toBeLessThanOrEqual(100);
  });

  it('filterBatchesByStatus and filterBatchesByPriority', () => {
    const a = createBatch(['a'], [], { priority: 'high' });
    const b = createBatch(['b'], []);
    pauseBatch(b.id);
    const all = [getBatch(a.id)!, getBatch(b.id)!];
    expect(filterBatchesByStatus(all, 'paused').map((x) => x.id)).toEqual([b.id]);
    expect(filterBatchesByStatus(all, 'running').map((x) => x.id)).toEqual([a.id]);
    expect(filterBatchesByPriority(all, 'high').map((x) => x.id)).toEqual([a.id]);
    expect(filterBatchesByPriority(all, 'low')).toEqual([]);
  });

  it('comparePriority orders by tier then FIFO', () => {
    const hi = { priority: 'high', createdAt: 500 } as any;
    const nm1 = { priority: 'normal', createdAt: 100 } as any;
    const nm2 = { priority: 'normal', createdAt: 200 } as any;
    const lo = { priority: 'low', createdAt: 10 } as any;
    const sorted = [lo, nm2, hi, nm1].sort(comparePriority);
    expect(sorted.map((bb) => bb.priority + "@" + bb.createdAt)).toEqual(['high@500', 'normal@100', 'normal@200', 'low@10']);
  });

  it('estimateRemainingMs honors concurrency and edge cases', () => {
    expect(estimateRemainingMs({ total: 10, completed: 4, failed: 1, avgRunDuration: 1000, concurrency: 2 })).toBe(2500);
    expect(estimateRemainingMs({ total: 10, completed: 10, failed: 0, avgRunDuration: 1000, concurrency: 2 })).toBe(0);
    expect(estimateRemainingMs({ total: 0, completed: 0, failed: 0, avgRunDuration: 1000, concurrency: 2 })).toBeNull();
    expect(estimateRemainingMs({ total: 5, completed: 2, failed: 0, avgRunDuration: 0, concurrency: 2 })).toBeNull();
    expect(estimateRemainingMs({ total: 5, completed: 2, failed: 0, avgRunDuration: 1000, concurrency: 0 })).toBeNull();
    expect(estimateRemainingMs({ total: 4, completed: 0, failed: 0, avgRunDuration: 800, concurrency: 4 })).toBe(800);
  });

  it('exportBatchAsJson produces parseable summary', () => {
    const b = createBatch(['hello world'], []);
    const json = exportBatchAsJson(getBatch(b.id)!);
    const parsed = JSON.parse(json);
    expect(parsed.batchId).toBe(b.id);
    expect(parsed.total).toBe(1);
  });

  it('exportBatchAsCsv emits header and one quoted row per run', () => {
    const b = createBatch(['one, two','three'], []);
    const csv = exportBatchAsCsv(getBatch(b.id)!);
    const lines = csv.split("\n");
    expect(lines[0]).toBe('query,status,retryCount,error');
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('one, two');
    expect(lines[2]).toContain('three');
  });

  it('retryPolicyLabel maps counts to buckets', () => {
    expect(retryPolicyLabel(0)).toBe('no-retries');
    expect(retryPolicyLabel(1)).toBe('single-retry');
    expect(retryPolicyLabel(3)).toBe('standard');
    expect(retryPolicyLabel(5)).toBe('aggressive');
  });
});
