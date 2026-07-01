import { describe, it, expect } from "vitest";

// Mock localStorage for tests
class MockStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  get length() { return this.data.size; }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
}

const storage = new MockStorage();
(globalThis as any).window = { localStorage: storage };
(globalThis as any).localStorage = storage;

import {
  formatRelativeTime,
  searchHistory,
  filterHistoryByKeyword,
  getHistoryStats,
  groupHistoryByDate,
  exportHistoryJson,
  deduplicateHistoryEntries,
  createHistoryEntry,
  getRecentQueries,
  historyToMarkdown,
  upsertHistoryEntry,
} from "@/lib/research/history";
import type { HistoryEntry } from "@/lib/research/history";

describe("formatRelativeTime", () => {
  it("returns 'just now' for very recent times", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("returns minutes for times within an hour", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatRelativeTime(fiveMinAgo);
    expect(result).toMatch(/^\d+m ago$/);
  });

  it("returns hours for times within a day", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(twoHoursAgo);
    expect(result).toMatch(/^\d+h ago$/);
  });

  it("returns days for times within a week", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(threeDaysAgo);
    expect(result).toMatch(/^\d+d ago$/);
  });

  it("returns locale date for older times", () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeTime(oldDate);
    // Should be a date string, not "X ago"
    expect(result).not.toMatch(/ago$/);
  });

  it("returns empty string for invalid input", () => {
    expect(formatRelativeTime("not a date")).toBe("");
  });

  it("localizes compact units in zh-CN", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, "zh-CN")).toBe("5 分钟前");
    expect(formatRelativeTime(twoHoursAgo, "zh-CN")).toBe("2 小时前");
    expect(formatRelativeTime(threeDaysAgo, "zh-CN")).toBe("3 天前");
  });

  it("localizes compact units in ja", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, "ja")).toBe("5分前");
    expect(formatRelativeTime(twoHoursAgo, "ja")).toBe("2時間前");
    expect(formatRelativeTime(threeDaysAgo, "ja")).toBe("3日前");
  });

  it("treats future timestamps as 'just now'", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatRelativeTime(future, "en")).toBe("just now");
  });
});


describe("history utilities (round 139)", () => {
  const makeEntry = (id: string, query: string, keywords: string[], daysAgo: number): HistoryEntry => ({
    id, query, keywords,
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  });

  const entries = [
    makeEntry("1", "AI in healthcare", ["AI", "healthcare"], 0),
    makeEntry("2", "Climate trends", ["climate", "environment"], 1),
    makeEntry("3", "AI market size", ["AI", "market"], 3),
    makeEntry("4", "Distributed ledger adoption", ["ledger", "crypto"], 10),
  ];

  it("searchHistory filters by query", () => {
    const r = searchHistory(entries, "AI");
    expect(r).toHaveLength(2);
  });

  it("searchHistory filters by keyword", () => {
    const r = searchHistory(entries, "climate");
    expect(r).toHaveLength(1);
  });

  it("searchHistory returns all when query empty", () => {
    expect(searchHistory(entries, "")).toHaveLength(4);
  });

  it("filterHistoryByKeyword matches exact keywords", () => {
    const r = filterHistoryByKeyword(entries, "AI");
    expect(r).toHaveLength(2);
  });

  it("getHistoryStats computes totals and top keywords", () => {
    const s = getHistoryStats(entries);
    expect(s.totalEntries).toBe(4);
    expect(s.uniqueQueries).toBe(4);
    expect(s.entriesLast7Days).toBe(3);
    expect(s.topKeywords[0].keyword).toBe("ai");
    expect(s.topKeywords[0].count).toBe(2);
  });

  it("groupHistoryByDate groups entries", () => {
    const groups = groupHistoryByDate(entries);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    const today = groups.find((g) => g.label === "Today");
    expect(today).toBeDefined();
    expect(today!.entries.length).toBe(1);
  });

  it("groupHistoryByDate localizes Today / Yesterday labels", () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const makeOnDate = (id: string, date: string): HistoryEntry => ({
      id, query: "q-" + id, keywords: [],
      createdAt: date + "T12:00:00.000Z",
    });
    const en = groupHistoryByDate([makeOnDate("1", today), makeOnDate("2", yesterday)], "en");
    const zh = groupHistoryByDate([makeOnDate("1", today), makeOnDate("2", yesterday)], "zh-CN");
    const ja = groupHistoryByDate([makeOnDate("1", today), makeOnDate("2", yesterday)], "ja");
    const ko = groupHistoryByDate([makeOnDate("1", today), makeOnDate("2", yesterday)], "ko");
    expect(en.find((g) => g.date === today)?.label).toBe("Today");
    expect(en.find((g) => g.date === yesterday)?.label).toBe("Yesterday");
    expect(zh.find((g) => g.date === today)?.label).toBe("今天");
    expect(zh.find((g) => g.date === yesterday)?.label).toBe("昨天");
    expect(ja.find((g) => g.date === today)?.label).toBe("今日");
    expect(ja.find((g) => g.date === yesterday)?.label).toBe("昨日");
    expect(ko.find((g) => g.date === today)?.label).toBe("오늘");
    expect(ko.find((g) => g.date === yesterday)?.label).toBe("어제");
    // Default (no-locale) path still falls back to English.
    const def = groupHistoryByDate([makeOnDate("1", today)]);
    expect(def.find((g) => g.date === today)?.label).toBe("Today");
  });

  it("exportHistoryJson produces valid JSON", () => {
    const json = exportHistoryJson(entries);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(4);
  });

  it("deduplicateHistoryEntries removes duplicate queries", () => {
    const dupes = [
      makeEntry("1", "AI trends", [], 0),
      makeEntry("2", "AI Trends", [], 1),
      makeEntry("3", "Blockchain", [], 0),
    ];
    expect(deduplicateHistoryEntries(dupes)).toHaveLength(2);
  });

  it("getRecentQueries returns last N queries", () => {
    const q = getRecentQueries(entries, 2);
    expect(q).toEqual(["AI in healthcare", "Climate trends"]);
  });

  it("historyToMarkdown generates markdown", () => {
    const md = historyToMarkdown(entries);
    expect(md).toContain("# Research History");
    expect(md).toContain("AI in healthcare");
  });

  it("createHistoryEntry can preserve the real research session id", () => {
    const entry = createHistoryEntry("AI market brief", ["ai"], {
      id: "sess_real_123",
      status: "completed",
      createdAt: "2026-06-30T00:00:00.000Z",
    });

    expect(entry).toMatchObject({
      id: "sess_real_123",
      query: "AI market brief",
      status: "completed",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
  });

  it("upsertHistoryEntry replaces duplicate queries instead of keeping stale random ids", () => {
    const stale = makeEntry("random-browser-id", "AI market brief", ["old"], 1);
    const fresh = createHistoryEntry("AI Market Brief", ["new"], {
      id: "sess_real_123",
      status: "completed",
      createdAt: "2026-06-30T00:00:00.000Z",
    });

    expect(upsertHistoryEntry([stale], fresh)).toEqual([fresh]);
  });
});

