import { describe, beforeEach, afterAll, vi } from "vitest";
import {
  generateRunId,
  saveResearchRun,
  listResearchRuns,
  getResearchRun,
  deleteResearchRun,
  getResearchStorageInfo,
  searchResearchRuns,
  bulkDeleteRuns,
  exportRuns,
} from "@/lib/research/storage";

describe("Research storage", () => {
  beforeEach(() => {
    // Clear in-memory state between tests by deleting all runs
    const runs = listResearchRuns(100);
    for (const run of runs) {
      deleteResearchRun(run.id);
    }
  });

  describe("generateRunId", () => {
    it("generates unique IDs", () => {
      const id1 = generateRunId();
      const id2 = generateRunId();
      expect(id1).toBeTruthy();
      expect(typeof id1).toBe("string");
      expect(id1).not.toBe(id2);
    });

    it("generates UUID-format IDs", () => {
      const id = generateRunId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe("saveResearchRun + listResearchRuns", () => {
    it("saves and lists runs", () => {
      const run = {
        id: generateRunId(),
        query: "test query",
        keywords: ["ai", "ml"],
        result: "test result",
        provider: "mock",
        model: "mock-model",
        createdAt: Date.now(),
        durationMs: 1234,
        status: "completed" as const,
      };

      saveResearchRun(run);
      const listed = listResearchRuns();
      expect(listed.length).toBe(1);
      expect(listed[0].id).toBe(run.id);
      expect(listed[0].query).toBe("test query");
    });

    it("lists runs in most-recent-first order", () => {
      for (let i = 0; i < 5; i++) {
        saveResearchRun({
          id: `run-${i}`,
          query: `query ${i}`,
          keywords: [],
          result: `result ${i}`,
          provider: "mock",
          model: "mock-model",
          createdAt: Date.now() + i * 1000,
          durationMs: 100,
          status: "completed",
        });
      }
      const listed = listResearchRuns(10);
      expect(listed.length).toBe(5);
      expect(listed[0].query).toBe("query 4");
      expect(listed[4].query).toBe("query 0");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        saveResearchRun({
          id: `run-lim-${i}`,
          query: `q${i}`,
          keywords: [],
          result: "x",
          provider: "mock",
          model: "mock",
          createdAt: Date.now(),
          durationMs: 50,
          status: "completed",
        });
      }
      expect(listResearchRuns(3).length).toBe(3);
      expect(listResearchRuns(0).length).toBe(0);
    });

    it("caps in-memory storage at MAX_MEMORY_RUNS", () => {
      const info = getResearchStorageInfo();
      const max = info.maxMemoryRuns;
      expect(max).toBeGreaterThan(0);
      
      for (let i = 0; i < max + 20; i++) {
        saveResearchRun({
          id: `cap-test-${i}`,
          query: `q${i}`,
          keywords: [],
          result: "x",
          provider: "mock",
          model: "mock",
          createdAt: Date.now(),
          durationMs: 50,
          status: "completed",
        });
      }
      const listed = listResearchRuns(200);
      expect(listed.length).toBe(max);
    });
  });

  describe("getResearchRun", () => {
    it("retrieves a run by ID", () => {
      const run = {
        id: generateRunId(),
        query: "retrieve me",
        keywords: ["test"],
        result: "found!",
        provider: "mock",
        model: "test-model",
        createdAt: 1234567890,
        durationMs: 999,
        status: "completed" as const,
      };
      saveResearchRun(run);
      const retrieved = getResearchRun(run.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.query).toBe("retrieve me");
      expect(retrieved!.durationMs).toBe(999);
    });

    it("returns null for unknown ID", () => {
      expect(getResearchRun("nonexistent-id")).toBeNull();
    });
  });

  describe("deleteResearchRun", () => {
    it("deletes a run by ID", () => {
      const run = {
        id: generateRunId(),
        query: "delete me",
        keywords: [],
        result: "gone",
        provider: "mock",
        model: "mock",
        createdAt: Date.now(),
        durationMs: 10,
        status: "completed" as const,
      };
      saveResearchRun(run);
      expect(listResearchRuns().length).toBe(1);
      
      const deleted = deleteResearchRun(run.id);
      expect(deleted).toBe(true);
      expect(listResearchRuns().length).toBe(0);
      expect(getResearchRun(run.id)).toBeNull();
    });

    it("returns false for unknown ID", () => {
      expect(deleteResearchRun("no-such-id")).toBe(false);
    });
  });

  describe("getResearchStorageInfo", () => {
    it("returns storage info", () => {
      const info = getResearchStorageInfo();
      expect(typeof info.enabled).toBe("boolean");
      expect(typeof info.maxMemoryRuns).toBe("number");
      expect(typeof info.inMemoryCount).toBe("number");
      expect(info.maxMemoryRuns).toBeGreaterThan(0);
    });
  });

  describe("failed runs", () => {
    it("stores failed runs with error messages", () => {
      const run = {
        id: generateRunId(),
        query: "fail test",
        keywords: [],
        result: "",
        provider: "mock",
        model: "mock",
        createdAt: Date.now(),
        durationMs: 500,
        status: "failed" as const,
        error: "something went wrong",
      };
      saveResearchRun(run);
      const retrieved = getResearchRun(run.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.status).toBe("failed");
      expect(retrieved!.error).toBe("something went wrong");
    });
  });
});


describe("Research run persistence integration", () => {
  vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
  beforeEach(() => {
    const runs = listResearchRuns(100);
    for (const run of runs) {
      deleteResearchRun(run.id);
    }
  });

  it("saves completed research runs to storage", async () => {
    expect(listResearchRuns().length).toBe(0);
    
    const { createResearchSession, runResearchSession } = await import("@/lib/research/research-engine");
    const session = createResearchSession("test query", ["kw1", "kw2"]);
    await runResearchSession(session.id);
    
    const runs = listResearchRuns();
    expect(runs.length).toBeGreaterThan(0);
    
    const run = runs.find((r) => r.id === session.id);
    expect(run).toBeDefined();
    expect(run!.query).toBe("test query");
    expect(run!.status).toBe("completed");
    expect(run!.keywords).toEqual(["kw1", "kw2"]);
  });

  it("retrieves full run by ID with result", async () => {
    const { createResearchSession, runResearchSession } = await import("@/lib/research/research-engine");
    const session = createResearchSession("retrieve test", []);
    await runResearchSession(session.id);
    
    const full = getResearchRun(session.id);
    expect(full).not.toBeNull();
    expect(full!.result).toBeTruthy();
    expect(typeof full!.result).toBe("string");
    expect(full!.durationMs).toBeGreaterThanOrEqual(0);
  });
});


describe("searchResearchRuns", () => {
  beforeEach(() => {
    const runs = listResearchRuns(100);
    for (const run of runs) {
      deleteResearchRun(run.id);
    }
    // Seed with test data
    saveResearchRun({
      id: "s1", query: "AI marketing tools", keywords: ["ai", "marketing"],
      result: "", provider: "mock", model: "m1", createdAt: 1000, durationMs: 500, status: "completed",
    });
    saveResearchRun({
      id: "s2", query: "Pricing strategies for SaaS", keywords: ["pricing", "saas"],
      result: "", provider: "mock", model: "m1", createdAt: 2000, durationMs: 800, status: "completed",
    });
    saveResearchRun({
      id: "s3", query: "Competitor analysis", keywords: ["competition"],
      result: "", provider: "mock", model: "m2", createdAt: 3000, durationMs: 1200, status: "failed",
      error: "timeout",
    });
  });

  it("searches by query text", () => {
    const result = searchResearchRuns({ query: "pricing" });
    expect(result.total).toBe(1);
    expect(result.runs[0].id).toBe("s2");
  });

  it("searches by keyword", () => {
    const result = searchResearchRuns({ query: "marketing" });
    expect(result.total).toBe(1);
    expect(result.runs[0].id).toBe("s1");
  });

  it("filters by status", () => {
    const failed = searchResearchRuns({ status: "failed" });
    expect(failed.total).toBe(1);
    expect(failed.runs[0].status).toBe("failed");
    
    const completed = searchResearchRuns({ status: "completed" });
    expect(completed.total).toBe(2);
  });

  it("filters by provider", () => {
    const result = searchResearchRuns({ provider: "mock" });
    expect(result.total).toBe(3);
  });

  it("combines search and filter", () => {
    const result = searchResearchRuns({ query: "AI", status: "completed" });
    expect(result.total).toBe(1);
    expect(result.runs[0].id).toBe("s1");
  });

  it("supports pagination", () => {
    const page1 = searchResearchRuns({ limit: 2, offset: 0 });
    expect(page1.runs.length).toBe(2);
    expect(page1.total).toBe(3);
    
    const page2 = searchResearchRuns({ limit: 2, offset: 2 });
    expect(page2.runs.length).toBe(1);
  });
});

describe("bulkDeleteRuns", () => {
  beforeEach(() => {
    const runs = listResearchRuns(100);
    for (const run of runs) {
      deleteResearchRun(run.id);
    }
    for (let i = 0; i < 5; i++) {
      saveResearchRun({
        id: `bulk-${i}`, query: `q${i}`, keywords: [],
        result: "", provider: "mock", model: "m",
        createdAt: 1000 + i, durationMs: 100, status: "completed",
      });
    }
  });

  it("deletes multiple runs at once", () => {
    expect(listResearchRuns(100).length).toBe(5);
    const deleted = bulkDeleteRuns(["bulk-0", "bulk-1", "bulk-2"]);
    expect(deleted).toBe(3);
    expect(listResearchRuns(100).length).toBe(2);
  });

  it("returns 0 for empty list", () => {
    expect(bulkDeleteRuns([])).toBe(0);
  });

  it("handles non-existent IDs gracefully", () => {
    const deleted = bulkDeleteRuns(["bulk-0", "nonexistent"]);
    expect(deleted).toBe(1);
  });
});

describe("exportRuns", () => {
  beforeEach(() => {
    const runs = listResearchRuns(100);
    for (const run of runs) {
      deleteResearchRun(run.id);
    }
    saveResearchRun({
      id: "exp-1", query: 'Test "quotes"', keywords: ["kw1", "kw2"],
      result: "result1", provider: "mock", model: "m1",
      createdAt: 1000, durationMs: 500, status: "completed",
      sources: [{ title: "Src", url: "http://example.com" }],
    });
  });

  it("exports as JSON", () => {
    const json = exportRuns("json");
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].id).toBe("exp-1");
  });

  it("exports as JSONL", () => {
    const jsonl = exportRuns("jsonl");
    const lines = jsonl.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("exports as CSV with headers", () => {
    const csv = exportRuns("csv");
    const lines = csv.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("query");
    expect(lines[0]).toContain("status");
  });

  it("escapes quotes in CSV", () => {
    const csv = exportRuns("csv");
    expect(csv).toContain('Test ""quotes""');
  });

  it("exports specific IDs", () => {
    saveResearchRun({
      id: "exp-2", query: "second", keywords: [],
      result: "", provider: "mock", model: "m2",
      createdAt: 2000, durationMs: 100, status: "completed",
    });
    
    const json = exportRuns("json", ["exp-2"]);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe("exp-2");
  });
});


