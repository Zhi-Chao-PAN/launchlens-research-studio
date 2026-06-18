/// <reference types="vitest/globals" />
﻿import { describe, it, expect } from "vitest";
import {
  isValidSessionId, isShareableSession, getSessionStatusLabel,
  formatRelativeTime, summarizeCachedSessions, cachedSessionsEqual,
  cachedSessionsToCsv, tryParseShareHash,
} from "@/lib/research/use-session-bridge";

const make = (overrides: any = {}): any => ({
  sessionId: "abc123-xyz",
  query: "AI tools",
  status: "completed",
  savedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000 - 1000,
  ...overrides,
});

describe("use-session-bridge pure helpers (round 163)", () => {
  it("isValidSessionId accepts 6-64 [A-Za-z0-9_-]", () => {
    expect(isValidSessionId("abc123")).toBe(true);
    expect(isValidSessionId("a".repeat(64))).toBe(true);
    expect(isValidSessionId("short")).toBe(false);
    expect(isValidSessionId("bad id")).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId("")).toBe(false);
  });

  it("isShareableSession requires completed + valid id + query", () => {
    const rs = (overrides: any = {}) => ({ id: "abc123-xyz", query: "AI tools", status: "completed", agents: {}, citations: [], createdAt: "2024-01-01", updatedAt: "2024-01-01", keywords: [], ...overrides });
    expect(isShareableSession(rs())).toBe(true);
    expect(isShareableSession(rs({ status: "running" }))).toBe(false);
    expect(isShareableSession(rs({ id: "bad" }))).toBe(false);
    expect(isShareableSession(rs({ query: "   " }))).toBe(false);
    expect(isShareableSession(null)).toBe(false);
  });

  it("getSessionStatusLabel canonicalizes", () => {
    expect(getSessionStatusLabel(null)).toBe("idle");
    expect(getSessionStatusLabel(make({ status: "completed" }))).toBe("completed");
    expect(getSessionStatusLabel(make({ status: "running" }))).toBe("running");
    expect(getSessionStatusLabel(make({ status: "error" }))).toBe("error");
    expect(getSessionStatusLabel(make({ status: "weird" }))).toBe("unknown");
  });

  it("formatRelativeTime Chinese labels", () => {
    const NOW = 1_700_000_000_000;
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe("3 h ago");
    expect(formatRelativeTime(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe("2 d ago");
    expect(formatRelativeTime(NOW - 60 * 24 * 60 * 60_000, NOW)).toBe("2 mo ago");
    expect(formatRelativeTime(NOW - 365 * 24 * 60 * 60_000, NOW)).toBe("1 y ago");
  });

  it("summarizeCachedSessions tallies timestamps/completed", () => {
    const s = summarizeCachedSessions([make(), make({ sessionId: "run-session", status: "running", savedAt: 1_699_999_000_000 })]);
    expect(s.total).toBe(2);
    expect(s.completed).toBe(1);
    expect(s.newestTs).toBe(1_700_000_000_000);
    expect(s.oldestTs).toBe(1_699_999_000_000);
    expect(s.totalSizeChars).toBeGreaterThan(0);
    expect(summarizeCachedSessions([])).toEqual({ total: 0, completed: 0, newestTs: null, oldestTs: null, totalSizeChars: 0 });
  });

  it("cachedSessionsEqual compares key fields", () => {
    expect(cachedSessionsEqual(make(), make())).toBe(true);
    expect(cachedSessionsEqual(make(), make({ sessionId: "other" }))).toBe(false);
    expect(cachedSessionsEqual(make(), make({ status: "running" }))).toBe(false);
    expect(cachedSessionsEqual(make(), make({ savedAt: 1 }))).toBe(false);
  });

  it("cachedSessionsToCsv includes header and rows", () => {
    const csv = cachedSessionsToCsv([make()]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("sessionId,query,status,savedAt,createdAt");
    expect(row).toContain("abc123-xyz");
  });

  it("tryParseShareHash accepts hash with optional #", () => {
    expect(tryParseShareHash("#share:abc123")).toBe("abc123");
    expect(tryParseShareHash("share:abc123")).toBe("abc123");
    expect(tryParseShareHash("share:bad id")).toBeNull();
    expect(tryParseShareHash(null)).toBeNull();
    expect(tryParseShareHash("#other:abc")).toBeNull();
  });
});

