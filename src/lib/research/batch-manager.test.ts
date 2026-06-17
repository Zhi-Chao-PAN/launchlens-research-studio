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

    it("cancelBatch marks batch", () => {
      const batch = createBatch(["q1","q2","q3"], []);
      expect(cancelBatch(batch.id)).toBe(true);
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