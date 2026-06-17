import { describe, it, expect } from "vitest";
import {
  createDataPackage,
  validateDataPackage,
  importDataPackage,
  getExportFilename,
  estimatePackageSize,
  createFolderPackage,
  createFoldersBundle,
  getFolderExportFilename,
  getFoldersBundleFilename,
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
describe("createFolderPackage", () => {
  it("exports a single folder with its runs and notes", () => {
    const folder: ResearchFolder = {
      id: "f1",
      name: "My Folder",
      runIds: ["r1", "r2"],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const allRuns = [
      makeRun("r1", "query 1"),
      makeRun("r2", "query 2"),
      makeRun("r3", "query 3"),
    ];
    const allNotes = [makeNotes("r1"), makeNotes("r3")];

    const pkg = createFolderPackage({ folder, allRuns, allNotes });

    expect(pkg.data.folders?.length).toBe(1);
    expect(pkg.data.folders?.[0].id).toBe("f1");
    expect(pkg.data.runs?.length).toBe(2);
    expect(pkg.data.runs?.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    // Only r1 has notes in this folder
    expect(pkg.data.notes?.length).toBe(1);
    expect(pkg.data.notes?.[0].runId).toBe("r1");
  });

  it("returns empty runs/notes when folder has no runs", () => {
    const folder: ResearchFolder = {
      id: "empty",
      name: "Empty",
      runIds: [],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const allRuns = [makeRun("r1")];

    const pkg = createFolderPackage({ folder, allRuns });
    expect(pkg.data.runs?.length).toBe(0);
    expect(pkg.data.notes?.length).toBe(0);
    expect(pkg.data.folders?.length).toBe(1);
  });

  it("respects includeNotes=false", () => {
    const folder: ResearchFolder = {
      id: "f1",
      name: "F",
      runIds: ["r1"],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const allRuns = [makeRun("r1")];
    const allNotes = [makeNotes("r1")];

    const pkg = createFolderPackage({ folder, allRuns, allNotes, includeNotes: false });
    expect(pkg.data.notes?.length).toBe(0);
    expect(pkg.data.runs?.length).toBe(1);
  });

  it("produces a valid data package", () => {
    const folder: ResearchFolder = {
      id: "f1",
      name: "F",
      runIds: ["r1"],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const pkg = createFolderPackage({ folder, allRuns: [makeRun("r1")] });
    const errors = validateDataPackage(pkg);
    expect(errors.length).toBe(0);
  });
});

describe("createFoldersBundle", () => {
  it("exports multiple folders and deduplicates shared runs", () => {
    const f1: ResearchFolder = {
      id: "f1", name: "F1", runIds: ["r1", "r2"],
      createdAt: 1000, updatedAt: 2000,
    };
    const f2: ResearchFolder = {
      id: "f2", name: "F2", runIds: ["r2", "r3"],
      createdAt: 1000, updatedAt: 2000,
    };
    const allFolders = [f1, f2];
    const allRuns = [makeRun("r1"), makeRun("r2"), makeRun("r3"), makeRun("r4")];
    const allNotes = [makeNotes("r1"), makeNotes("r2"), makeNotes("r4")];

    const pkg = createFoldersBundle({
      folderIds: ["f1", "f2"],
      allFolders,
      allRuns,
      allNotes,
    });

    // Both folders included
    expect(pkg.data.folders?.length).toBe(2);
    const fIds = pkg.data.folders?.map((f) => f.id).sort();
    expect(fIds).toEqual(["f1", "f2"]);

    // r1, r2, r3 all present (deduplicated 鈥?r2 only once)
    const rIds = pkg.data.runs?.map((r) => r.id).sort();
    expect(rIds).toEqual(["r1", "r2", "r3"]);
    expect(pkg.data.runs?.length).toBe(3);

    // r4 not in any folder -> excluded
    expect(rIds).not.toContain("r4");

    // Notes for r1 and r2 only
    const nIds = pkg.data.notes?.map((n) => n.runId).sort();
    expect(nIds).toEqual(["r1", "r2"]);
  });

  it("silently ignores folderIds that don't exist in allFolders", () => {
    const f1: ResearchFolder = {
      id: "f1", name: "F1", runIds: ["r1"],
      createdAt: 1000, updatedAt: 2000,
    };

    const pkg = createFoldersBundle({
      folderIds: ["f1", "nonexistent"],
      allFolders: [f1],
      allRuns: [makeRun("r1")],
    });

    expect(pkg.data.folders?.length).toBe(1);
    expect(pkg.data.folders?.[0].id).toBe("f1");
  });

  it("empty folderIds produces empty package", () => {
    const pkg = createFoldersBundle({
      folderIds: [],
      allFolders: [makeFolder("f1", "F1")],
      allRuns: [makeRun("r1")],
    });

    expect(pkg.data.folders?.length).toBe(0);
    expect(pkg.data.runs?.length).toBe(0);
    expect(pkg.data.notes?.length).toBe(0);
  });

  it("produces a valid data package", () => {
    const f1: ResearchFolder = {
      id: "f1", name: "F1", runIds: ["r1"],
      createdAt: 1000, updatedAt: 2000,
    };
    const f2: ResearchFolder = {
      id: "f2", name: "F2", runIds: ["r2"],
      createdAt: 1000, updatedAt: 2000,
    };
    const pkg = createFoldersBundle({
      folderIds: ["f1", "f2"],
      allFolders: [f1, f2],
      allRuns: [makeRun("r1"), makeRun("r2")],
    });
    const errors = validateDataPackage(pkg);
    expect(errors.length).toBe(0);
  });
});

describe("getFolderExportFilename", () => {
  it("includes sanitized folder name and date", () => {
    const name = getFolderExportFilename("My Research Folder");
    expect(name).toMatch(/^launchlens-folder-my-research-folder-\d{8}\.json$/);
  });

  it("handles Chinese characters", () => {
    const name = getFolderExportFilename("甯傚満璋冪爺");
    expect(name).toMatch(/^launchlens-folder-甯傚満璋冪爺-\d{8}\.json$/);
  });

  it("falls back to 'export' for empty folder names", () => {
    const name = getFolderExportFilename("");
    expect(name).toMatch(/^launchlens-folder-export-\d{8}\.json$/);
  });

  it("truncates very long folder names", () => {
    const long = "a".repeat(100);
    const name = getFolderExportFilename(long);
    expect(name.length).toBeLessThan(80);
  });
});

describe("getFoldersBundleFilename", () => {
  it("includes count and date", () => {
    const name = getFoldersBundleFilename(5);
    expect(name).toMatch(/^launchlens-folders-5-\d{8}\.json$/);
  });
});
