/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getAllTags,
  createTag,
  getOrCreateTag,
  deleteTag,
  bulkDeleteTags,
  renameTag,
  setTagColor,
  validateTagColor,
  mergeTags,
  searchTags,
  getRunTags,
  addTagToRun,
  removeTagFromRun,
  bulkAddTags,
  bulkRemoveTags,
  getRunsWithTag,
  getTagDetails,
  getTagUsageCount,
  getPopularTags,
  getTagStats,
  getTagColorPalette,
  countTotalTags,
} from "./tags";

describe("tags system (round 129)", () => {
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

    it("renameTag returns null on name collision", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const tag1 = createTag("Alpha");
      const tag2 = createTag("Beta");
      const result = renameTag(tag2.id, "alpha");
      expect(result).toBeNull();
      // tag2 should keep its old name
      const all = getAllTags();
      expect(all.find((t) => t.id === tag2.id)?.name).toBe("Beta");
    });
  });

  describe("getOrCreateTag", () => {
    it("creates a new tag when name doesn't exist", () => {
      const tag = getOrCreateTag("New Tag");
      expect(tag.name).toBe("New Tag");
      expect(getAllTags()).toHaveLength(1);
    });

    it("returns existing tag when name exists (case-insensitive)", () => {
      const tag1 = createTag("Hello");
      const tag2 = getOrCreateTag("hello");
      expect(tag1.id).toBe(tag2.id);
      expect(getAllTags()).toHaveLength(1);
    });
  });

  describe("bulkDeleteTags", () => {
    it("deletes multiple tags at once", () => {
      const t1 = createTag("a");
      const t2 = createTag("b");
      const t3 = createTag("c");
      expect(getAllTags()).toHaveLength(3);

      const count = bulkDeleteTags([t1.id, t2.id]);
      expect(count).toBe(2);
      const remaining = getAllTags();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(t3.id);
    });

    it("also removes deleted tags from all runs", () => {
      const t1 = createTag("x");
      const t2 = createTag("y");
      addTagToRun("r1", t1.id);
      addTagToRun("r1", t2.id);
      addTagToRun("r2", t1.id);

      bulkDeleteTags([t1.id]);
      expect(getRunTags("r1")).toEqual([t2.id]);
      expect(getRunTags("r2")).toEqual([]);
    });

    it("returns 0 for empty input", () => {
      expect(bulkDeleteTags([])).toBe(0);
    });
  });

  describe("tag colors", () => {
    it("validates hex colors correctly", () => {
      expect(validateTagColor("#fff")).toBe(true);
      expect(validateTagColor("#ffffff")).toBe(true);
      expect(validateTagColor("#123abc")).toBe(true);
      expect(validateTagColor("#ABC")).toBe(true);
      expect(validateTagColor("#ggg")).toBe(false);
      expect(validateTagColor("red")).toBe(false);
      expect(validateTagColor("")).toBe(false);
      expect(validateTagColor(null as any)).toBe(false);
    });

    it("validates palette colors", () => {
      const palette = getTagColorPalette();
      expect(palette.length).toBeGreaterThan(10);
      expect(validateTagColor(palette[0])).toBe(true);
    });

    it("setTagColor updates tag color", () => {
      const tag = createTag("colorful");
      const updated = setTagColor(tag.id, "#ff0000");
      expect(updated?.color).toBe("#ff0000");
      const all = getAllTags();
      expect(all[0].color).toBe("#ff0000");
    });

    it("setTagColor rejects invalid colors", () => {
      const tag = createTag("boring");
      const result = setTagColor(tag.id, "not-a-color");
      expect(result).toBeNull();
      // original color preserved
      expect(getAllTags()[0].color).toBeTruthy();
    });

    it("setTagColor returns null for non-existent tag", () => {
      expect(setTagColor("nope", "#fff")).toBeNull();
    });

    it("getTagColorPalette returns copy of palette", () => {
      const palette = getTagColorPalette();
      const palette2 = getTagColorPalette();
      expect(palette).toEqual(palette2);
      palette.push("#000000");
      expect(getTagColorPalette()).not.toContain("#000000");
    });
  });

  describe("mergeTags", () => {
    it("merges two tags into one target", () => {
      const source = createTag("Old Tag");
      const target = createTag("New Tag");
      addTagToRun("run-a", source.id);
      addTagToRun("run-b", source.id);
      addTagToRun("run-c", target.id);

      const result = mergeTags([source.id], target.id);
      expect(result?.id).toBe(target.id);

      // source tag should be gone
      expect(getAllTags().map((t) => t.id)).not.toContain(source.id);

      // run-a and run-b should now have target tag
      expect(getRunTags("run-a")).toEqual([target.id]);
      expect(getRunTags("run-b")).toEqual([target.id]);
      // run-c still has target (not duplicated)
      expect(getRunTags("run-c")).toEqual([target.id]);
    });

    it("handles merge when target already present on a run", () => {
      const s1 = createTag("S1");
      const s2 = createTag("S2");
      const target = createTag("Target");

      addTagToRun("r1", s1.id);
      addTagToRun("r1", target.id); // r1 already has target
      addTagToRun("r2", s2.id);

      const result = mergeTags([s1.id, s2.id], target.id);
      expect(result).not.toBeNull();

      expect(getRunTags("r1")).toEqual([target.id]); // no duplicate
      expect(getRunTags("r2")).toContain(target.id);
      expect(getAllTags()).toHaveLength(1);
    });

    it("returns null if target doesn't exist", () => {
      const source = createTag("S");
      expect(mergeTags([source.id], "nonexistent")).toBeNull();
      // source tag preserved
      expect(getAllTags()).toHaveLength(1);
    });

    it("returns target if no sources provided", () => {
      const target = createTag("T");
      const result = mergeTags([], target.id);
      expect(result?.id).toBe(target.id);
    });

    it("ignores target id in source list", () => {
      const target = createTag("T");
      const result = mergeTags([target.id, target.id], target.id);
      expect(result?.id).toBe(target.id);
      expect(getAllTags()).toHaveLength(1);
    });
  });

  describe("searchTags", () => {
    beforeEach(() => {
      createTag("Market Analysis");
      createTag("Product Marketing");
      createTag("AI Research");
      createTag("Product Design");
      createTag("Competitor Analysis");
    });

    it("finds tags by substring", () => {
      const results = searchTags("product");
      expect(results.length).toBe(2);
      expect(results.map((t) => t.name)).toContain("Product Marketing");
      expect(results.map((t) => t.name)).toContain("Product Design");
    });

    it("returns empty array for empty query", () => {
      expect(searchTags("")).toEqual([]);
      expect(searchTags("  ")).toEqual([]);
    });

    it("is case-insensitive", () => {
      const results = searchTags("ANALYSIS");
      expect(results.length).toBe(2);
    });

    it("sorts prefix matches before substring matches", () => {
      const results = searchTags("a");
      const names = results.map((t) => t.name);
      // "AI Research" starts with "a" -> should be first
      expect(names[0]).toBe("AI Research");
    });

    it("returns empty for no matches", () => {
      expect(searchTags("xyzzy")).toEqual([]);
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

  describe("getPopularTags", () => {
    it("returns tags sorted by usage count (descending)", () => {
      const t1 = createTag("Most");
      const t2 = createTag("Middle");
      const t3 = createTag("Least");

      addTagToRun("r1", t1.id);
      addTagToRun("r2", t1.id);
      addTagToRun("r3", t1.id);
      addTagToRun("r4", t2.id);
      addTagToRun("r5", t2.id);
      addTagToRun("r6", t3.id);

      const popular = getPopularTags(10);
      expect(popular).toHaveLength(3);
      expect(popular[0].name).toBe("Most");
      expect(popular[0].usageCount).toBe(3);
      expect(popular[1].name).toBe("Middle");
      expect(popular[1].usageCount).toBe(2);
      expect(popular[2].name).toBe("Least");
      expect(popular[2].usageCount).toBe(1);
    });

    it("excludes tags with zero usage", () => {
      createTag("unused");
      expect(getPopularTags()).toEqual([]);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        const t = createTag("tag-" + i);
        addTagToRun("run-" + i, t.id);
      }
      const popular = getPopularTags(2);
      expect(popular).toHaveLength(2);
    });
  });

  describe("getTagStats", () => {
    it("returns correct stats for populated tags", () => {
      const t1 = createTag("Popular");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const t2 = createTag("Unused");
      const t3 = createTag("Middling");

      addTagToRun("r1", t1.id);
      addTagToRun("r2", t1.id);
      addTagToRun("r3", t1.id);
      addTagToRun("r4", t1.id);
      addTagToRun("r1", t3.id);
      addTagToRun("r2", t3.id);

      const stats = getTagStats();
      expect(stats.totalTags).toBe(3);
      expect(stats.totalTaggedRuns).toBe(4); // r1, r2, r3, r4
      expect(stats.tagsWithUsage).toBe(2);
      expect(stats.tagsWithoutUsage).toBe(1);
      expect(stats.avgTagsPerRun).toBe(6 / 4); // 6 associations / 4 runs
      expect(stats.mostUsedTag?.name).toBe("Popular");
      expect(stats.mostUsedTag?.usageCount).toBe(4);
      expect(stats.leastUsedTag?.name).toBe("Middling");
      expect(stats.leastUsedTag?.usageCount).toBe(2);
    });

    it("returns zero stats when no tags exist", () => {
      const stats = getTagStats();
      expect(stats.totalTags).toBe(0);
      expect(stats.totalTaggedRuns).toBe(0);
      expect(stats.tagsWithUsage).toBe(0);
      expect(stats.tagsWithoutUsage).toBe(0);
      expect(stats.avgTagsPerRun).toBe(0);
      expect(stats.mostUsedTag).toBeNull();
      expect(stats.leastUsedTag).toBeNull();
    });
  });

  describe("corrupted localStorage payloads (round validation)", () => {
    it("getAllTags drops invalid entries but keeps the valid ones", () => {
      const valid = createTag("valid-tag");
      const payload = [
        valid,
        { id: "no-name", createdAt: 1 },
        { id: "bad-createdAt", name: "x", createdAt: "not-a-number" },
        { id: "bad-color", name: "x", createdAt: 1, color: 42 },
        "not-an-object",
      ];
      localStorage.setItem("research_tags", JSON.stringify(payload));
      // Re-read via a fresh getAllTags() call.
      const tags = getAllTags();
      expect(tags.map((t) => t.id)).toEqual([valid.id]);
    });

    it("getRunTags returns [] when the run-tags payload is corrupted", () => {
      createTag("a");
      localStorage.setItem("research_run_tags", JSON.stringify({
        "run-1": ["valid-id"],
        "run-2": "not-an-array",
        "run-3": [1, 2, 3],
        "run-4": null,
      }));
      expect(getRunTags("run-1")).toEqual(["valid-id"]);
      expect(getRunTags("run-2")).toEqual([]);
      expect(getRunTags("run-3")).toEqual([]);
      expect(getRunTags("run-4")).toEqual([]);
    });
  });
});
