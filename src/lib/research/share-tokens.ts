/**
 * Server-side share token management.
 * Generates short-lived public tokens for sharing research results
 * without requiring admin authentication.
 * Persisted to disk if LAUNCHLENS_STORAGE_DIR is set.
 */

import crypto from "crypto";
import { getResearchRun, type ResearchRun } from "./storage";

export interface ShareToken {
  token: string;
  runId: string;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
  revoked: boolean;
}

const shareTokens = new Map<string, ShareToken>();

let shareStoragePath: string | null = null;

// Lazy-loaded fs/path for server-side disk persistence
let fsModule: typeof import("fs") | null = null;
let pathModule: typeof import("path") | null = null;

function getFs(): typeof import("fs") | null {
  if (typeof window !== "undefined") return null;
  if (fsModule) return fsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsModule = require("fs");
    return fsModule;
  } catch {
    return null;
  }
}

function getPath(): typeof import("path") | null {
  if (typeof window !== "undefined") return null;
  if (pathModule) return pathModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pathModule = require("path");
    return pathModule;
  } catch {
    return null;
  }
}

// Initialize disk persistence if storage dir configured
if (typeof window === "undefined" && process.env.LAUNCHLENS_STORAGE_DIR) {
  const fs = getFs();
  const path = getPath();
  if (fs && path) {
    const dir = process.env.LAUNCHLENS_STORAGE_DIR;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // ignore
    }
    shareStoragePath = path.join(dir, "share-tokens.json");
    if (fs.existsSync(shareStoragePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(shareStoragePath, "utf8"));
        for (const token of data) {
          shareTokens.set(token.token, token);
        }
      } catch {
        // Corrupted file, start fresh
      }
    }
  }
}

function persistShares() {
  if (!shareStoragePath || typeof window !== "undefined") return;
  const fs = getFs();
  if (!fs) return;
  try {
    const all = Array.from(shareTokens.values());
    fs.writeFileSync(shareStoragePath, JSON.stringify(all, null, 2));
  } catch {
    // Best effort
  }
}

export function createShareToken(
  runId: string,
  options: { expiresInMs?: number; maxViews?: number } = {},
): ShareToken {
  const token = crypto.randomBytes(12).toString("base64url");
  const now = Date.now();
  
  const share: ShareToken = {
    token,
    runId,
    createdAt: now,
    expiresAt: options.expiresInMs ? now + options.expiresInMs : null,
    views: 0,
    maxViews: options.maxViews || null,
    revoked: false,
  };

  shareTokens.set(token, share);
  persistShares();
  
  return share;
}

export function getShareToken(token: string): ShareToken | null {
  const share = shareTokens.get(token);
  if (!share) return null;
  if (share.revoked) return null;
  if (share.expiresAt && Date.now() > share.expiresAt) return null;
  if (share.maxViews && share.views >= share.maxViews) return null;
  return share;
}

export function getSharedRun(token: string): { run: ResearchRun; share: ShareToken } | null {
  const share = getShareToken(token);
  if (!share) return null;

  const run = getResearchRun(share.runId);
  if (!run) return null;

  share.views++;
  shareTokens.set(token, share);
  persistShares();

  return { run, share };
}

export function revokeShareToken(token: string): boolean {
  const share = shareTokens.get(token);
  if (!share) return false;
  
  share.revoked = true;
  shareTokens.set(token, share);
  persistShares();
  
  return true;
}

export function getSharesForRun(runId: string): ShareToken[] {
  return Array.from(shareTokens.values())
    .filter((s) => s.runId === runId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getShareStats(): { total: number; active: number; totalViews: number } {
  const all = Array.from(shareTokens.values());
  const active = all.filter((s) => !s.revoked && (!s.expiresAt || Date.now() < s.expiresAt));
  const totalViews = all.reduce((sum, s) => sum + s.views, 0);
  
  return {
    total: all.length,
    active: active.length,
    totalViews,
  };
}
