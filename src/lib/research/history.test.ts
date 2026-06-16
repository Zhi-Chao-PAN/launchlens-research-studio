import { describe, it, expect, beforeEach } from "vitest";

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

import { formatRelativeTime } from "@/lib/research/history";

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
});
