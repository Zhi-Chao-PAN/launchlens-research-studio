/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
﻿// Recent research history persisted in localStorage.
// Stores query + keywords + timestamp. Read on app boot, written on completion.
// Writes use requestIdleCallback to avoid blocking the main thread.

import { useEffect, useState, useCallback } from "react";

export interface HistoryEntry {
  id: string;
  query: string;
  keywords: string[];
  createdAt: string;
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

// In-memory cache + idle-callback writes for non-blocking persistence
let memoryCache: HistoryEntry[] | null = null;
let pendingWrite: HistoryEntry[] | null = null;
let writeScheduled = false;

function ensureCache(): HistoryEntry[] {
  if (memoryCache === null) {
    memoryCache = safeRead();
  }
  return memoryCache;
}

function scheduleWrite(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  pendingWrite = entries;
  if (writeScheduled) return;
  writeScheduled = true;

  const doWrite = () => {
    writeScheduled = false;
    if (pendingWrite === null) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingWrite));
    } catch {
      // localStorage may be full or disabled — fail silently
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(doWrite, { timeout: 1000 });
  } else {
    setTimeout(doWrite, 0);
  }
}

export function useResearchHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const entries = ensureCache();
    setHistory(entries);
    setHydrated(true);
  }, []);

  const addEntry = useCallback((query: string, keywords: string[]) => {
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      query: query.trim(),
      keywords: [...keywords],
      createdAt: new Date().toISOString(),
    };
    setHistory((prev) => {
      // Deduplicate identical query (case-insensitive), keep most recent
      const filtered = prev.filter(
        (e) => e.query.toLowerCase().trim() !== entry.query.toLowerCase().trim(),
      );
      const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
      memoryCache = next;
      scheduleWrite(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      memoryCache = next;
      scheduleWrite(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setHistory([]);
    memoryCache = [];
    scheduleWrite([]);
  }, []);

  return { history, addEntry, removeEntry, clearAll, hydrated };
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

/**
 * i18n-aware relative time formatter.
 * Accepts a format function (from useLocale().fmt) and returns localized strings.
 */
export function formatRelativeTimeI18n(
  iso: string,
  fmt: (key: string, vars: Record<string, string | number>, fallback?: string) => string,
  t: (key: string, fallback?: string) => string,
): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("time.justNow", "just now");
  const min = Math.floor(sec / 60);
  if (min < 60) return fmt(min === 1 ? "time.minuteAgo" : "time.minutesAgo", { n: min }, `${min}m ago`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return fmt(hr === 1 ? "time.hourAgo" : "time.hoursAgo", { n: hr }, `${hr}h ago`);
  const days = Math.floor(hr / 24);
  if (days < 7) return fmt(days === 1 ? "time.dayAgo" : "time.daysAgo", { n: days }, `${days}d ago`);
  return new Date(iso).toLocaleDateString();
}
