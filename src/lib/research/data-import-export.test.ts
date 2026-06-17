import { describe, it, expect } from "vitest";
import {
  createDataPackage,
  validateDataPackage,
  importDataPackage,
  getExportFilename,
  estimatePackageSize,
  DATA_PACKAGE_VERSION,
  DATA_PACKAGE_SOURCE,
} from "@/lib/research/data-import-export";
import type { ResearchRun } from "@/lib/research/storage";
import type { ResearchNotes } from "@/lib/research/notes";
import type { ResearchFolder } from "@/lib/research/folders";
import type { ResearchTemplate } from "@/lib/research/templates";

function makeRun(id: string, query = "test query"): ResearchRun {
  return {
    id,
    query,
    keywords: ["a", "b"],
    result: "result",
    provider: "mock",
    model: "mock-v1",
    createdAt: Date.now(),
    durationMs: 1000,
    status: "completed",
  };
}

function makeNotes(runId: string): ResearchNotes {
  return {
    runId,
    annotations: [],
    personalNote: "my note",
    rating: 4,
    tags: ["tag1"],
    isStarred: false,
    isArchived: false,
    lastOpenedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeFolder(id: string, name: string): ResearchFolder {
  return {
    id,
    name,
    runIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeTemplate(id: string, name: string): ResearchTemplate {
  return {
    id,
    name,
    query: "default query",
    keywords: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    useCount: 0,
  };
}

describe("data-import-export", () => {
  describe("createDataPackage", () => {
    it("creates a valid package with version and source", () => {
      const pkg = createDataPackage({ runs: [makeRun("r1")] });
      expect(pkg.version).toBe(DATA_PACKAGE_VERSION);
      expect(pkg.source).toBe(DATA_PACKAGE_SOURCE);
      expect(typeof pkg.exportedAt).toBe("number");
      expect(pkg.data.runs?.length).toBe(1);
    });

    it("defaults empty arrays for missing collections", () => {
      const pkg = createDataPackage({});
      expect(pkg.data.runs).toEqual([]);
      expect(pkg.data.notes).toEqual([]);
      expect(pkg.data.folders).toEqual([]);
      expect(pkg.data.templates).toEqual([]);
    });

    it("includes all data types", () => {
      const pkg = createDataPackage({
        runs: [makeRun("r1")],
        notes: [makeNotes("r1")],
        folders: [makeFolder("f1", "Test")],
        templates: [makeTemplate("t1", "Tpl")],
      });
      expect(pkg.data.runs?.length).toBe(1);
      expect(pkg.data.notes?.length).toBe(1);
      expect(pkg.data.folders?.length).toBe(1);
      expect(pkg.data.templates?.length).toBe(1);
    });
  });

  describe("validateDataPackage", () => {
    it("returns no errors for valid package", () => {
      const pkg = createDataPackage({ runs: [makeRun("r1")] });
      const errors = validateDataPackage(pkg);
      expect(errors.length).toBe(0);
    });

    it("rejects non-object package", () => {
      expect(validateDataPackage(null).length).toBeGreaterThan(0);
      expect(validateDataPackage("string").length).toBeGreaterThan(0);
      expect(validateDataPackage(undefined).length).toBeGreaterThan(0);
    });

    it("rejects wrong source", () => {
      const pkg: any = createDataPackage({});
      pkg.source = "something-else";
      const errors = validateDataPackage(pkg);
      expect(errors.some((e) => e.includes("source"))).toBe(true);
    });

    it("rejects invalid version", () => {
      const pkg: any = createDataPackage({});
      pkg.version = 0;
      const errors = validateDataPackage(pkg);
      expect(errors.some((e) => e.includes("version"))).toBe(true);
    });

    it("rejects missing exportedAt", () => {
      const pkg: any = createDataPackage({});
      delete pkg.exportedAt;
      const errors = validateDataPackage(pkg);
      expect(errors.some((e) => e.includes("exportedAt"))).toBe(true);
    });

    it("rejects runs that are not arrays", () => {
      const pkg: any = createDataPackage({});
      pkg.data.runs = "not an array";
      const errors = validateDataPackage(pkg);
      expect(errors.some((e) => e.includes("runs"))).toBe(true);
    });

    it("rejects runs without id", () => {
      const pkg: any = createDataPackage({});
      pkg.data.runs = [{ query: "no id" }];
      const errors = validateDataPackage(pkg);
      expect(errors.some((e) => e.includes("missing id"))).toBe(true);
    });
  });

  describe("importDataPackage", () => {
    it("merge strategy adds new runs", () => {
      const existing = { runs: [makeRun("r1")] };
      const pkg = createDataPackage({ runs: [makeRun("r2")] });
      const { runs, result } = importDataPackage(existing, pkg, { strategy: "merge" });
      expect(runs.length).toBe(2);
      expect(result.imported.runs).toBe(1);
      expect(result.skipped.runs).toBe(0);
    });

    it("merge strategy keeps newer run by updatedAt", () => {
      const oldRun = makeRun("r1", "old");
      const newRun = { ...makeRun("r1", "new"), updatedAt: Date.now() + 100000 };
      const existing = { runs: [oldRun] };
      const pkg = createDataPackage({ runs: [newRun as any] });
      const { runs } = importDataPackage(existing, pkg, { strategy: "merge" });
      expect(runs.length).toBe(1);
      expect(runs[0].query).toBe("new");
    });

    it("skip strategy never overwrites existing", () => {
      const existingRun = makeRun("r1", "existing");
      const incomingRun = makeRun("r1", "incoming");
      const existing = { runs: [existingRun] };
      const pkg = createDataPackage({ runs: [incomingRun] });
      const { runs, result } = importDataPackage(existing, pkg, { strategy: "skip" });
      expect(runs.length).toBe(1);
      expect(runs[0].query).toBe("existing");
      expect(result.skipped.runs).toBe(1);
    });

    it("overwrite strategy replaces existing", () => {
      const existingRun = makeRun("r1", "existing");
      const incomingRun = makeRun("r1", "incoming");
      const existing = { runs: [existingRun] };
      const pkg = createDataPackage({ runs: [incomingRun] });
      const { runs, result } = importDataPackage(existing, pkg, { strategy: "overwrite" });
      expect(runs.length).toBe(1);
      expect(runs[0].query).toBe("incoming");
      expect(result.imported.runs).toBe(1);
    });

    it("handles notes, folders, templates too", () => {
      const existing = {
        notes: [makeNotes("r1")],
        folders: [makeFolder("f1", "F1")],
        templates: [makeTemplate("t1", "T1")],
      };
      const pkg = createDataPackage({
        notes: [makeNotes("r2")],
        folders: [makeFolder("f2", "F2")],
        templates: [makeTemplate("t2", "T2")],
      });
      const { notes, folders, templates, result } = importDataPackage(existing, pkg);
      expect(notes.length).toBe(2);
      expect(folders.length).toBe(2);
      expect(templates.length).toBe(2);
      expect(result.imported.notes).toBe(1);
      expect(result.imported.folders).toBe(1);
      expect(result.imported.templates).toBe(1);
    });

    it("protects system folders from overwrite in merge mode", () => {
      const systemFolder: ResearchFolder = {
        id: "folder-starred",
        name: "Starred",
        runIds: ["abc"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isSystem: true,
      };
      const existing = { folders: [systemFolder] };
      const incomingSystem = { ...systemFolder, name: "Hacked", runIds: [] };
      const pkg = createDataPackage({ folders: [incomingSystem] });
      const { folders, result } = importDataPackage(existing, pkg, { strategy: "merge" });
      expect(folders[0].name).toBe("Starred");
      expect(result.skipped.folders).toBe(1);
    });

    it("includeRuns=false skips run import", () => {
      const existing = { runs: [makeRun("r1")] };
      const pkg = createDataPackage({ runs: [makeRun("r2")] });
      const { runs, result } = importDataPackage(existing, pkg, { includeRuns: false });
      expect(runs.length).toBe(1);
      expect(result.imported.runs).toBe(0);
    });

    it("invalid package returns errors and unchanged data", () => {
      const existing = { runs: [makeRun("r1")] };
      const badPkg: any = { version: 0, source: "x", exportedAt: 0, data: {} };
      const { runs, result } = importDataPackage(existing, badPkg);
      expect(runs.length).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("handles empty existing data gracefully", () => {
      const existing = {};
      const pkg = createDataPackage({ runs: [makeRun("r1"), makeRun("r2")] });
      const { runs, result } = importDataPackage(existing, pkg);
      expect(runs.length).toBe(2);
      expect(result.totalRuns).toBe(2);
    });
  });

  describe("getExportFilename", () => {
    it("returns a string with date pattern", () => {
      const name = getExportFilename();
      expect(name).toMatch(/^launchlens-backup-\d{8}\.json$/);
    });
  });

  describe("estimatePackageSize", () => {
    it("returns a number > 0 for non-empty package", () => {
      const pkg = createDataPackage({ runs: [makeRun("r1")] });
      const size = estimatePackageSize(pkg);
      expect(typeof size).toBe("number");
      expect(size).toBeGreaterThan(0);
    });

    it("larger packages have larger estimates", () => {
      const small = createDataPackage({ runs: [makeRun("r1")] });
      const big = createDataPackage({ runs: [makeRun("r1"), makeRun("r2"), makeRun("r3")] });
      expect(estimatePackageSize(big)).toBeGreaterThan(estimatePackageSize(small));
    });
  });
});