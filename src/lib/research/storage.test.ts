import { describe, beforeEach, afterAll } from "vitest";
import {
  generateRunId, saveResearchRun, listResearchRuns, getResearchRun, deleteResearchRun, getResearchStorageInfo } from "@/lib/research/storage";

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
