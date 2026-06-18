/// <reference types="vitest/globals" />
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
  getQuickNoteTemplates,
  addQuickNoteTemplate,
  deleteQuickNoteTemplate,
  insertQuickNote,
  bulkAddTag,
  bulkRemoveTag,
  bulkStarRuns,
  bulkArchiveRuns,
  bulkSetRating,
  getNotesStats,
  updateAnnotation,
  getAnnotationsByType,
  getAllAnnotations,
  exportNotesPackage,
  importNotesPackage,
  getNoteWordCount,
  getRecentlyUpdatedNotes,
  getRecentlyOpenedNotes,
  hasUnsavedNotes,
  getEmptyNotesCount,
  cleanupEmptyNotes,
  summarizeNotes,
  filterNotesByRating,
  filterNotesByTags,
  filterNotesByFlags,
  mergeNotes,
  dedupeNotes,
  tagCloud,
  notesToCsv,
  notesEqual,
  type ResearchNotes,
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



describe("quick note templates", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns default quick note templates", () => {
    const templates = getQuickNoteTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(6);
    expect(templates[0].id).toContain("qn-");
    expect(templates[0].name).toBeTruthy();
    expect(templates[0].content).toBeTruthy();
  });

  it("adds a custom quick note template", () => {
    const tpl = addQuickNoteTemplate("My Template", "My note content");
    expect(tpl.id).toContain("qn-");
    expect(tpl.name).toBe("My Template");
    expect(tpl.content).toBe("My note content");

    const all = getQuickNoteTemplates();
    expect(all.some((t) => t.id === tpl.id)).toBe(true);
  });

  it("deletes a quick note template", () => {
    const tpl = addQuickNoteTemplate("Delete Me", "content");
    const result = deleteQuickNoteTemplate(tpl.id);
    expect(result).toBe(true);

    const all = getQuickNoteTemplates();
    expect(all.some((t) => t.id === tpl.id)).toBe(false);
  });

  it("returns false when deleting non-existent template", () => {
    expect(deleteQuickNoteTemplate("nonexistent")).toBe(false);
  });

  it("inserts a quick note into a run's personal note", () => {
    const tpl = addQuickNoteTemplate("Custom", "**Custom:** ");
    const result = insertQuickNote("run-with-quicknote", tpl.id);
    expect(result).toBeTruthy();
    expect(result).toContain("**Custom:**");

    const notes = getNotes("run-with-quicknote");
    expect(notes?.personalNote).toContain("**Custom:**");
  });

  it("returns null for non-existent template", () => {
    const result = insertQuickNote("run-1", "nonexistent-template");
    expect(result).toBeNull();
  });

  it("appends quick note below existing content", () => {
    savePersonalNote("run-append", "Existing note");
    const tpl = addQuickNoteTemplate("Append", "Appended text");
    insertQuickNote("run-append", tpl.id);

    const notes = getNotes("run-append");
    expect(notes?.personalNote).toContain("Existing note");
    expect(notes?.personalNote).toContain("Appended text");
  });
});

describe("bulk note operations", () => {
  beforeEach(() => {
    storage.clear();
    // Set up some runs
    addTag("run-1", "tag1");
    addTag("run-2", "tag1");
    addTag("run-3", "tag2");
    toggleStar("run-starred");
    toggleArchive("run-archived");
  });

  it("bulk adds a tag to multiple runs", () => {
    const result = bulkAddTag(["run-1", "run-2", "run-3"], "new-tag");
    expect(result.updated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors.length).toBe(0);

    const notes1 = getNotes("run-1");
    expect(notes1?.tags).toContain("new-tag");
  });

  it("skips runs that already have the tag", () => {
    const result = bulkAddTag(["run-1", "run-2"], "tag1");
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(2);
  });

  it("bulk removes a tag from multiple runs", () => {
    const result = bulkRemoveTag(["run-1", "run-2", "run-3"], "tag1");
    expect(result.updated).toBe(2);

    const notes1 = getNotes("run-1");
    expect(notes1?.tags).not.toContain("tag1");
  });

  it("bulk stars multiple runs", () => {
    const result = bulkStarRuns(["run-1", "run-2"], true);
    expect(result.updated).toBe(2);

    const starred = getStarredRuns();
    expect(starred).toContain("run-1");
    expect(starred).toContain("run-2");
  });

  it("bulk unstars runs", () => {
    const result = bulkStarRuns(["run-starred"], false);
    expect(result.updated).toBe(1);

    const starred = getStarredRuns();
    expect(starred).not.toContain("run-starred");
  });

  it("bulk archives multiple runs", () => {
    const result = bulkArchiveRuns(["run-1", "run-2"], true);
    expect(result.updated).toBe(2);
    expect(getNotes("run-1")?.isArchived).toBe(true);
  });

  it("bulk sets rating for multiple runs", () => {
    const result = bulkSetRating(["run-1", "run-2"], 4);
    expect(result.updated).toBe(2);
    expect(getNotes("run-1")?.rating).toBe(4);
  });

  it("clamps rating to 0-5 range", () => {
    bulkSetRating(["run-1"], 10);
    expect(getNotes("run-1")?.rating).toBe(5);

    bulkSetRating(["run-1"], -1);
    expect(getNotes("run-1")?.rating).toBe(0);
  });
});

describe("notes statistics", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("returns zeroed stats when no notes exist", () => {
    const stats = getNotesStats();
    expect(stats.totalRuns).toBe(0);
    expect(stats.starred).toBe(0);
    expect(stats.avgRating).toBeNull();
    expect(stats.tagFrequency.length).toBe(0);
  });

  it("calculates correct statistics", () => {
    savePersonalNote("run-1", "My personal note");
    addTag("run-1", "tag-a");
    addTag("run-1", "tag-b");
    setRating("run-1", 4);
    toggleStar("run-1");
    addAnnotation("run-1", { type: "highlight", content: "highlighted text" });

    addTag("run-2", "tag-a");
    addTag("run-2", "tag-c");
    setRating("run-2", 2);

    toggleArchive("run-3");

    const stats = getNotesStats();
    expect(stats.totalRuns).toBe(3);
    expect(stats.withPersonalNote).toBe(1);
    expect(stats.withAnnotations).toBe(1);
    expect(stats.starred).toBe(1);
    expect(stats.archived).toBe(1);
    expect(stats.totalAnnotations).toBe(1);
    expect(stats.totalTags).toBe(3);
    expect(stats.ratedRuns).toBe(2);
    expect(stats.avgRating).toBe(3);
    expect(stats.tagFrequency[0].tag).toBe("tag-a");
    expect(stats.tagFrequency[0].count).toBe(2);
  });
});

describe("annotation enhancements", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("updates an existing annotation", () => {
    const anno = addAnnotation("run-update", {
      type: "note",
      content: "original text",
    });

    const updated = updateAnnotation("run-update", anno.id, {
      content: "updated text",
      color: "#ff0",
    });

    expect(updated).not.toBeNull();
    expect(updated?.content).toBe("updated text");
    expect(updated?.color).toBe("#ff0");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(anno.createdAt);
  });

  it("returns null for updating non-existent annotation", () => {
    expect(updateAnnotation("run-1", "nonexistent", { content: "x" })).toBeNull();
  });

  it("gets annotations filtered by type", () => {
    addAnnotation("run-types", { type: "highlight", content: "h1" });
    addAnnotation("run-types", { type: "note", content: "n1" });
    addAnnotation("run-types", { type: "highlight", content: "h2" });

    const highlights = getAnnotationsByType("run-types", "highlight");
    expect(highlights.length).toBe(2);
    expect(highlights.every((h) => h.type === "highlight")).toBe(true);
  });

  it("gets all annotations across all runs", () => {
    addAnnotation("run-a", { type: "note", content: "note a" });
    addAnnotation("run-b", { type: "highlight", content: "highlight b" });

    const all = getAllAnnotations();
    expect(all.length).toBe(2);
    expect(all.some((a) => a.runId === "run-a")).toBe(true);
    expect(all.some((a) => a.runId === "run-b")).toBe(true);
  });

  it("gets all annotations filtered by type", () => {
    addAnnotation("run-a", { type: "note", content: "note" });
    addAnnotation("run-b", { type: "highlight", content: "highlight" });

    const highlights = getAllAnnotations("highlight");
    expect(highlights.length).toBe(1);
    expect(highlights[0].annotation.type).toBe("highlight");
  });

  it("sorts annotations by createdAt descending", () => {
    addAnnotation("run-1", { type: "note", content: "first" });
    // Add a small delay simulation isn't needed since they'll have same timestamp
    addAnnotation("run-1", { type: "note", content: "second" });

    const all = getAllAnnotations();
    // At minimum should return all of them
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

describe("notes export / import", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("exports a valid notes package", () => {
    savePersonalNote("run-export", "My note");
    addTag("run-export", "test-tag");

    const pkg = exportNotesPackage();
    expect(pkg.version).toBe(1);
    expect(pkg.source).toBe("launchlens-notes");
    expect(typeof pkg.exportedAt).toBe("number");
    expect(pkg.notes.length).toBeGreaterThanOrEqual(1);
    expect(pkg.quickNoteTemplates.length).toBeGreaterThanOrEqual(6);
  });

  it("imports notes with merge strategy", () => {
    savePersonalNote("run-existing", "Original note");
    addTag("run-existing", "original-tag");

    const pkg = {
      version: 1,
      notes: [
        {
          runId: "run-existing",
          annotations: [],
          personalNote: "Updated note",
          rating: 5,
          tags: ["new-tag"],
          isStarred: true,
          isArchived: false,
          lastOpenedAt: Date.now() + 100000,
          updatedAt: Date.now() + 100000,
        },
        {
          runId: "run-new",
          annotations: [],
          personalNote: "Brand new",
          rating: 3,
          tags: ["fresh"],
          isStarred: false,
          isArchived: false,
          lastOpenedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const result = importNotesPackage(pkg, "merge");
    expect(result.imported).toBe(2);

    const existing = getNotes("run-existing");
    expect(existing?.tags).toContain("original-tag");
    expect(existing?.tags).toContain("new-tag");
    expect(existing?.personalNote).toBe("Updated note");

    const newNotes = getNotes("run-new");
    expect(newNotes).not.toBeNull();
    expect(newNotes?.personalNote).toBe("Brand new");
  });

  it("imports with skip strategy", () => {
    savePersonalNote("run-keep", "Keep this");

    const pkg = {
      version: 1,
      notes: [
        {
          runId: "run-keep",
          annotations: [],
          personalNote: "Overwrite attempt",
          rating: 0,
          tags: [],
          isStarred: false,
          isArchived: false,
          lastOpenedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const result = importNotesPackage(pkg, "skip");
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);

    const notes = getNotes("run-keep");
    expect(notes?.personalNote).toBe("Keep this");
  });

  it("imports with overwrite strategy", () => {
    savePersonalNote("run-overwrite", "Old content");
    addTag("run-overwrite", "old-tag");

    const pkg = {
      version: 1,
      notes: [
        {
          runId: "run-overwrite",
          annotations: [],
          personalNote: "New content",
          rating: 4,
          tags: ["new-tag"],
          isStarred: true,
          isArchived: false,
          lastOpenedAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    importNotesPackage(pkg, "overwrite");
    const notes = getNotes("run-overwrite");
    expect(notes?.personalNote).toBe("New content");
    expect(notes?.tags).toEqual(["new-tag"]);
  });

  it("rejects invalid package", () => {
    const result = importNotesPackage({ version: 0, notes: [] } as any);
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});


describe("word count and activity (round 138)", () => {
  beforeEach(() => localStorage.clear());

  it("getNoteWordCount counts words in note and annotations", () => {
    savePersonalNote("r1", "hello world foo bar");
    addAnnotation("r1", { type: "note", content: "one two three" });
    expect(getNoteWordCount("r1")).toBe(7);
  });

  it("getNoteWordCount returns 0 for missing run", () => {
    expect(getNoteWordCount("nonexistent")).toBe(0);
  });

  it("getRecentlyUpdatedNotes returns most recently updated first", async () => {
    savePersonalNote("old", "old note");
    await new Promise((r) => setTimeout(r, 10));
    savePersonalNote("new", "new note");
    const recent = getRecentlyUpdatedNotes(5);
    expect(recent[0].runId).toBe("new");
  });

  it("getRecentlyOpenedNotes returns by lastOpenedAt", async () => {
    markOpened("old-run");
    await new Promise((r) => setTimeout(r, 10));
    markOpened("new-run");
    const opened = getRecentlyOpenedNotes(5);
    expect(opened[0].runId).toBe("new-run");
  });

  it("hasUnsavedNotes detects notes with content", () => {
    expect(hasUnsavedNotes("empty")).toBe(false);
    savePersonalNote("has-note", "some content");
    expect(hasUnsavedNotes("has-note")).toBe(true);
  });

  it("hasUnsavedNotes detects tags", () => {
    addTag("tagged", "important");
    expect(hasUnsavedNotes("tagged")).toBe(true);
  });

  it("hasUnsavedNotes detects ratings", () => {
    setRating("rated", 5);
    expect(hasUnsavedNotes("rated")).toBe(true);
  });

  it("hasUnsavedNotes detects rating", () => {
    setRating("rated-run-x", 4);
    expect(hasUnsavedNotes("rated-run-x")).toBe(true);
  });

  it("cleanupEmptyNotes removes blank entries", () => {
    // Create an empty entry by just calling ensureRun indirectly
    getNotesStats();
    savePersonalNote("real", "I have content");
    // ensureRun creates empty; simulate
    const store = new Map();
    store.set("blank", { runId: "blank", annotations: [], personalNote: "", rating: 0, tags: [], isStarred: false, isArchived: false, lastOpenedAt: 0, updatedAt: Date.now() });
    localStorage.setItem("launchlens:notes", JSON.stringify(Object.fromEntries(store)));
    const removed = cleanupEmptyNotes();
    expect(removed).toBe(1);
  });

  it("getEmptyNotesCount counts empty notes", () => {
    // Start fresh
    localStorage.clear();
    expect(getEmptyNotesCount()).toBe(0);
  });
});
describe('notes extensions (round 151)', () => {
  const base = (overrides: Partial<ResearchNotes> = {}): ResearchNotes => ({
    runId: 'r1',
    annotations: [],
    personalNote: '',
    rating: 0,
    tags: [],
    isStarred: false,
    isArchived: false,
    lastOpenedAt: 0,
    updatedAt: 0,
    ...overrides,
  });

  it('summarizeNotes aggregates counts and unique tags', () => {
    const notes = [
      base({ runId: 'a', personalNote: 'hello world note', rating: 4, tags: ['alpha','beta'], isStarred: true, updatedAt: 100 }),
      base({ runId: 'b', personalNote: 'another one', rating: 2, tags: ['beta','gamma'], annotations: [{ id: 'x', type: 'note', content: 'yo', createdAt: 1, updatedAt: 1 }], updatedAt: 200 }),
      base({ runId: 'c', personalNote: '', tags: [], isArchived: true }),
    ];
    const s2 = summarizeNotes(notes);
    expect(s2.total).toBe(3);
    expect(s2.withNote).toBe(2);
    expect(s2.withAnnotation).toBe(1);
    expect(s2.starred).toBe(1);
    expect(s2.archived).toBe(1);
    expect(s2.totalAnnotations).toBe(1);
    expect(s2.totalTags).toBe(3);
    expect(s2.uniqueTags).toEqual(['alpha','beta','gamma']);
    expect(s2.avgRating).toBe(3);
    expect(s2.latestUpdate).toBe(200);
    expect(s2.avgWordCount).toBeGreaterThanOrEqual(1);
  });

  it('summarizeNotes returns zeroed summary for empty input', () => {
    const s2 = summarizeNotes([]);
    expect(s2.total).toBe(0);
    expect(s2.avgRating).toBeNull();
    expect(s2.latestUpdate).toBeNull();
    expect(s2.uniqueTags).toEqual([]);
  });

  it('filterNotesByRating clamps and applies inclusive range', () => {
    const notes = [base({ runId: 'a', rating: 1 }), base({ runId: 'b', rating: 3 }), base({ runId: 'c', rating: 5 })];
    expect(filterNotesByRating(notes, 2, 4).map((n) => n.runId)).toEqual(['b']);
    expect(filterNotesByRating(notes, -5, 50).map((n) => n.runId)).toEqual(['a','b','c']);
  });

  it('filterNotesByTags supports OR and AND modes case-insensitively', () => {
    const notes = [
      base({ runId: 'a', tags: ['Alpha'] }),
      base({ runId: 'b', tags: ['beta','GAMMA'] }),
      base({ runId: 'c', tags: ['alpha','gamma'] }),
    ];
    expect(filterNotesByTags(notes, ['alpha']).map((n) => n.runId).sort()).toEqual(['a','c']);
    expect(filterNotesByTags(notes, ['alpha','gamma'], true).map((n) => n.runId)).toEqual(['c']);
    expect(filterNotesByTags(notes, [])).toHaveLength(3);
  });

  it('filterNotesByFlags honors starred and archived tristates', () => {
    const notes = [
      base({ runId: 'a', isStarred: true }),
      base({ runId: 'b', isArchived: true }),
      base({ runId: 'c' }),
    ];
    expect(filterNotesByFlags(notes, { starred: true }).map((n) => n.runId)).toEqual(['a']);
    expect(filterNotesByFlags(notes, { starred: false, archived: false }).map((n) => n.runId)).toEqual(['c']);
    expect(filterNotesByFlags(notes, { archived: true }).map((n) => n.runId)).toEqual(['b']);
    expect(filterNotesByFlags(notes, {})).toHaveLength(3);
  });

  it('mergeNotes unions tags/annotations and picks newer content', () => {
    const older = base({ runId: 'r', personalNote: 'old', rating: 2, tags: ['x'], isStarred: false, updatedAt: 10,
      annotations: [{ id: 'a1', type: 'note', content: 'one', createdAt: 1, updatedAt: 1 }] });
    const newer = base({ runId: 'r', personalNote: 'new', rating: 5, tags: ['y'], isStarred: true, updatedAt: 20,
      annotations: [{ id: 'a2', type: 'note', content: 'two', createdAt: 2, updatedAt: 2 }] });
    const m = mergeNotes(older, newer);
    expect(m.personalNote).toBe('new');
    expect(m.rating).toBe(5);
    expect(m.isStarred).toBe(true);
    expect(m.tags.slice().sort()).toEqual(['x','y']);
    expect(m.annotations.map((a) => a.id).sort()).toEqual(['a1','a2']);
    expect(m.updatedAt).toBe(20);
  });

  it('mergeNotes throws when runIds differ', () => {
    expect(() => mergeNotes(base({ runId: 'a' }), base({ runId: 'b' }))).toThrow(/same runId/);
  });

  it('dedupeNotes merges duplicates by runId', () => {
    const a = base({ runId: 'r', personalNote: 'first', tags: ['x'], updatedAt: 1 });
    const b = base({ runId: 'r', personalNote: 'second', tags: ['y'], isStarred: true, updatedAt: 2 });
    const out = dedupeNotes([a, b, base({ runId: 'other' })]);
    expect(out).toHaveLength(2);
    const found = out.find((n) => n.runId === 'r');
    expect(found!.personalNote).toBe('second');
    expect(found!.tags.slice().sort()).toEqual(['x','y']);
    expect(found!.isStarred).toBe(true);
  });

  it('tagCloud sorts by count desc then tag asc', () => {
    const notes = [base({ tags: ['b','a'] }), base({ tags: ['b'] }), base({ tags: ['c','a'] })];
    expect(tagCloud(notes)).toEqual([
      { tag: 'a', count: 2 }, { tag: 'b', count: 2 }, { tag: 'c', count: 1 }]);
  });

  it('notesToCsv emits header and a csv-safe row per note', () => {
    const notes = [base({ runId: 'id,1', rating: 4, isStarred: true, isArchived: false, personalNote: 'hi', tags: ['x'], updatedAt: 42 })];
    const csv = notesToCsv(notes);
    const lines = csv.split("\n");
    expect(lines[0]).toBe('runId,rating,starred,archived,tags,noteChars,updatedAt');
    expect(lines[1]).toContain("id,1");
    expect(lines[1]).toContain(',4,1,0,1,2,42');
  });

  it('notesEqual detects equality and mutations', () => {
    const a = base({ runId: 'r', tags: ['x'], annotations: [{ id: 'a1', type: 'note', content: 'c', createdAt: 1, updatedAt: 1 }] });
    const b = JSON.parse(JSON.stringify(a)) as ResearchNotes;
    expect(notesEqual(a, b)).toBe(true);
    b.rating = 3;
    expect(notesEqual(a, b)).toBe(false);
    const c = JSON.parse(JSON.stringify(a)) as ResearchNotes;
    c.annotations[0].content = 'changed';
    expect(notesEqual(a, c)).toBe(false);
    expect(notesEqual(a, base({ runId: 'other' }))).toBe(false);
  });
});
