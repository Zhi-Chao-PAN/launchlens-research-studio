import { describe, it, expect } from "vitest";
import {
  subsequenceMatch,
  wordStartMatch,
  scoreCommand,
  rankCommands,
  getMatchRanges,
} from "./fuzzy-search";

describe("fuzzy-search", () => {
  describe("subsequenceMatch", () => {
    it("returns indices for matching characters", () => {
      const result = subsequenceMatch("hello world", "hlo");
      expect(result).not.toBeNull();
      expect(result?.indices).toEqual([0, 2, 4]);
    });

    it("returns null when no match", () => {
      const result = subsequenceMatch("hello", "xyz");
      expect(result).toBeNull();
    });

    it("handles empty query", () => {
      const result = subsequenceMatch("hello", "");
      expect(result?.indices).toEqual([]);
    });

    it("scores compact matches higher", () => {
      const compact = subsequenceMatch("hello", "he")!;
      const spread = subsequenceMatch("hheelloo", "he")!;
      expect(compact.score).toBeGreaterThan(spread.score);
    });
  });

  describe("wordStartMatch", () => {
    it("matches at word boundaries", () => {
      expect(wordStartMatch("Hello World", "hw")).toBe(true);
      expect(wordStartMatch("HelloWorld", "hw")).toBe(true);
      expect(wordStartMatch("hello-world", "hw")).toBe(true);
      expect(wordStartMatch("hello_world", "hw")).toBe(true);
    });

    it("matches full word start", () => {
      expect(wordStartMatch("Export Markdown", "export")).toBe(true);
    });

    it("does not match mid-word", () => {
      expect(wordStartMatch("hello", "ell")).toBe(false);
      expect(wordStartMatch("CommandPalette", "mp")).toBe(false);
    });
  });

  describe("scoreCommand", () => {
    const cmd = {
      id: "test",
      label: "Export Markdown",
      description: "Export research as markdown file",
      keywords: ["export", "download", "markdown"],
      category: "action",
    };

    it("gives highest score to exact match", () => {
      const exactScore = scoreCommand(cmd, "export markdown");
      const subScore = scoreCommand(cmd, "export m");
      expect(exactScore).toBeGreaterThan(subScore);
    });

    it("gives prefix match higher than substring", () => {
      const prefixScore = scoreCommand(cmd, "export");
      const subStringScore = scoreCommand(cmd, "markdown");
      // Both are word starts, but "export" is at beginning of label
      expect(prefixScore).toBeGreaterThanOrEqual(subStringScore);
    });

    it("scores 0 for non-matching queries", () => {
      expect(scoreCommand(cmd, "xyz123")).toBe(0);
    });

    it("boosts score with history", () => {
      const history = { id: "test", count: 10, lastUsed: Date.now() };
      const withHistory = scoreCommand(cmd, "export", history);
      const withoutHistory = scoreCommand(cmd, "export");
      expect(withHistory).toBeGreaterThan(withoutHistory);
    });

    it("has base score for empty query", () => {
      const score = scoreCommand(cmd, "");
      expect(score).toBeGreaterThan(0);
    });

    it("gives higher empty-query score to frequently used commands", () => {
      const freqHigh = scoreCommand(cmd, "", { id: "test", count: 20, lastUsed: Date.now() });
      const freqLow = scoreCommand(cmd, "", { id: "test", count: 1, lastUsed: Date.now() });
      expect(freqHigh).toBeGreaterThan(freqLow);
    });
  });

  describe("rankCommands", () => {
    const commands = [
      { id: "1", label: "Export Markdown", keywords: ["export"] },
      { id: "2", label: "Export JSON", keywords: ["export"] },
      { id: "3", label: "New Research", keywords: ["new"] },
      { id: "4", label: "Settings", keywords: ["settings"] },
    ];

    it("ranks relevant commands first", () => {
      const ranked = rankCommands(commands, "export");
      expect(ranked.length).toBe(2);
      expect(ranked[0].label).toContain("Export");
      expect(ranked[1].label).toContain("Export");
    });

    it("returns all commands for empty query", () => {
      const ranked = rankCommands(commands, "");
      expect(ranked.length).toBe(commands.length);
    });

    it("sorts by score descending", () => {
      const ranked = rankCommands(commands, "new");
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    });

    it("filters out non-matching commands", () => {
      const ranked = rankCommands(commands, "zzzz");
      expect(ranked.length).toBe(0);
    });
  });

  describe("getMatchRanges", () => {
    it("returns empty ranges for empty query", () => {
      expect(getMatchRanges("hello world", "")).toEqual([]);
      expect(getMatchRanges("hello world", "   ")).toEqual([]);
    });

    it("returns empty ranges for no match", () => {
      expect(getMatchRanges("hello world", "xyz")).toEqual([]);
    });

    it("matches prefix", () => {
      expect(getMatchRanges("Export Markdown", "export")).toEqual([
        { start: 0, end: 6 },
      ]);
    });

    it("matches substring", () => {
      expect(getMatchRanges("Export Markdown", "mark")).toEqual([
        { start: 7, end: 11 },
      ]);
    });

    it("matches initialism and returns per-char ranges", () => {
      const ranges = getMatchRanges("Command Palette", "cp");
      expect(ranges.length).toBe(2);
      expect(ranges[0]).toEqual({ start: 0, end: 1 });
      expect(ranges[1]).toEqual({ start: 8, end: 9 });
    });

    it("falls back to subsequence match", () => {
      const ranges = getMatchRanges("hello world", "hlo");
      expect(ranges.length).toBeGreaterThan(0);
      // h at 0, l at 2, o at 4 -- three separate ranges
      expect(ranges).toContainEqual({ start: 0, end: 1 });
      expect(ranges).toContainEqual({ start: 2, end: 3 });
      expect(ranges).toContainEqual({ start: 4, end: 5 });
    });

    it("is case-insensitive", () => {
      expect(getMatchRanges("Hello World", "hello")).toEqual([
        { start: 0, end: 5 },
      ]);
      expect(getMatchRanges("HELLO WORLD", "hello")).toEqual([
        { start: 0, end: 5 },
      ]);
    });

    it("ranges are valid (start < end, within bounds)", () => {
      const label = "Open Recent Research File";
      const ranges = getMatchRanges(label, "orf");
      for (const r of ranges) {
        expect(r.start).toBeGreaterThanOrEqual(0);
        expect(r.end).toBeLessThanOrEqual(label.length);
        expect(r.start).toBeLessThan(r.end);
      }
    });

    it("matches camelCase initialism (consistent with wordStartMatch)", () => {
      // Regression: getMatchRanges used to skip camelCase boundaries
      // (e.g. "cf" on "CommandFooter" returned []), so highlighting
      // disagreed with scoreCommand's wordStartMatch logic.
      const ranges = getMatchRanges("CommandFooter", "cf");
      expect(ranges.length).toBe(2);
      expect(ranges[0]).toEqual({ start: 0, end: 1 });
      expect(ranges[1]).toEqual({ start: 7, end: 8 });
    });

    it("matches initialism across hyphen, underscore, and slash separators", () => {
      expect(getMatchRanges("Research-Find", "rf")).toEqual([
        { start: 0, end: 1 },
        { start: 9, end: 10 },
      ]);
      expect(getMatchRanges("Research_Find", "rf")).toEqual([
        { start: 0, end: 1 },
        { start: 9, end: 10 },
      ]);
      expect(getMatchRanges("Research/Find", "rf")).toEqual([
        { start: 0, end: 1 },
        { start: 9, end: 10 },
      ]);
    });
  });
});
