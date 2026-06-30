/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
// Recent research history persisted in localStorage.
// Stores query + keywords + timestamp. Read on app boot, written on completion.

import { useEffect, useState, useCallback } from "react";

export interface HistoryEntry {
  id: string;
  query: string;
  keywords: string[];
  createdAt: string;
  status?: "completed" | "failed" | "cancelled" | "running";
}

const STORAGE_KEY = "launchlens:research-history";
const MAX_ENTRIES = 12;

function safeRead(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown): e is HistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { id?: unknown }).id === "string" &&
        typeof (e as { query?: unknown }).query === "string",
    );
  } catch {
    return [];
  }
}

function safeWrite(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage may be full or disabled - fail silently
  }
}

export function useResearchHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHistory(safeRead());
    setHydrated(true);
  }, []);

  const addEntry = useCallback((
    query: string,
    keywords: string[],
    options: { id?: string; status?: HistoryEntry["status"]; createdAt?: string } = {},
  ) => {
    const entry = createHistoryEntry(query, keywords, options);
    setHistory((prev) => {
      const next = upsertHistoryEntry(prev, entry);
      safeWrite(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      safeWrite(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    safeWrite([]);
  }, []);

  return { history, addEntry, removeEntry, clearAll, hydrated };
}

export function createHistoryEntry(
  query: string,
  keywords: string[],
  options: { id?: string; status?: HistoryEntry["status"]; createdAt?: string } = {},
): HistoryEntry {
  return {
    id: options.id?.trim() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    query: query.trim(),
    keywords: [...keywords],
    createdAt: options.createdAt || new Date().toISOString(),
    ...(options.status ? { status: options.status } : {}),
  };
}

export function upsertHistoryEntry(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  limit: number = MAX_ENTRIES,
): HistoryEntry[] {
  const normalizedQuery = entry.query.toLowerCase().trim();
  const filtered = entries.filter((existing) => {
    if (existing.id === entry.id) return false;
    return existing.query.toLowerCase().trim() !== normalizedQuery;
  });
  return [entry, ...filtered].slice(0, limit);
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Non-hook utilities for history (round 139)                         */
/* ------------------------------------------------------------------ */

export function searchHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query.trim()) return entries;
  const q = query.toLowerCase();
  return entries.filter((e) =>
    e.query.toLowerCase().includes(q) ||
    e.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

export function filterHistoryByKeyword(entries: HistoryEntry[], keyword: string): HistoryEntry[] {
  const k = keyword.toLowerCase();
  return entries.filter((e) => e.keywords.some((kw) => kw.toLowerCase() === k));
}

export interface HistoryStats {
  totalEntries: number;
  uniqueQueries: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  entriesLast7Days: number;
  oldestEntry?: string;
  newestEntry?: string;
}

export function getHistoryStats(entries: HistoryEntry[]): HistoryStats {
  const kwCount = new Map<string, number>();
  let last7Days = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const queries = new Set<string>();

  for (const e of entries) {
    queries.add(e.query.toLowerCase());
    for (const kw of e.keywords) {
      kwCount.set(kw.toLowerCase(), (kwCount.get(kw.toLowerCase()) || 0) + 1);
    }
    const t = new Date(e.createdAt).getTime();
    if (t > weekAgo) last7Days++;
  }

  const topKeywords = Array.from(kwCount.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const sorted = [...entries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    totalEntries: entries.length,
    uniqueQueries: queries.size,
    topKeywords,
    entriesLast7Days: last7Days,
    oldestEntry: sorted[0]?.createdAt,
    newestEntry: sorted[sorted.length - 1]?.createdAt,
  };
}

export interface HistoryGroup {
  date: string;
  label: string;
  entries: HistoryEntry[];
}

export function groupHistoryByDate(entries: HistoryEntry[]): HistoryGroup[] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const date = e.createdAt.slice(0, 10);
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(e);
  }
  const result: HistoryGroup[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const [date, items] of groups) {
    let label = date;
    if (date === today) label = "Today";
    else if (date === yesterday) label = "Yesterday";
    result.push({ date, label, entries: items });
  }
  return result.sort((a, b) => b.date.localeCompare(a.date));
}

export function exportHistoryJson(entries: HistoryEntry[]): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
}

export function deduplicateHistoryEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  const result: HistoryEntry[] = [];
  for (const e of entries) {
    const key = e.query.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

export function getRecentQueries(entries: HistoryEntry[], limit: number = 5): string[] {
  return entries.slice(0, limit).map((e) => e.query);
}

export function historyToMarkdown(entries: HistoryEntry[]): string {
  const lines = ["# Research History", ""];
  const groups = groupHistoryByDate(entries);
  for (const g of groups) {
    lines.push("## " + g.label);
    lines.push("");
    for (const e of g.entries) {
      const kw = e.keywords.length ? " (" + e.keywords.join(", ") + ")" : "";
      lines.push("- **" + e.query + "**" + kw);
    }
    lines.push("");
  }
  return lines.join("\n");
}
