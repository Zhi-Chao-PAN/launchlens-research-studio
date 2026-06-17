/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAllTags,
  createTag,
  deleteTag,
  renameTag,
  getRunTags,
  addTagToRun,
  removeTagFromRun,
  bulkAddTags,
  bulkRemoveTags,
  getRunsWithTag,
  getTagDetails,
  getTagUsageCount,
  countTotalTags,
} from "./tags";

describe("tags system", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("tag management", () => {
    it("starts with no tags", () => {
      expect(getAllTags()).toEqual([]);
      expect(countTotalTags()).toBe(0);
    });

    it("creates a new tag", () => {
      const tag = createTag("AI Research");
      expect(tag.name).toBe("AI Research");
      expect(tag.id).toMatch(/^tag_/);
      expect(tag.color).toBeTruthy();
      expect(tag.createdAt).toBeGreaterThan(0);
      expect(getAllTags()).toHaveLength(1);
      expect(countTotalTags()).toBe(1);
    });

    it("does not create duplicate tags (case-insensitive)", () => {
      const tag1 = createTag("Market");
      const tag2 = createTag("market");
      expect(tag1.id).toBe(tag2.id);
      expect(getAllTags()).toHaveLength(1);
    });

    it("trims tag names", () => {
      const tag = createTag("  Startup  ");
      expect(tag.name).toBe("Startup");
    });

    it("deletes a tag", () => {
      const tag = createTag("to-delete");
      expect(getAllTags()).toHaveLength(1);
      deleteTag(tag.id);
      expect(getAllTags()).toHaveLength(0);
    });

    it("deleting a tag also removes it from all runs", () => {
      const tag = createTag("shared");
      addTagToRun("run-1", tag.id);
      addTagToRun("run-2", tag.id);
      expect(getRunTags("run-1")).toContain(tag.id);
      expect(getRunTags("run-2")).toContain(tag.id);

      deleteTag(tag.id);
      expect(getRunTags("run-1")).toEqual([]);
      expect(getRunTags("run-2")).toEqual([]);
    });

    it("renames a tag", () => {
      const tag = createTag("old name");
      const renamed = renameTag(tag.id, "new name");
      expect(renamed?.name).toBe("new name");
      expect(getAllTags()[0].name).toBe("new name");
    });

    it("renameTag returns null for non-existent tag", () => {
      expect(renameTag("nonexistent", "new")).toBeNull();
    });
  });

  describe("run-tag associations", () => {
    it("adds a tag to a run", () => {
      const tag = createTag("important");
      addTagToRun("run-42", tag.id);
      expect(getRunTags("run-42")).toEqual([tag.id]);
    });

    it("does not duplicate tags on a run", () => {
      const tag = createTag("important");
      addTagToRun("run-1", tag.id);
      addTagToRun("run-1", tag.id);
      expect(getRunTags("run-1")).toHaveLength(1);
    });

    it("removes a tag from a run", () => {
      const tag = createTag("temp");
      addTagToRun("run-1", tag.id);
      expect(getRunTags("run-1")).toHaveLength(1);
      removeTagFromRun("run-1", tag.id);
      expect(getRunTags("run-1")).toEqual([]);
    });

    it("getRunTags returns empty array for untagged run", () => {
      expect(getRunTags("never-seen")).toEqual([]);
    });

    it("finds all runs with a tag", () => {
      const tag = createTag("featured");
      addTagToRun("run-a", tag.id);
      addTagToRun("run-b", tag.id);
      addTagToRun("run-c", tag.id);

      const runs = getRunsWithTag(tag.id);
      expect(runs).toHaveLength(3);
      expect(runs).toContain("run-a");
      expect(runs).toContain("run-b");
      expect(runs).toContain("run-c");
    });

    it("getRunsWithTag returns empty array for unused tag", () => {
      const tag = createTag("unused");
      expect(getRunsWithTag(tag.id)).toEqual([]);
    });
  });

  describe("bulk operations", () => {
    it("bulkAddTags adds multiple tags to multiple runs", () => {
      const tag1 = createTag("t1");
      const tag2 = createTag("t2");

      bulkAddTags(["run-1", "run-2", "run-3"], [tag1.id, tag2.id]);

      expect(getRunTags("run-1")).toContain(tag1.id);
      expect(getRunTags("run-1")).toContain(tag2.id);
      expect(getRunTags("run-2")).toContain(tag1.id);
      expect(getRunTags("run-3")).toContain(tag2.id);
    });

    it("bulkRemoveTags removes multiple tags from multiple runs", () => {
      const tag1 = createTag("t1");
      const tag2 = createTag("t2");
      const tag3 = createTag("t3");

      bulkAddTags(["run-1", "run-2"], [tag1.id, tag2.id, tag3.id]);
      bulkRemoveTags(["run-1", "run-2"], [tag1.id, tag2.id]);

      expect(getRunTags("run-1")).toEqual([tag3.id]);
      expect(getRunTags("run-2")).toEqual([tag3.id]);
    });
  });

  describe("tag details and stats", () => {
    it("getTagDetails returns tag info for IDs", () => {
      const tag1 = createTag("Alpha");
      const tag2 = createTag("Beta");
      const details = getTagDetails([tag1.id, tag2.id, "unknown"]);
      expect(details).toHaveLength(2);
      expect(details[0].name).toBe("Alpha");
      expect(details[1].name).toBe("Beta");
    });

    it("getTagUsageCount counts run usage", () => {
      const tag = createTag("popular");
      expect(getTagUsageCount(tag.id)).toBe(0);

      addTagToRun("a", tag.id);
      addTagToRun("b", tag.id);
      addTagToRun("c", tag.id);

      expect(getTagUsageCount(tag.id)).toBe(3);
    });
  });
});
