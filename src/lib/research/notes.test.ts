import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  savePersonalNote,
  getNotes,
  addAnnotation,
  deleteAnnotation,
  toggleStar,
  setRating,
  addTag,
  removeTag,
  toggleArchive,
  markOpened,
  getAllNotes,
  getStarredRuns,
  getAllTags,
  searchNotes,
} from "@/lib/research/notes";

// Mock localStorage
const storage = new Map<string, string>();

beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
  // Also ensure window exists
  if (typeof window === "undefined") {
    vi.stubGlobal("window", { localStorage: storage });
  }
});

describe("research notes", () => {
  beforeEach(() => {
    storage.clear();
    // Also clear the module cache to ensure fresh state
    vi.resetModules();
  });

  describe("getNotes", () => {
    it("returns null for non-existent run", () => {
      expect(getNotes("nonexistent")).toBeNull();
    });
  });

  describe("savePersonalNote", () => {
    it("saves and retrieves a personal note", () => {
      savePersonalNote("run-1", "This is a great study!");
      const notes = getNotes("run-1");
      expect(notes?.personalNote).toBe("This is a great study!");
    });

    it("updates existing note", () => {
      savePersonalNote("run-1", "first");
      savePersonalNote("run-1", "second");
      const notes = getNotes("run-1");
      expect(notes?.personalNote).toBe("second");
    });
  });

  describe("addAnnotation", () => {
    it("adds a note annotation", () => {
      const ann = addAnnotation("run-1", { type: "note", content: "Good insight" });
      expect(ann.id).toBeTruthy();
      expect(ann.type).toBe("note");
      expect(ann.content).toBe("Good insight");
      expect(ann.createdAt).toBeGreaterThan(0);

      const notes = getNotes("run-1");
      expect(notes?.annotations).toHaveLength(1);
    });

    it("adds multiple annotations", () => {
      addAnnotation("run-1", { type: "note", content: "one" });
      addAnnotation("run-1", { type: "highlight", color: "yellow" });
      addAnnotation("run-1", { type: "note", content: "three" });

      const notes = getNotes("run-1");
      expect(notes?.annotations).toHaveLength(3);
    });
  });

  describe("deleteAnnotation", () => {
    it("deletes an annotation by id", () => {
      const ann = addAnnotation("run-1", { type: "note", content: "to delete" });
      deleteAnnotation("run-1", ann.id);

      const notes = getNotes("run-1");
      expect(notes?.annotations).toHaveLength(0);
    });

    it("silently ignores non-existent ids", () => {
      expect(() => deleteAnnotation("run-1", "fake")).not.toThrow();
    });
  });

  describe("toggleStar", () => {
    it("toggles star status", () => {
      expect(toggleStar("run-1")).toBe(true);
      expect(toggleStar("run-1")).toBe(false);
    });

    it("stars are reflected in getNotes", () => {
      toggleStar("run-1");
      const notes = getNotes("run-1");
      expect(notes?.isStarred).toBe(true);
    });
  });

  describe("setRating", () => {
    it("sets a rating between 0-5", () => {
      setRating("run-1", 4);
      expect(getNotes("run-1")?.rating).toBe(4);
    });

    it("clamps ratings to valid range", () => {
      setRating("run-1", 10);
      expect(getNotes("run-1")?.rating).toBe(5);
      setRating("run-1", -5);
      expect(getNotes("run-1")?.rating).toBe(0);
    });
  });

  describe("tags", () => {
    it("adds tags", () => {
      addTag("run-1", "important");
      addTag("run-1", "market");
      const notes = getNotes("run-1");
      expect(notes?.tags).toEqual(["important", "market"]);
    });

    it("doesn't duplicate tags", () => {
      addTag("run-1", "ai");
      addTag("run-1", "ai");
      const notes = getNotes("run-1");
      expect(notes?.tags).toEqual(["ai"]);
    });

    it("removes tags", () => {
      addTag("run-1", "a");
      addTag("run-1", "b");
      removeTag("run-1", "a");
      const notes = getNotes("run-1");
      expect(notes?.tags).toEqual(["b"]);
    });
  });

  describe("archive", () => {
    it("toggles archive status", () => {
      expect(toggleArchive("run-1")).toBe(true);
      expect(getNotes("run-1")?.isArchived).toBe(true);
      expect(toggleArchive("run-1")).toBe(false);
    });
  });

  describe("markOpened", () => {
    it("updates lastOpenedAt timestamp", () => {
      const before = Date.now();
      markOpened("run-1");
      const notes = getNotes("run-1");
      expect(notes?.lastOpenedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("queries", () => {
    beforeEach(() => {
      savePersonalNote("run-1", "Great AI research");
      addTag("run-1", "ai");
      addTag("run-1", "market");

      savePersonalNote("run-2", "Biotech analysis");
      addTag("run-2", "biotech");

      toggleStar("run-1");
    });

    it("getAllNotes returns all notes", () => {
      expect(getAllNotes()).toHaveLength(2);
    });

    it("getStarredRuns returns starred run ids", () => {
      const starred = getStarredRuns();
      expect(starred).toContain("run-1");
      expect(starred).not.toContain("run-2");
    });

    it("getAllTags returns unique sorted tags", () => {
      const tags = getAllTags();
      expect(tags).toEqual(["ai", "biotech", "market"]);
    });

    it("searchNotes finds notes by content", () => {
      const results = searchNotes("ai");
      expect(results).toHaveLength(1);
      expect(results[0].runId).toBe("run-1");
    });

    it("searchNotes finds notes by tag", () => {
      const results = searchNotes("biotech");
      expect(results).toHaveLength(1);
      expect(results[0].runId).toBe("run-2");
    });

    it("searchNotes returns empty for no matches", () => {
      expect(searchNotes("nonexistent")).toHaveLength(0);
    });
  });
});
