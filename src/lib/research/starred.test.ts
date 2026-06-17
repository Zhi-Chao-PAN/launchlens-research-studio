import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStarredRunIds, isRunStarred, starRun, unstarRun, toggleStar } from "./starred";

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
