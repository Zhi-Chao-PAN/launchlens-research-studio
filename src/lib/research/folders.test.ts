import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
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
} from "@/lib/research/folders";

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
      const folder = createFolder({ name: "AI 研究" });
      expect(folder.id).toBeTruthy();
      expect(folder.name).toBe("AI 研究");
      expect(folder.runIds).toEqual([]);
      expect(folder.isSystem).toBeUndefined();

      const all = getFolders();
      expect(all).toHaveLength(3);
    });

    it("creates folder with initial runs", () => {
      const folder = createFolder({ name: "测试", runIds: ["run-1", "run-2"] });
      expect(folder.runIds).toEqual(["run-1", "run-2"]);
    });

    it("sets default icon", () => {
      const folder = createFolder({ name: "测试" });
      expect(folder.icon).toBe("??");
    });
  });

  describe("getFolder", () => {
    it("finds a folder by id", () => {
      const created = createFolder({ name: "查找测试" });
      const found = getFolder(created.id);
      expect(found?.name).toBe("查找测试");
    });

    it("returns undefined for non-existent", () => {
      expect(getFolder("fake")).toBeUndefined();
    });
  });

  describe("updateFolder", () => {
    it("updates folder name", () => {
      const folder = createFolder({ name: "旧名字" });
      const updated = updateFolder(folder.id, { name: "新名字" });
      expect(updated?.name).toBe("新名字");
    });

    it("returns null for non-existent folder", () => {
      expect(updateFolder("fake", { name: "x" })).toBeNull();
    });

    it("can't rename system folders", () => {
      const starred = getFolders().find((f) => f.isSystem)!;
      const updated = updateFolder(starred.id, { name: "新名字" });
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
      const folder = createFolder({ name: "要删除" });
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
      const folder = createFolder({ name: "测试" });
      const result = addRunToFolder(folder.id, "run-1");
      expect(result).toBe(true);

      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toContain("run-1");
    });

    it("doesn't duplicate runs", () => {
      const folder = createFolder({ name: "测试", runIds: ["run-1"] });
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
      const folder = createFolder({ name: "测试", runIds: ["run-1", "run-2"] });
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
      const to = createFolder({ name: "目标", runIds: ["run-3"] });

      const result = moveRun("run-1", from.id, to.id);
      expect(result).toBe(true);

      const fromUpdated = getFolder(from.id)!;
      const toUpdated = getFolder(to.id)!;

      expect(fromUpdated.runIds).not.toContain("run-1");
      expect(toUpdated.runIds).toContain("run-1");
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