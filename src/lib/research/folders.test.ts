/// <reference types="vitest/globals" />
import {
  getFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  addRunToFolder,
  removeRunFromFolder,
  getFoldersForRun,
  moveRun,
  getTotalFolderRuns,
  reorderFolders,
  reorderRunsInFolder,
  getFolderStats,
  findFoldersByName,
  folderExists,
  getEmptyFolders,
  cleanupEmptyFolders,
  duplicateFolder,
  exportFolders,
  resetFolders,
  getFoldersByRunCount,
  summarizeFolders,
  buildRunFolderIndex,
  foldersContainingAll,
  foldersContainingAny,
  uniqueFolderName,
  foldersToPlainList,
  foldersToCsv,
  foldersEqual,
} from "@/lib/research/folders";

// Deterministic IDs & timestamps to eliminate flakiness from Math.random / Date.now collisions
const __fakeNow = 1_700_000_000_000;
let __randCounter = 0;
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(__fakeNow);
  vi.spyOn(Math, "random").mockImplementation(() => {
    __randCounter++;
    // produce a deterministic 8-char base36-looking id fragment
    return (__randCounter / 1e9);
  });
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
});

beforeEach(() => {
  storage.clear();
});

describe("research folders", () => {
  describe("default folders", () => {
    it("has 2 system folders by default", () => {
      const folders = getFolders();
      expect(folders).toHaveLength(2);
      expect(folders[0].isSystem).toBe(true);
      expect(folders[1].isSystem).toBe(true);
    });

    it("has starred and archived system folders", () => {
      const folders = getFolders();
      const names = folders.map((f) => f.name);
      expect(names).toContain("收藏夹");
      expect(names).toContain("归档");
    });
  });

  describe("createFolder", () => {
    it("creates a new folder", () => {
      const folder = createFolder({ name: "AI 锟叫撅拷" });
      expect(folder.id).toBeTruthy();
      expect(folder.name).toBe("AI 锟叫撅拷");
      expect(folder.runIds).toEqual([]);
      expect(folder.isSystem).toBeUndefined();

      const all = getFolders();
      expect(all).toHaveLength(3);
    });

    it("creates folder with initial runs", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷", runIds: ["run-1", "run-2"] });
      expect(folder.runIds).toEqual(["run-1", "run-2"]);
    });

    it("sets default icon", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷" });
      expect(folder.icon).toBe("??");
    });
  });

  describe("getFolder", () => {
    it("finds a folder by id", () => {
      const created = createFolder({ name: "锟斤拷锟揭诧拷锟斤拷" });
      const found = getFolder(created.id);
      expect(found?.name).toBe("锟斤拷锟揭诧拷锟斤拷");
    });

    it("returns undefined for non-existent", () => {
      expect(getFolder("fake")).toBeUndefined();
    });
  });

  describe("updateFolder", () => {
    it("updates folder name", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷锟斤拷" });
      const updated = updateFolder(folder.id, { name: "锟斤拷锟斤拷锟斤拷" });
      expect(updated?.name).toBe("锟斤拷锟斤拷锟斤拷");
    });

    it("returns null for non-existent folder", () => {
      expect(updateFolder("fake", { name: "x" })).toBeNull();
    });

    it("can't rename system folders", () => {
      const starred = getFolders().find((f) => f.isSystem)!;
      const updated = updateFolder(starred.id, { name: "锟斤拷锟斤拷锟斤拷" });
      expect(updated?.name).toBe(starred.name); // unchanged
    });

    it("can update system folder icon", () => {
      const starred = getFolders().find((f) => f.isSystem)!;
      const updated = updateFolder(starred.id, { icon: "??" });
      expect(updated?.icon).toBe("??");
    });
  });

  describe("deleteFolder", () => {
    it("deletes a custom folder", () => {
      const folder = createFolder({ name: "要删锟斤拷" });
      const result = deleteFolder(folder.id);
      expect(result).toBe(true);
      expect(getFolders()).toHaveLength(2); // back to defaults
    });

    it("rejects deleting system folders", () => {
      const system = getFolders().find((f) => f.isSystem)!;
      expect(deleteFolder(system.id)).toBe(false);
    });
  });

  describe("addRunToFolder", () => {
    it("adds a run to a folder", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷" });
      const result = addRunToFolder(folder.id, "run-1");
      expect(result).toBe(true);

      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toContain("run-1");
    });

    it("doesn't duplicate runs", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷", runIds: ["run-1"] });
      addRunToFolder(folder.id, "run-1");
      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toHaveLength(1);
    });

    it("returns false for invalid folder", () => {
      expect(addRunToFolder("fake", "run-1")).toBe(false);
    });
  });

  describe("removeRunFromFolder", () => {
    it("removes a run from a folder", () => {
      const folder = createFolder({ name: "锟斤拷锟斤拷", runIds: ["run-1", "run-2"] });
      removeRunFromFolder(folder.id, "run-1");

      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toEqual(["run-2"]);
    });
  });

  describe("getFoldersForRun", () => {
    it("returns all folders containing a run", () => {
      const f1 = createFolder({ name: "A", runIds: ["run-1", "run-2"] });
      const f2 = createFolder({ name: "B", runIds: ["run-1"] });

      const result = getFoldersForRun("run-1");
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());
    });

    it("returns empty array for run in no folders", () => {
      expect(getFoldersForRun("nonexistent")).toHaveLength(0);
    });
  });

  describe("moveRun", () => {
    it("moves a run between folders", () => {
      const from = createFolder({ name: "源", runIds: ["run-1", "run-2"] });
      const to = createFolder({ name: "目锟斤拷", runIds: ["run-3"] });

      const result = moveRun("run-1", from.id, to.id);
      expect(result).toBe(true);

      const fromUpdated = getFolder(from.id)!;
      const toUpdated = getFolder(to.id)!;

      expect(fromUpdated.runIds).not.toContain("run-1");
      expect(toUpdated.runIds).toContain("run-1");
    });
  });

  describe("reorderFolders", () => {
    it("reorders custom folders while keeping system folders fixed", () => {
      createFolder({ name: "A" });
      createFolder({ name: "B" });
      createFolder({ name: "C" });

      let folders = getFolders().filter((f) => !f.isSystem);
      expect(folders).toHaveLength(3);
      const initialIds = folders.map((f) => f.id);

      const movedId = initialIds[initialIds.length - 1];
      const result = reorderFolders(movedId, 0);
      expect(result).toBe(true);

      folders = getFolders().filter((f) => !f.isSystem);
      expect(folders[0].id).toBe(movedId);

      const all = getFolders();
      expect(all[0].isSystem).toBe(true);
      expect(all[1].isSystem).toBe(true);
    });

    it("returns false for non-existent folder", () => {
      expect(reorderFolders("fake", 0)).toBe(false);
    });

    it("clamps target index to valid range", () => {
      const f1 = createFolder({ name: "A" });
      createFolder({ name: "B" });
      const result = reorderFolders(f1.id, 100);
      expect(result).toBe(true);
      const folders = getFolders().filter((f) => !f.isSystem);
      expect(folders[folders.length - 1].id).toBe(f1.id);
    });
  });

  describe("reorderRunsInFolder", () => {
    it("reorders runs within a folder", () => {
      const folder = createFolder({ name: "Test", runIds: ["run-1", "run-2", "run-3", "run-4"] });
      const result = reorderRunsInFolder(folder.id, "run-3", 0);
      expect(result).toBe(true);
      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toEqual(["run-3", "run-1", "run-2", "run-4"]);
    });

    it("moves a run from start to end", () => {
      const folder = createFolder({ name: "Test", runIds: ["run-1", "run-2", "run-3"] });
      reorderRunsInFolder(folder.id, "run-1", 2);
      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toEqual(["run-2", "run-3", "run-1"]);
    });

    it("returns false for non-existent folder", () => {
      expect(reorderRunsInFolder("fake", "run-1", 0)).toBe(false);
    });

    it("returns false if run not in folder", () => {
      const folder = createFolder({ name: "Test", runIds: ["run-1"] });
      expect(reorderRunsInFolder(folder.id, "run-missing", 0)).toBe(false);
    });

    it("clamps target index to valid range", () => {
      const folder = createFolder({ name: "Test", runIds: ["a", "b", "c"] });
      reorderRunsInFolder(folder.id, "a", 999);
      const updated = getFolder(folder.id)!;
      expect(updated.runIds[updated.runIds.length - 1]).toBe("a");
    });
  });

  describe("getTotalFolderRuns", () => {
    it("counts total runs across all folders", () => {
      createFolder({ name: "A", runIds: ["a", "b"] });
      createFolder({ name: "B", runIds: ["c"] });

      expect(getTotalFolderRuns()).toBe(3); // 2 system(0) + A(2) + B(1)
      // System folders have 0 each = 2 + 3 = 5? No: system folders have 0, A has 2, B has 1 = 3
      // Actually: default folders are 2 with 0 each, plus A(2) + B(1) = 3 total
      // Let's count properly
      const total = getFolders().reduce((s, f) => s + f.runIds.length, 0);
      expect(getTotalFolderRuns()).toBe(total);
    });
  });
});


describe("folder stats (round 136)", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("getFolderStats computes totals correctly", () => {
    const f1 = createFolder({ name: "Research" });
    createFolder({ name: "Empty" });
    addRunToFolder(f1.id, "run-1");
    addRunToFolder(f1.id, "run-2");

    const stats = getFolderStats();
    expect(stats.totalFolders).toBeGreaterThanOrEqual(4); // 2 system + 2 custom
    expect(stats.customFolders).toBe(2);
    expect(stats.systemFolders).toBe(2);
    expect(stats.totalRunsOrganized).toBe(2);
    expect(stats.emptyFolders).toBeGreaterThanOrEqual(1);
    expect(stats.largestFolder).not.toBeNull();
    expect(stats.largestFolder!.name).toBe("Research");
  });
});

describe("folder search and validation (round 136)", () => {
  beforeEach(() => storage.clear());

  it("findFoldersByName searches name and description", () => {
    createFolder({ name: "AI Research", description: "machine learning" });
    createFolder({ name: "Climate Reports" });
    const results = findFoldersByName("AI");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((f) => f.name === "AI Research")).toBe(true);
  });

  it("findFoldersByName returns all when query empty", () => {
    createFolder({ name: "A" });
    expect(findFoldersByName("").length).toBe(getFolders().length);
  });

  it("folderExists detects duplicate names", () => {
    createFolder({ name: "My Folder" });
    expect(folderExists("my folder")).toBe(true);
    expect(folderExists("Other")).toBe(false);
  });

  it("folderExists excludes given id for rename checks", () => {
    const f = createFolder({ name: "Folder A" });
    expect(folderExists("Folder A", f.id)).toBe(false);
  });
});

describe("empty folder cleanup (round 136)", () => {
  beforeEach(() => storage.clear());

  it("getEmptyFolders returns custom empty folders", () => {
    createFolder({ name: "Empty1" });
    createFolder({ name: "NonEmpty" });
    const f2 = getFolders().find((f) => f.name === "NonEmpty");
    if (f2) addRunToFolder(f2.id, "r1");
    const empty = getEmptyFolders();
    expect(empty.some((f) => f.name === "Empty1")).toBe(true);
  });

  it("cleanupEmptyFolders removes empty custom folders", () => {
    const f1 = createFolder({ name: "Keep" });
    createFolder({ name: "Remove" });
    addRunToFolder(f1.id, "r1");
    const before = getFolders().length;
    const removed = cleanupEmptyFolders();
    expect(removed).toBe(1);
    expect(getFolders().length).toBe(before - 1);
  });
});

describe("duplicate and export (round 136)", () => {
  beforeEach(() => storage.clear());

  it("duplicateFolder copies runIds with new name", () => {
    const f = createFolder({ name: "Original", color: "#ff0000" });
    addRunToFolder(f.id, "r1");
    addRunToFolder(f.id, "r2");
    const copy = duplicateFolder(f.id, "Copy Name");
    expect(copy).not.toBeNull();
    expect(copy!.name).toBe("Copy Name");
    expect(copy!.id).not.toBe(f.id);
    expect(copy!.runIds).toEqual(["r1", "r2"]);
    expect(copy!.isSystem).toBe(false);
  });

  it("duplicateFolder returns null for non-existent", () => {
    expect(duplicateFolder("missing")).toBeNull();
  });

  it("exportFolders returns valid JSON", () => {
    createFolder({ name: "Test Export" });
    const json = exportFolders();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("resetFolders clears custom folders", () => {
    createFolder({ name: "Custom" });
    resetFolders();
    const folders = getFolders();
    expect(folders.every((f) => f.isSystem)).toBe(true);
  });

  it("getFoldersByRunCount sorts by run count desc", () => {
    const f1 = createFolder({ name: "Big" });
    addRunToFolder(f1.id, "r1");
    addRunToFolder(f1.id, "r2");
    const f2 = createFolder({ name: "Small" });
    addRunToFolder(f2.id, "r1");
    const sorted = getFoldersByRunCount();
    const big = sorted.findIndex((f) => f.name === "Big");
    const small = sorted.findIndex((f) => f.name === "Small");
    expect(big).toBeLessThan(small);
  });
});
describe("folder extensions (round 153)", () => {
  const mk = (o: any = {}): any => ({
    id: o.id || "f",
    name: o.name || "N",
    description: o.description,
    icon: o.icon,
    color: o.color,
    runIds: o.runIds || [],
    createdAt: o.createdAt ?? 0,
    updatedAt: o.updatedAt ?? 0,
    isSystem: !!o.isSystem,
    position: o.position,
  });

  it("summarizeFolders counts system/custom/empty and tracks largest/newest", () => {
    const folders = [
      mk({ id: "s1", name: "Starred", isSystem: true, runIds: [], updatedAt: 5 }),
      mk({ id: "c1", name: "Big", runIds: ["a","b","c"], updatedAt: 10 }),
      mk({ id: "c2", name: "Empty", runIds: [], updatedAt: 1 }),
      mk({ id: "c3", name: "Medium", runIds: ["x"], updatedAt: 2 }),
    ];
    const s2 = summarizeFolders(folders);
    expect(s2.total).toBe(4);
    expect(s2.system).toBe(1);
    expect(s2.custom).toBe(3);
    expect(s2.empty).toBe(1);
    expect(s2.totalRuns).toBe(4);
    expect(s2.largest?.id).toBe("c1");
    expect(s2.newest?.id).toBe("c1");
  });

  it("summarizeFolders is safe on empty input", () => {
    const s2 = summarizeFolders([]);
    expect(s2.total).toBe(0);
    expect(s2.totalRuns).toBe(0);
    expect(s2.largest).toBeUndefined();
    expect(s2.newest).toBeUndefined();
  });

  it("buildRunFolderIndex maps runId -> folderId[]", () => {
    const folders = [mk({ id: "a", runIds: ["r1","r2"] }), mk({ id: "b", runIds: ["r2","r3"] })];
    const idx = buildRunFolderIndex(folders);
    expect(idx.get("r1")).toEqual(["a"]);
    expect(idx.get("r2")?.sort()).toEqual(["a","b"]);
    expect(idx.get("r3")).toEqual(["b"]);
    expect(idx.get("missing")).toBeUndefined();
  });

  it("foldersContainingAll/Any respect set semantics", () => {
    const folders = [
      mk({ id: "a", runIds: ["r1","r2","r3"] }),
      mk({ id: "b", runIds: ["r1","r2"] }),
      mk({ id: "c", runIds: ["r4"] }),
    ];
    expect(foldersContainingAll(folders, ["r1","r3"]).map(f => f.id)).toEqual(["a"]);
    expect(foldersContainingAny(folders, ["r1","r4"]).map(f => f.id).sort()).toEqual(["a","b","c"]);
    expect(foldersContainingAll(folders, ["r1","r4"])).toEqual([]);
    expect(foldersContainingAny(folders, [])).toEqual([]);
  });

  it("uniqueFolderName appends (2), (3)... case-insensitively", () => {
    const folders = [mk({ name: "Alpha" }), mk({ name: "alpha (2)" })];
    expect(uniqueFolderName(folders, "Alpha")).toBe("Alpha (3)");
    expect(uniqueFolderName(folders, "Beta")).toBe("Beta");
  });

  it("foldersToPlainList returns flat records with run counts", () => {
    const list = foldersToPlainList([mk({ id: "a", name: "A", runIds: ["x","y"], position: 0, isSystem: true })]);
    expect(list).toEqual([{ id: "a", name: "A", isSystem: true, runCount: 2, position: 0 }]);
  });

  it("foldersToCsv emits header and CSV-safe quoted names", () => {
    const csv = foldersToCsv([mk({ id: "a", name: "Hi, there", color: "#fff", runIds: ["r"], createdAt: 1, updatedAt: 2, position: 3 })]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("id,name,isSystem,color,runCount,createdAt,updatedAt,position");
    expect(row).toContain('"Hi, there"');
    expect(row.startsWith("a,")).toBe(true);
  });

  it("foldersEqual detects equality ignoring runId order", () => {
    const a = mk({ id: "a", name: "n", color: "#f", runIds: ["r1","r2"], position: 2 });
    const b = mk({ id: "a", name: "n", color: "#f", runIds: ["r2","r1"], position: 2 });
    expect(foldersEqual(a, b)).toBe(true);
    b.name = "other";
    expect(foldersEqual(a, b)).toBe(false);
    expect(foldersEqual(a, mk({ id: "x" }))).toBe(false);
  });
});
