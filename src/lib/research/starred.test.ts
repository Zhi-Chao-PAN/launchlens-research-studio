import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStarredRunIds,
  isRunStarred,
  starRun,
  unstarRun,
  toggleStar,
  setStarNote,
  getStarNote,
  setStarTags,
  getStarMetadata,
  getAllStarMetadata,
  addToCollection,
  getCollections,
  getStarredInCollection,
  removeFromCollection,
  starRunsBatch,
  unstarRunsBatch,
  clearAllStars,
  getStarStats,
  searchStarred,
} from "./starred";

// Mock localStorage for Node environment
const mockStorage = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => void mockStorage.set(key, value),
  removeItem: (key: string) => void mockStorage.delete(key),
  clear: () => void mockStorage.clear(),
  length: 0,
  key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
};

// Set up the global before each test
beforeEach(() => {
  mockStorage.clear();
  globalThis.localStorage = localStorageMock as unknown as Storage;
});

describe("starred runs", () => {
  it("returns empty array when nothing is starred", () => {
    expect(getStarredRunIds()).toEqual([]);
  });

  it("stars a run and returns it in the list", () => {
    starRun("run-1");
    expect(getStarredRunIds()).toEqual(["run-1"]);
  });

  it("starring the same run twice doesn't duplicate", () => {
    starRun("run-1");
    starRun("run-1");
    expect(getStarredRunIds()).toEqual(["run-1"]);
  });

  it("unstars a run", () => {
    starRun("run-1");
    starRun("run-2");
    unstarRun("run-1");
    expect(getStarredRunIds()).toEqual(["run-2"]);
  });

  it("isRunStarred returns correct boolean", () => {
    expect(isRunStarred("run-1")).toBe(false);
    starRun("run-1");
    expect(isRunStarred("run-1")).toBe(true);
  });

  it("toggleStar flips state and returns new state", () => {
    expect(toggleStar("run-1")).toBe(true);
    expect(toggleStar("run-1")).toBe(false);
    expect(toggleStar("run-1")).toBe(true);
  });

  it("preserves order: newest star first", () => {
    starRun("run-1");
    starRun("run-2");
    starRun("run-3");
    expect(getStarredRunIds()).toEqual(["run-3", "run-2", "run-1"]);
  });

  it("handles corrupt localStorage gracefully", () => {
    localStorageMock.setItem("ll:starred-runs", "{not valid json");
    expect(getStarredRunIds()).toEqual([]);
  });

  it("handles non-array localStorage value gracefully", () => {
    localStorageMock.setItem("ll:starred-runs", '"a-string"');
    expect(getStarredRunIds()).toEqual([]);
  });
});


describe("star metadata (round 134)", () => {
  beforeEach(() => {
    clearAllStars();
  });

  it("setStarNote and getStarNote store and retrieve notes", () => {
    starRun("r1");
    setStarNote("r1", "This is my favorite research");
    expect(getStarNote("r1")).toBe("This is my favorite research");
  });

  it("setStarNote does nothing for unstarred run", () => {
    setStarNote("missing", "note");
    expect(getStarNote("missing")).toBeUndefined();
  });

  it("setStarTags stores tags", () => {
    starRun("r1");
    setStarTags("r1", ["important", "ai"]);
    const meta = getStarMetadata("r1");
    expect(meta?.tags).toEqual(["important", "ai"]);
    expect(meta?.starredAt).toBeTruthy();
  });

  it("getStarMetadata returns undefined for unknown", () => {
    expect(getStarMetadata("nope")).toBeUndefined();
  });

  it("getAllStarMetadata returns all metadata", () => {
    starRun("r1");
    setStarNote("r1", "note1");
    starRun("r2");
    setStarTags("r2", ["x"]);
    const all = getAllStarMetadata();
    expect(Object.keys(all)).toHaveLength(2);
  });
});

describe("collections (round 134)", () => {
  beforeEach(() => clearAllStars());

  it("addToCollection assigns run to collection", () => {
    starRun("r1");
    addToCollection("r1", "AI Research");
    expect(getCollections()).toContain("AI Research");
  });

  it("getStarredInCollection returns only runs in that collection", () => {
    starRun("r1");
    starRun("r2");
    starRun("r3");
    addToCollection("r1", "A");
    addToCollection("r2", "A");
    addToCollection("r3", "B");
    expect(getStarredInCollection("A")).toEqual(expect.arrayContaining(["r1", "r2"]));
    expect(getStarredInCollection("B")).toContain("r3");
  });

  it("removeFromCollection detaches collection from run", () => {
    starRun("r1");
    addToCollection("r1", "A");
    removeFromCollection("r1");
    expect(getStarredInCollection("A")).not.toContain("r1");
  });

  it("getCollections returns sorted unique list", () => {
    starRun("r1"); addToCollection("r1", "B");
    starRun("r2"); addToCollection("r2", "A");
    starRun("r3"); addToCollection("r3", "A");
    const cols = getCollections();
    expect(cols).toEqual(["A", "B"]);
  });
});

describe("bulk operations (round 134)", () => {
  beforeEach(() => clearAllStars());

  it("starRunsBatch stars multiple runs at once", () => {
    starRun("existing");
    const result = starRunsBatch(["a", "b", "c", "existing"]);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("existing");
    expect(result).toHaveLength(4);
  });

  it("unstarRunsBatch removes multiple runs and their metadata", () => {
    starRun("a");
    setStarNote("a", "note a");
    starRun("b");
    setStarNote("b", "note b");
    starRun("c");
    const result = unstarRunsBatch(["a", "c"]);
    expect(result).toEqual(["b"]);
    expect(getStarNote("a")).toBeUndefined();
  });

  it("clearAllStars removes all stars and metadata", () => {
    starRun("a"); setStarNote("a", "x");
    starRun("b");
    clearAllStars();
    expect(getStarredRunIds()).toHaveLength(0);
    expect(getAllStarMetadata()).toEqual({});
  });
});

describe("star stats and search (round 134)", () => {
  beforeEach(() => clearAllStars());

  it("getStarStats counts everything correctly", () => {
    starRun("r1");
    setStarNote("r1", "important finding");
    setStarTags("r1", ["ai", "healthcare"]);
    starRun("r2");
    addToCollection("r2", "Blockchain");
    starRun("r3");
    addToCollection("r3", "Blockchain");
    const stats = getStarStats();
    expect(stats.totalStarred).toBe(3);
    expect(stats.withNotes).toBe(1);
    expect(stats.withTags).toBe(1);
    expect(stats.collections).toBe(1);
    expect(stats.collectionBreakdown[0].name).toBe("Blockchain");
    expect(stats.collectionBreakdown[0].count).toBe(2);
  });

  it("getStarStats returns zeros when empty", () => {
    const stats = getStarStats();
    expect(stats.totalStarred).toBe(0);
    expect(stats.withNotes).toBe(0);
    expect(stats.collections).toBe(0);
  });

  it("searchStarred matches by id, note, tag, or collection", () => {
    starRun("abc-123");
    setStarNote("abc-123", "my research note");
    starRun("def-456");
    setStarTags("def-456", ["important"]);
    starRun("ghi-789");
    addToCollection("ghi-789", "Blockchain");

    const ids = getStarredRunIds();
    expect(searchStarred(ids, "abc")).toContain("abc-123");
    expect(searchStarred(ids, "research")).toContain("abc-123");
    expect(searchStarred(ids, "important")).toContain("def-456");
    expect(searchStarred(ids, "Blockchain")).toContain("ghi-789");
  });

  it("searchStarred returns all when query is empty", () => {
    starRun("a"); starRun("b");
    expect(searchStarred(getStarredRunIds(), "")).toHaveLength(2);
  });
});

