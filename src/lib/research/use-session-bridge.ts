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
        // Hash points to a session we don't have — clear it after a moment
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
