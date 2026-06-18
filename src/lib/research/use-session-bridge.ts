/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
"use client";

// Lightweight session bridge hook: persists session snapshots to localStorage
// when research completes, and exposes restoration + share helpers.

import { useCallback, useEffect, useState } from "react";
import {
  saveSessionSnapshot,
  getCachedSession,
  listCachedSessions,
  deleteCachedSession,
  clearAllCachedSessions,
  type CachedSession,
} from "@/lib/research/session-cache";
import { buildShareUrl, copyShareUrl, parseSessionFromHash, clearHash } from "@/lib/research/share";
import type { ResearchSession } from "@/lib/schema/research-schema";

export function useSessionBridge(currentSession: ResearchSession | null) {
  const [shareCopied, setShareCopied] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  // Persist on completion
  useEffect(() => {
    if (currentSession && currentSession.status === "completed") {
      saveSessionSnapshot(currentSession);
    }
  }, [currentSession]);

  // Detect share link in URL hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sharedId = parseSessionFromHash(window.location.hash);
    if (sharedId) {
      const cached = getCachedSession(sharedId);
      if (cached) {
        setPendingRestoreId(sharedId);
      } else {
        // Hash points to a session we don't have 鈥?clear it after a moment
        setTimeout(() => clearHash(), 100);
      }
    }
  }, []);

  const buildUrl = useCallback((sessionId: string): string => buildShareUrl(sessionId), []);
  const share = useCallback(async (sessionId: string): Promise<boolean> => {
    const ok = await copyShareUrl(sessionId);
    if (ok) {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
    return ok;
  }, []);

  const restore = useCallback((sessionId: string): CachedSession | null => {
    const cached = getCachedSession(sessionId);
    if (cached) {
      clearHash();
      setPendingRestoreId(null);
    }
    return cached ?? null;
  }, []);

  const dismissPending = useCallback(() => {
    clearHash();
    setPendingRestoreId(null);
  }, []);

  return {
    cached: listCachedSessions(),
    pendingRestoreId,
    pendingRestore: pendingRestoreId ? getCachedSession(pendingRestoreId) : null,
    dismissPending,
    restore,
    deleteCached: deleteCachedSession,
    clearAllCached: clearAllCachedSessions,
    buildShareUrl: buildUrl,
    share,
    shareCopied,
  };
}

/* ------------------------------------------------------------------ */
/*  Pure session-bridge helpers (round 163) 锟斤拷 no React, no DOM        */
/* ------------------------------------------------------------------ */
/*  Pure session-bridge helpers (round 163) - no React, no DOM        */
/* ------------------------------------------------------------------ */

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

export function isShareableSession(s: ResearchSession | null | undefined): boolean {
  if (!s) return false;
  if (s.status !== "completed") return false;
  if (!isValidSessionId(s.id)) return false;
  if (typeof s.query !== "string" || !s.query.trim()) return false;
  return true;
}

export type SessionStatusLabel = "idle" | "running" | "completed" | "error" | "unknown";
export function getSessionStatusLabel(s: ResearchSession | null | undefined): SessionStatusLabel {
  if (!s) return "idle";
  if (s.status === "completed" || s.status === "running" || s.status === "error") return s.status;
  return "unknown";
}

export function formatRelativeTime(ts: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return min + " min ago";
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return hrs + " h ago";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + " d ago";
  const months = Math.floor(days / 30);
  if (months < 12) return months + " mo ago";
  return Math.floor(months / 12) + " y ago";
}

export interface CachedSessionsSummary {
  total: number;
  completed: number;
  newestTs: number | null;
  oldestTs: number | null;
  totalSizeChars: number;
}

export function summarizeCachedSessions(sessions: CachedSession[]): CachedSessionsSummary {
  let completed = 0, newest = -Infinity, oldest = Infinity, totalSize = 0;
  for (const s of sessions) {
    if (s.status === "completed") completed++;
    const ts = s.savedAt ?? s.createdAt ?? 0;
    if (ts > newest) newest = ts;
    if (ts && ts < oldest) oldest = ts;
    try { totalSize += JSON.stringify(s).length; } catch { /* ignore */ }
  }
  return {
    total: sessions.length,
    completed,
    newestTs: sessions.length ? newest : null,
    oldestTs: sessions.length && oldest < Infinity ? oldest : null,
    totalSizeChars: totalSize,
  };
}

export function cachedSessionsEqual(a: CachedSession, b: CachedSession): boolean {
  if (a.sessionId !== b.sessionId) return false;
  if (a.status !== b.status || a.query !== b.query) return false;
  if ((a.savedAt ?? 0) !== (b.savedAt ?? 0)) return false;
  return true;
}

export function cachedSessionsToCsv(sessions: CachedSession[]): string {
  const header = "sessionId,query,status,savedAt,createdAt";
  const rows = sessions.map((s) => [
    s.sessionId, JSON.stringify((s.query || "").slice(0, 120)), s.status,
    s.savedAt ?? "", s.createdAt ?? "",
  ].join(","));
  return [header, ...rows].join("\n");
}

export function tryParseShareHash(hash: unknown): string | null {
  if (typeof hash !== "string") return null;
  const m = hash.match(/^#?share:([a-zA-Z0-9_-]{6,64})$/);
  return m ? m[1] : null;
}

