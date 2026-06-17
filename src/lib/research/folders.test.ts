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
  reorderFolders,
  reorderRunsInFolder,
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
      expect(names).toContain("�ղؼ�");
      expect(names).toContain("�鵵");
    });
  });

  describe("createFolder", () => {
    it("creates a new folder", () => {
      const folder = createFolder({ name: "AI �о�" });
      expect(folder.id).toBeTruthy();
      expect(folder.name).toBe("AI �о�");
      expect(folder.runIds).toEqual([]);
      expect(folder.isSystem).toBeUndefined();

      const all = getFolders();
      expect(all).toHaveLength(3);
    });

    it("creates folder with initial runs", () => {
      const folder = createFolder({ name: "����", runIds: ["run-1", "run-2"] });
      expect(folder.runIds).toEqual(["run-1", "run-2"]);
    });

    it("sets default icon", () => {
      const folder = createFolder({ name: "����" });
      expect(folder.icon).toBe("??");
    });
  });

  describe("getFolder", () => {
    it("finds a folder by id", () => {
      const created = createFolder({ name: "���Ҳ���" });
      const found = getFolder(created.id);
      expect(found?.name).toBe("���Ҳ���");
    });

    it("returns undefined for non-existent", () => {
      expect(getFolder("fake")).toBeUndefined();
    });
  });

  describe("updateFolder", () => {
    it("updates folder name", () => {
      const folder = createFolder({ name: "������" });
      const updated = updateFolder(folder.id, { name: "������" });
      expect(updated?.name).toBe("������");
    });

    it("returns null for non-existent folder", () => {
      expect(updateFolder("fake", { name: "x" })).toBeNull();
    });

    it("can't rename system folders", () => {
      const starred = getFolders().find((f) => f.isSystem)!;
      const updated = updateFolder(starred.id, { name: "������" });
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
      const folder = createFolder({ name: "Ҫɾ��" });
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
      const folder = createFolder({ name: "����" });
      const result = addRunToFolder(folder.id, "run-1");
      expect(result).toBe(true);

      const updated = getFolder(folder.id)!;
      expect(updated.runIds).toContain("run-1");
    });

    it("doesn't duplicate runs", () => {
      const folder = createFolder({ name: "����", runIds: ["run-1"] });
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
      const folder = createFolder({ name: "����", runIds: ["run-1", "run-2"] });
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
      const from = createFolder({ name: "Դ", runIds: ["run-1", "run-2"] });
      const to = createFolder({ name: "Ŀ��", runIds: ["run-3"] });

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
      const f1 = createFolder({ name: "A" });
      const f2 = createFolder({ name: "B" });
      const f3 = createFolder({ name: "C" });

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